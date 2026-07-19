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

    get fn(): T {
        if (this.val == null) throw new Error(`[Delegate ${this.name}] is empty`);
        return this.val;
    }

    get inject() {
        return (target: T, ctx: ClassMethodDecoratorContext) => {
            if (this.val) throw new Error(`[Delegate ${this.name}] already settled`);
            if (!ctx.static) throw new Error(`[Delegate ${this.name}] can only use static method`);
            // deno-lint-ignore no-this-alias
            const self = this;
            ctx.addInitializer(function () { self.val = target.bind(this); });
        }
    }
}

export function Delegate<T extends Function>(meta: ImportMeta, name: string) {
    return new DelegateCls<T>(meta, name);
}

Deno.test("Delegate", () => {
    const Sum = Delegate<(...args: number[]) => number>(import.meta, "sum");

    class X {
        @Sum.inject
        static add(...args: number[]): number {
            return args.reduce((s, a) => s + a, 0);
        }
    }

    console.log(Sum.fn(1, 3));
});