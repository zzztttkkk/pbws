export interface IReportor {
    report(): string;
}

const AllReportors = new Set<WeakRef<IReportor>>();

export function collect(): string {
    const buf = [] as string[];

    const deads = [] as WeakRef<IReportor>[];
    for (const ref of AllReportors) {
        const reportor = ref.deref();
        if (!reportor) {
            deads.push(ref);
            continue;
        }
        buf.push(reportor.report())
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