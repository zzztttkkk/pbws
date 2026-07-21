import { encodebycls, version } from "./packet.ts";
import { AppError, ErrorCode } from "./errors.ts";
import { entry_state, globimport } from "./internal.ts";
import { IReportor, reportor } from "./pkgs/internal/reportor.ts";
import { load } from "./services.ts";
import { EmptyResponse, FailedResponse } from "./gen.ts";
import { Connection } from "./connection.ts";
import "./logger.ts";

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

let conn_seq = 0n;

@reportor
export class App<CS extends IConnState> implements IReportor {
    private config!: AppConfig;
    private impl!: IAppImpls<CS>;

    private services: Awaited<ReturnType<typeof load>> | null = null;
    private connections: Map<string, Connection<CS>> = new Map;

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
            kind: "PBWSApp",
            conns: this.connections.size,
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

    async notify<T>(obj: T & { constructor: ClassOf<T> }, connids: string[]) {
        const buf = await encodebycls(obj.constructor, 0, obj);
        if (!buf) return;
        for (const id of connids) {
            const conn = this.connections.get(id);
            if (!conn) continue;
            conn._notifyraw(buf);
        }
    }

    private async load() {
        await globimport(this.impl.globs ?? []);
        this.services = await load();
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
                    state = e instanceof Error ? e : new Error(`${Deno.inspect(e)}`);
                }
                if (state == null) {
                    return new Response(null, { status: 401 });
                }
                if (state instanceof Error) {
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
                        const handle = this.services!.get(msgid);
                        if (!handle) {
                            return conn.fail(reqid, ErrorCode.MsgIdNotFound, { msg: `handle notfound, ${msgid} version: ${version()}` });
                        }
                        return conn._run(
                            async () => {
                                let resp: any;
                                try {
                                    resp = await handle.fnc(msg);
                                } catch (e) {
                                    let msg: FailedResponse;
                                    if (e instanceof AppError) {
                                        msg = e.toresp();
                                        logger.error("app: code error", { code: e.code, msg: e.message, meta: e.meta, stack: e.stack, csid: conn.state.id, handle: handle.name });
                                    } else {
                                        msg = new FailedResponse();
                                        msg.code = ErrorCode.InternalError;
                                        msg.message = "Internal server error";
                                        logger.error("app: unexpected serve error", { e: e, stack: e instanceof Error ? e.stack : null, csid: conn.state.id, handle: handle.name });
                                    }
                                    const buf = await encodebycls(FailedResponse, reqid, msg);
                                    socket.send(buf!);
                                    return;
                                }
                                if (resp == null) {
                                    socket.send(await encodebycls(EmptyResponse, reqid, new EmptyResponse));
                                    return;
                                }
                                if (typeof resp !== "object") {
                                    logger.error(`app: the serve response is not an object`, { resp, csid: conn.state.id, handle: handle.name });
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
