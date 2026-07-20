import { Appender, combine, ConsoleAppender } from "./pkgs/logger/appender.ts";
import { AsyncFileAppender, RotationKind } from "./pkgs/logger/fs.appender.ts";
import { Level } from "./pkgs/logger/item.ts";
import { AbsLogger, logger as make, With } from "./pkgs/logger/logger.ts";
import path from "node:path";
import { JSONLRenderer, LineRenderer, SimpleLineRenderer } from "./pkgs/logger/renderer.ts";
import "./pkgs/internal/process.ts";
import fs from "node:fs/promises";

interface ILoggingConifg {
    minlevel?: Level;

    fmt?: "simple" | "json";
    timelayout?: string;


    // enable file logging
    dir?: string;
    mode?: number;
    name?: string;
    rotate?: RotationKind;
    bufsize?: number;
    noconsole?: boolean;
    colorful?: boolean;
}

let defaultlogger: AbsLogger | null = null;

export async function init(cfg?: ILoggingConifg) {
    cfg = cfg ?? {};
    cfg.minlevel ??= Level.Trace;
    cfg.fmt ??= "simple";

    const ca = new ConsoleAppender();

    const appenders = new Array<Appender>(Level.Error + 1);
    if (cfg.dir) {
        const dir = path.resolve(cfg.dir);

        await fs.mkdir(dir, { recursive: true, mode: cfg.mode ?? 0o755 });

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

    Object.defineProperty(defaultlogger, "scope", { value: With, enumerable: false, });

    Object.defineProperty(globalThis, "logger", { value: defaultlogger, enumerable: false, });

    process.RegisterBeforeShutdownAction(() => {
        return defaultlogger?.close();
    });
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