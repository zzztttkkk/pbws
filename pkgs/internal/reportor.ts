export interface IReportor {
    report(): string;
}

const AllReportors = new Set<WeakRef<IReportor> | IReportor>();

export const Config = {
    detail: false,
};

export function collect(): string {
    const buf = [] as string[];

    const deads = [] as WeakRef<IReportor>[];
    for (const ele of AllReportors) {
        if (ele instanceof WeakRef) {
            const reportor = ele.deref();
            if (!reportor) {
                deads.push(ele);
                continue;
            }
            buf.push(reportor.report());
            continue;
        }
        buf.push(ele.report());
    }
    for (const ref of deads) {
        AllReportors.delete(ref);
    }
    return buf.join('\n');
}

export function reportor<T extends { new(...args: any): IReportor }>(target: T, _ctx: ClassDecoratorContext) {
    const ncls = class extends target {
        constructor(...args: any[]) {
            super(...args);
            AllReportors.add(new WeakRef(this));
        }
    } as T;
    Object.defineProperty(ncls, 'name', { value: target.name });
    return ncls;
}

AllReportors.add({
    report(): string {
        return JSON.stringify({
            kind: "Sys",
            heap: Deno.memoryUsage(),
            load: Deno.loadavg(),
        });
    }
});


Deno.test("collect", () => {
    console.log(collect());
});

export class Counter<E extends Record<number, string>> {
    private nums = [] as bigint[];
    private keys = [] as { idx: number, name: string }[];
    private respectdetail = false;

    constructor(enums: E, respectdetail?: boolean) {
        let max = 0;
        for (const [k, v] of Object.entries(enums)) {
            if (typeof v === 'number') {
                if (v < 0 || !Number.isSafeInteger(v)) {
                    throw new Error("enum value must be safe uint");
                }
                max = Math.max(max, v);
                this.keys.push({ idx: v, name: k });
            }
        }
        if (max > 256) {
            throw new Error("enum max value is too large");
        }
        this.nums = new Array(max + 1).fill(0n);
        this.respectdetail = respectdetail || false;
    }

    incr(key: E[keyof E]) {
        if (this.respectdetail && !Config.detail) return;
        this.nums[key as number] += 1n;
    }

    toJSON() {
        const obj = {};
        for (const key of this.keys) {
            obj[key.name] = this.nums[key.idx].toString();
        }
        return obj;
    }
}


Deno.test("Counter", () => {
    enum X {
        A,
        B,
        C = 40,
    }

    const counter = new Counter(X);

    counter.incr(X.A);

    console.log(counter.toJSON());
});
