import "./pkgs/global.d.ts";

export * from "./app.ts";
export * from "./gen.ts";
export * from "./packet.ts";

export * as zip from "./zip.ts";
export * as reflection from "./pkgs/reflection/index.ts";
export * as sync from "./pkgs/sync/index.ts";

import "./pkgs/internal/process.ts";
import { Delegate } from "./pkgs/internal/delegate.ts";
import { LRUMap } from "./pkgs/internal/lru.ts";

export const utils = Object.freeze({
    LRUMap,
    Delegate,
});
