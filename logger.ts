import { Appender, combine, ConsoleAppender } from "./pkgs/logger/appender.ts";
import { AsyncFileAppender, RotationKind } from "./pkgs/logger/fs.appender.ts";
import { Item, Level } from "./pkgs/logger/item.ts";
import { AbsLogger, logger as make, With } from "./pkgs/logger/logger.ts";
import path from "node:path";
import { JSONLRenderer, LineRenderer, SimpleLineRenderer } from "./pkgs/logger/renderer.ts";
import "./pkgs/internal/process.ts";
import fs from "node:fs/promises";

export interface ILoggingConfig {
    minlevel?: Level;

    fmt?: "simple" | "json";
    timelayout?: string;


    // enable file logging
    dir?: string;
    dirmode?: number;
    name?: string;
    rotate?: RotationKind;
    bufsize?: number;
    noconsole?: boolean;
    colorful?: boolean;
}

let defaultlogger: AbsLogger | null = (() => {
    const ca = new ConsoleAppender();
    const renderer = new SimpleLineRenderer({ timelayout: "yyyy-MM-dd HH:mm:ss.SSS" });
    class DummyLogger extends AbsLogger {
        protected override dispatch(_item: Item): { renderer: LineRenderer; appender: Appender; } | null | undefined {
            return {
                renderer: renderer,
                appender: ca,
            };
        }
        public override close(): Promise<void> {
            this._closed = true;
            return Promise.resolve();
        }
    }
    return new DummyLogger();
})();


function mount() {
    Object.defineProperty(defaultlogger, "scope", { value: With, enumerable: false, });

    Object.defineProperty(globalThis, "logger", { value: defaultlogger, enumerable: false, });
}

mount();

let initialized = false;
export async function init(cfg?: ILoggingConfig) {
    if (initialized) throw new Error("logger already initialized");
    initialized = true;

    cfg = cfg ?? {};
    cfg.minlevel ??= Level.Trace;
    cfg.fmt ??= "simple";

    const ca = new ConsoleAppender();

    const appenders = new Array<Appender>(Level.Error + 1);
    if (cfg.dir) {
        const dir = path.resolve(cfg.dir);

        await fs.mkdir(dir, { recursive: true, mode: cfg.dirmode ?? 0o755 });

        const name = path.basename(cfg.name || "pbws");

        let normalappender: Appender = new AsyncFileAppender(path.join(dir, `${name}.log`), { rotation: cfg.rotate, bufsize: cfg.bufsize });
        let errorappender: Appender = new AsyncFileAppender(path.join(dir, `${name}.error.log`), { rotation: cfg.rotate, bufsize: cfg.bufsize });
        if (!cfg.noconsole) {
            normalappender = combine(ca, normalappender);
            errorappender = combine(ca, errorappender);
        }
        appenders.fill(normalappender);
        appenders[Level.Error] = errorappender;
    } else {
        appenders.fill(ca);
    }
    const fmt: LineRenderer = cfg.fmt === "json"
        ?
        new JSONLRenderer({ timelayout: cfg.timelayout })
        :
        new SimpleLineRenderer({ timelayout: cfg.timelayout, colorful: cfg.colorful });

    defaultlogger = make((item) => {
        if (item.level < cfg.minlevel!) return;
        return {
            renderer: fmt,
            appender: appenders[item.level],
        }
    });

    mount();

    process.RegisterBeforeShutdownAction(
        () => {
            return defaultlogger?.close();
        },
        process.Order.Last,
    );
}

declare global {
    var logger: AbsLogger & { scope: typeof With };
}

Deno.test("logger.simple", async () => {
    await init({});

    logger.info("hello world");

    logger.scope({ a: 1 }, () => {
        logger.info("hello world", "ss", false);
    });
});

Deno.test("logger.file", async () => {
    await init({ dir: "./logs", fmt: "json", timelayout: "YYYY-MM-DD HH:mm:ss.SSS" });

    logger.info("hello world");

    logger.scope({ a: 1 }, () => {
        logger.info("hello world", "ss", false);
    });

    await logger.close();
});