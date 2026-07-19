import { List, Node } from "./list.ts";
import { reportor, IReportor, Config } from "./reportor.ts";

interface Pair<K, V> {
    k: K;
    val: V;
    at: number;
}

class Counter {
    set: bigint = 0n;
    update: bigint = 0n;

    get: bigint = 0n;
    get_hit: bigint = 0n;
    get_expired: bigint = 0n;

    delete: bigint = 0n;

    evict: bigint = 0n;

    incr<K extends KeysOnly<Counter, bigint>>(key: K) {
        if (!Config.detail) return;
        this[key] += 1n;
    }

    toJSON() {
        const obj = {};
        for (const key of Object.keys(this)) {
            obj[key] = (this[key] as bigint).toString();
        }
        return obj;
    }
}

@reportor
export class LRUMap<K, V> implements IReportor {
    private _name: string;
    private _capacity: number;
    private _expire: number;
    private _vals: List<Pair<K, V>> = new List();
    private _map: Map<K, Node<Pair<K, V>>> = new Map();
    private _counter = new Counter();

    constructor(name: string, capacity: number, expire: number) {
        if (capacity < 1) throw new Error("capacity must be at least 1");
        this._capacity = capacity;
        this._expire = expire;
        this._name = name;
    }

    /** @internal */
    report(): string {
        const now = Date.now();
        let min_at = now;
        let sum_of_at = 0n;
        let avg_at = 0;
        if (this._expire > 0 && this._map.size > 0) {
            for (const pair of this._vals) {
                sum_of_at += BigInt(pair.at);
                if (pair.at < min_at) {
                    min_at = pair.at;
                }
            }
            avg_at = (Number(sum_of_at / BigInt(this._map.size)));
        }

        return JSON.stringify({
            kind: "LRUMap",
            name: this._name,
            capacity: this._capacity,
            expire: this._expire,
            size: this._map.size,
            maxage: now - min_at,
            avgage: now - avg_at,
            counters: this._counter,
        });
    }

    private tohead(node: Node<Pair<K, V>>) {
        this._vals.pushl(this._vals.unlink(node));
    }

    private clean() {
        while (this._map.size > this._capacity) {
            const node = this._vals.popr();
            if (!node) break;
            this._counter.incr("evict");
            this._map.delete(node.val.k);
        }
    }

    set(key: K, val: V) {
        this._counter.incr("set");

        const node = this._map.get(key);
        if (node) {
            this._counter.incr("update");

            node.val.val = val;
            node.val.at = Date.now();
            this.tohead(node);
            return;
        }
        this._map.set(
            key,
            this._vals.pushl(
                this._vals.mknode({ k: key, val, at: Date.now() })
            )
        );
        this.clean();
    }

    get(key: K): V | undefined {
        this._counter.incr("get");

        const node = this._map.get(key);
        if (!node) return undefined;

        const is_expired =
            this._expire > 0 && (node.val.at + this._expire) <= Date.now();
        if (!is_expired) {
            this._counter.incr("get_hit");

            this.tohead(node);
            return node.val.val;
        }

        this._counter.incr("get_expired");

        this._vals.unlink(node);
        this._map.delete(key);
        return undefined;
    }

    del(key: K) {
        this._counter.incr("delete");

        const node = this._map.get(key);
        if (!node) return;

        this._vals.unlink(node);
        this._map.delete(key);
    }
}

Deno.test("LRUMap", () => {
    console.log(new LRUMap("xx", 10, 0).report());
});