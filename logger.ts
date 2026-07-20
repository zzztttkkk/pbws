import { Appender, ConsoleAppender } from "./pkgs/logger/appender.ts";
import { AsyncFileAppender, RotationKind } from "./pkgs/logger/fs.appender.ts";
import { Level } from "./pkgs/logger/item.ts";
import { AbsLogger, logger as make, With } from "./pkgs/logger/logger.ts";
import path from "node:path";
import { JSONLRenderer, LineRenderer, SimpleLineRenderer } from "./pkgs/logger/renderer.ts";
import "./pkgs/internal/process.ts";

interface ILoggingConifg {
    minlevel?: Level;

    fmt?: "simple" | "json";
    timelayout?: string;

    // enable file logging
    dir?: string;
    name?: string;
    rotate?: RotationKind;
    bufsize?: number;
}

let defaultlogger: AbsLogger | null = null;

export function init(cfg?: ILoggingConifg) {
    cfg = cfg ?? {};
    cfg.minlevel ??= Level.Trace;
    cfg.fmt ??= "simple";

    const appenders = [] as Appender[];
    if (cfg.dir) {
        const name = cfg.name || "pbws";
        for (let i = cfg.minlevel; i <= Level.Error; i++) {
            appenders.push(new AsyncFileAppender(path.join(cfg.dir, `${name}.${Level[i].toLowerCase()}.log`), { rotation: cfg.rotate, bufsize: cfg.bufsize }));
        }
    } else {
        const ca = new ConsoleAppender();
        for (let i = cfg.minlevel; i <= Level.Error; i++) {
            appenders.push(ca);
        }
    }
    const fmt: LineRenderer = cfg.fmt === "json" ? new JSONLRenderer : new SimpleLineRenderer;

    defaultlogger = make((item) => {
        if (item.level < cfg.minlevel!) return;
        return {
            renderer: fmt,
            appender: appenders[item.level],
        }
    });

    Object.defineProperty(defaultlogger, "scope", { value: With, enumerable: false, });

    Object.defineProperty(globalThis, "logger", { value: defaultlogger, enumerable: false, });

    process.RegisterBeforeShutdownAction(() => defaultlogger!.close());
}

declare global {
    namespace logger {
        function scope<R>(meta: { [k: string]: any }, fn: () => R): R;

        function trace(msg: string, ...args: any[]): Promise<void>;
        function debug(msg: string, ...args: any[]): Promise<void>;
        function info(msg: string, ...args: any[]): Promise<void>;
        function warn(msg: string, ...args: any[]): Promise<void>;
        function error(msg: string, ...args: any[]): Promise<void>;
    }
}


Deno.test("logger", () => {
    init();

    logger.info("hello world");

    logger.scope({ a: 1 }, () => {
        logger.info("hello world");
    });
});