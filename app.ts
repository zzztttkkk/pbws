import { EmptyResponse } from "./gen.ts";
import { decode, encodebycls, msginfobyname, version } from "./packet.ts";
import * as reflection from "./pkgs/reflection/index.ts";
import { AppError, ErrorCode, FailedResponse } from "./errors.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import { RwLock } from "./pkgs/sync/index.ts";
import { entry_state, globimport } from "./internal.ts";
import { Counter, IReportor, reportor, Config as ReportorConfig } from "./pkgs/internal/reportor.ts";

export class AppConfig {
    hostname?: string;
    port?: number;
    debug?: boolean;
    compress?: number;
    idletimeout?: number;
}

export interface IConnState {
    id: string;
}

export interface IAppImpls<CS extends IConnState> {
    globs?: string[];
    auth(req: Request, info: Deno.ServeHandlerInfo): Promise<CS | Error | null>;
}

export interface IServeProps {
    label?: string;
    description?: string;
    readonly?: boolean;
    tags?: string[];
}

const reg = new reflection.MetaRegister<{}, {}, IServeProps>(Symbol("fv.pkgs.pb.serve"));

export function serve(opts: Parameters<typeof reg.method>[0]) { return reg.method(opts); }

enum AppCountKind {
    AuthFailed,
    ServeFailed,
    InternalError,
}

@reportor
export class App<CS extends IConnState> implements IReportor {
    private config!: AppConfig;
    private impl!: IAppImpls<CS>;

    private services: Map<number, { fnc: (v: any) => Promise<any>; opts?: IServeProps; name: string; }> = new Map;
    private connections: Map<string, Connection<CS>> = new Map;
    private counter = new Counter(AppCountKind, true);

    private server: Deno.HttpServer | null = null;

    constructor(cfg: AppConfig, impl: IAppImpls<CS>) {
        this.config = cfg;
        this.impl = impl;

        if (entry_state.gen_executed) {
            throw new Error("App cannot be instantiated after gen() has been executed. Run the application in a separate entry without gen().");
        }
        entry_state.app_instantiated = true;
    }

    report(): string {
        return JSON.stringify({
            kind: "App",
            conns: this.connections.size,
            counter: this.counter,
        });
    }

    pick(connids: Iterable<string>): Generator<Connection<CS>> {
        // deno-lint-ignore no-this-alias
        const self = this;
        return (function* () {
            for (const id of connids) {
                const conn = self.connections.get(id);
                if (conn) yield conn;
            }
        })();
    }

    async notify(obj: object, connids: string[]) {
        const buf = await encodebycls(obj.constructor as any, 0, obj);
        if (!buf) return;
        for (const id of connids) {
            const conn = this.connections.get(id);
            if (!conn) continue;
            conn._notifyraw(buf);
        }
    }

    private async load() {
        await globimport(this.impl.globs ?? []);

        for (const cls of reg.AllClses) {
            const meta = reflection.metainfo(reg, cls);
            const methods = meta.methods();
            if (!methods) continue;
            const ins = new (cls as { new(): any })();
            for (const [name, method] of methods) {
                if (!method.paramtypes || method.paramtypes.length != 1) {
                    throw new Error(`${cls.name}.${name} must have only one param`);
                }
                const input_type = method.paramtypes[0];
                if (!input_type) throw new Error(`${cls.name}.${name}'s input type not found`);
                if (typeof input_type !== "function") {
                    throw new Error(`${cls.name}.${name}'s input type must be function`);
                }
                const inputinfo = msginfobyname(input_type.name);
                if (!inputinfo) throw new Error(`${name} not found`);
                if (inputinfo.opts?.kind !== "request") throw new Error(`${cls.name}.${name}'s input type must be request`);

                const output_type = method.returntype || EmptyResponse;
                if (typeof output_type !== "function") {
                    throw new Error(`${cls.name}.${name}'s output type must be function`);
                }
                const outputinfo = msginfobyname(output_type.name);
                if (!outputinfo) throw new Error(`${cls.name}.${name}'s output type not found`);
                if (outputinfo.opts?.kind !== "response") throw new Error(`${cls.name}.${name}'s output type must be response`);

                if (this.services.has(inputinfo.id)) {
                    throw new Error(`${cls.name}.${name}'s input type already registered`);
                }
                this.services.set(inputinfo.id, { fnc: async (v: any) => ins[name](v), opts: method.opts, name: `${cls.name}.${name}` });
            }
        }
    }

    async run(path: string, opts?: { httphandler?: Deno.ServeHandler<Deno.NetAddr>; }) {
        if (this.server) throw new Error(`server already running, please stop it first before running it again`);

        await this.load();

        this.server = Deno.serve(
            {
                hostname: this.config.hostname,
                port: this.config.port,
            },
            async (req, info) => {
                if (!req.url.startsWith(path)) {
                    if (opts?.httphandler) {
                        return opts.httphandler(req, info);
                    }
                    return new Response(null, { status: 404 });
                }

                let state: CS | Error | null = null;
                try {
                    state = await this.impl.auth(req, info);
                } catch (e) {
                    if (!(e instanceof Error)) {
                        state = new Error(`${Deno.inspect(e)}`);
                    }
                }
                if (state == null) {
                    this.counter.incr(AppCountKind.AuthFailed);
                    return new Response(null, { status: 401 });
                }
                if (state instanceof Error) {
                    this.counter.incr(AppCountKind.AuthFailed);
                    return new Response(null, { status: 401 });
                }

                const { socket, response } = Deno.upgradeWebSocket(req, { idleTimeout: this.config.idletimeout ?? 60 });

                const seq = conn_seq++;
                // deno-lint-ignore prefer-const
                let conn: Connection<CS>;
                conn = new Connection<CS>(seq, socket, state, {
                    onclose: () => {
                        const obj = this.connections.get(state.id);
                        if (!obj || obj.seq !== seq) return;
                        this.connections.delete(state.id);
                    },
                    onmsg: ({ msgid, reqid, msg }) => {
                        const handle = this.services.get(msgid);
                        if (!handle) {
                            return conn.fail(reqid, ErrorCode.MsgIdNotFound, { msg: `handle notfound, ${msgid} version: ${version()}` });
                        }
                        return conn._run(
                            async () => {
                                let resp: any;
                                try {
                                    resp = await handle.fnc(msg);
                                } catch (e) {
                                    this.counter.incr(AppCountKind.ServeFailed);
                                    let msg: FailedResponse;
                                    if (e instanceof AppError) {
                                        msg = e.toresp();
                                        console.error("AppError:", msg);
                                    } else {
                                        this.counter.incr(AppCountKind.InternalError);
                                        msg = new FailedResponse();
                                        msg.code = ErrorCode.InternalError;
                                        msg.message = "Internal server error";
                                        console.error("Unexpected error:", e);
                                    }
                                    const buf = await encodebycls(FailedResponse, reqid, msg);
                                    socket.send(buf!);
                                    return;
                                }
                                if (typeof resp !== "object") {
                                    console.error(`response must be object, ${msgid}, ${Deno.inspect(resp)}`);
                                    return conn.fail(reqid, ErrorCode.InternalError);
                                }
                                socket.send(await encodebycls(resp.constructor, reqid, resp));
                            },
                            handle.opts?.readonly
                        )
                    },
                });

                const prev = this.connections.get(state.id);
                if (prev) prev.close();

                conn.setup();
                this.connections.set(state.id, conn);

                return response;
            });
    }

    stop() {
        if (!this.server) throw new Error(`server not running`);
        this.server.shutdown();
        this.server = null;
    }
}

interface IConnectionOpts {
    onclose: () => void;
    onmsg: (msg: { msgid: number, reqid: number, msg: any }) => Promise<void>;
}

const ConnStateStorage = new AsyncLocalStorage<Connection<any>>();

let conn_seq = 0n;

export class Connection<T extends { id: string }> {
    readonly state!: T;
    readonly seq: bigint;

    private sock!: WebSocket;
    private opts!: IConnectionOpts;
    private closed = false;
    private readonly lock: RwLock;

    constructor(seq: bigint, ws: WebSocket, cs: T, opts: IConnectionOpts) {
        this.seq = seq;
        this.sock = ws;
        this.state = cs;
        this.opts = opts;
        this.lock = new RwLock();
    }

    setup() {
        this.sock.binaryType = "arraybuffer";

        this.sock.addEventListener("message", (evt) => {
            if (this.closed) return;
            if (typeof evt.data === "string") return;

            const rawmsg = evt.data as ArrayBuffer;

            ConnStateStorage.run(this, async () => {
                const buf = Buffer.from(rawmsg);
                try {
                    await this.opts.onmsg(await decode(buf));
                } catch (e) {
                    console.error("fatal error in handling", e);
                    this.close();
                }
            });
        });
        this.sock.addEventListener("close", () => {
            this.closed = true;
            this.opts.onclose();
        });
        this.sock.addEventListener("error", (e) => {
            console.error(e);
        });
    }

    async fail(reqid: number, code: number, opts?: { msg?: string, exts?: any }) {
        if (this.closed) return;
        const resp = new AppError(code, opts?.msg, opts?.exts).toresp();
        this.sock.send(await encodebycls(FailedResponse, reqid, resp));
    }

    async notify(obj: object) {
        if (this.closed) return;
        this.sock.send(await encodebycls(obj.constructor as any, 0, obj));
    }

    /** @internal */
    _notifyraw(buf: Buffer) {
        if (this.closed) return;
        this.sock.send(buf);
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        this.sock.close();
    }

    async _run(fnc: () => Promise<void>, readonly?: boolean) {
        await using _ = readonly
            ? await this.lock.acquirer()
            : await this.lock.acquirew();
        if (this.closed) return;
        await fnc();
    }
}