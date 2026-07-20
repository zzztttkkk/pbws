import "./pkgs/global.d.ts";

export * from "./app.ts";
export * from "./connection.ts";
export * from "./errors.ts";
export * from "./gen.ts";
export { version, loadproto } from "./packet.ts";
export { type IServeProps, serve } from "./services.ts";

export * as zip from "./zip.ts";
export * as reflection from "./pkgs/reflection/index.ts";
export * as sync from "./pkgs/sync/index.ts";

import "./pkgs/internal/process.ts";
import { Delegate } from "./pkgs/internal/delegate.ts";
import { LRUMap } from "./pkgs/internal/lru.ts";
import { sleep } from "./pkgs/internal/sleep.ts";
import * as reportor from "./pkgs/internal/reportor.ts";

export const utils = Object.freeze({
    LRUMap,
    Delegate,
    sleep,
    reportor,
});
