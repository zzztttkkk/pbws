import { glob } from "node:fs/promises";

export const entry_state = {
    app_instantiated: false,
    gen_executed: false,
};

export async function globimport(globs: string[]) {
    const files = glob(globs);
    for await (const file of files) {
        if (file.endsWith(".js")) {
            await import(file);
        }
    }
}

import { type FailedResponse } from "./gen.ts";
import { Delegate } from "./pkgs/internal/delegate.ts";

export const FailedResponseConstructor = Delegate<() => FailedResponse>(import.meta, "FailedResponse");
