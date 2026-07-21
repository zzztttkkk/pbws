import { AsyncLocalStorage } from "node:async_hooks";
import { RwLock } from "./pkgs/sync/index.ts";
import { AppError } from "./errors.ts";
import { decode, encodebycls } from "./packet.ts";
import { FailedResponse } from "./gen.ts";
import "./logger.ts";

export interface IConnectionOpts {
    onclose: () => void;
    onmsg: (msg: { msgid: number, reqid: number, msg: any }) => Promise<void>;
}

const ConnStateStorage = new AsyncLocalStorage<Connection<any>>();

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
                try {
                    const buf = Buffer.from(rawmsg);
                    await this.opts.onmsg(await decode(buf));
                } catch (e) {
                    logger.error(
                        "connection: fatal error in handling",
                        { e, csid: this.state.id, stack: e instanceof Error ? e.stack : null }
                    );
                    this.close();
                }
            });
        });
        this.sock.addEventListener("close", () => {
            this.closed = true;
            this.opts.onclose();
        });
        this.sock.addEventListener("error", (e) => {
            logger.error("connection: socket error", { e, csid: this.state.id, });
        });
    }

    async fail(reqid: number, code: number, opts?: { msg?: string, exts?: any }) {
        if (this.closed) return;
        const resp = new AppError(code, opts?.msg, opts?.exts).toresp();
        this.sock.send(await encodebycls(FailedResponse, reqid, resp));
    }

    async notify<T>(obj: T & { constructor: ClassOf<T> }) {
        if (this.closed) return;
        this.sock.send(await encodebycls(obj.constructor, 0, obj));
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

export function connection<T extends { id: string }>(): Connection<T> | null {
    return ConnStateStorage.getStore() ?? null;
}