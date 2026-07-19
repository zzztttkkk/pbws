import * as path from "node:path";
import * as url from "node:url";

class DelegateCls<T extends Function> {
    private readonly name: string;
    private val: T | undefined = undefined;

    constructor(meta: ImportMeta, name: string) {
        this.name = `./${path
            .relative(process.cwd(), url.fileURLToPath(meta.url))
            .replaceAll(path.sep, "/")}#${name}`;
    }

    private expose(): T {
        if (this.val == null) {
            throw new Error(`unfilled hole: ${this.name}`);
        }
        return this.val;
    }

    get func(): T & { fill: (fn: T) => void; } {
        const fnc = (...args: any) => this.expose()(...args);
        Object.defineProperty(
            fnc,
            "fill",
            {
                value: (v: T) => {
                    this.val = v;
                },
                writable: false
            }
        )
        return fnc as any;
    }

    set func(v: T) {
        this.val = v;
    }
}

export function Delegate<T extends Function>(meta: ImportMeta, name: string) {
    return new DelegateCls<T>(meta, name).func;
}