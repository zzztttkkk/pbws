export class SingleFlight<Args extends any[], T> {
    private store: Map<string, Promise<T>>;
    private dofnc: (...args: Args) => Promise<T>;
    private keyfnc: (...args: Args) => string;

    constructor(
        fnc: (...args: Args) => Promise<T>,
        keyfnc: (...args: Args) => string,
    ) {
        this.store = new Map();
        this.dofnc = fnc;
        this.keyfnc = keyfnc;
    }

    exec(...args: Args): Promise<T> {
        const key = this.keyfnc(...args);
        let ps = this.store.get(key);
        if (!ps) {
            ps = (async () => {
                try {
                    const val = await this.dofnc(...args);
                    return val;
                } finally {
                    this.store.delete(key);
                }
            })();
            this.store.set(key, ps);
        }
        return ps;
    }
}
