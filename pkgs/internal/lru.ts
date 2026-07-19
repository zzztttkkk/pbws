import { List, Node } from "./list.ts";
import { reportor, IReportor } from "./reportor.ts";

interface Pair<K, V> {
    k: K;
    val: V;
    at: number;
}

@reportor
export class LRUMap<K, V> implements IReportor {
    private _name: string;
    private _capacity: number;
    private _expire: number;
    private _vals: List<Pair<K, V>> = new List();
    private _map: Map<K, Node<Pair<K, V>>> = new Map();

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

        return [
            `LRUMap: ${this._name} cap: ${this._capacity};`,
            `ttl: ${this._expire}; size: ${this._map.size};`,
            `maxttl: ${now - min_at}; avgttl: ${now - avg_at}`
        ].join(" ");
    }

    private tohead(node: Node<Pair<K, V>>) {
        this._vals.pushl(this._vals.unlink(node));
    }

    private clean() {
        while (this._map.size > this._capacity) {
            const node = this._vals.popr();
            if (!node) break;
            this._map.delete(node.val.k);
        }
    }

    set(key: K, val: V) {
        const node = this._map.get(key);
        if (node) {
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
        const node = this._map.get(key);
        if (!node) return undefined;

        const is_expired =
            this._expire > 0 && (node.val.at + this._expire) <= Date.now();
        if (!is_expired) {
            this.tohead(node);
            return node.val.val;
        }
        this._vals.unlink(node);
        this._map.delete(key);
        return undefined;
    }

    del(key: K) {
        const node = this._map.get(key);
        if (!node) return;
        this._vals.unlink(node);
        this._map.delete(key);
    }
}

Deno.test("LRUMap", () => {
    console.log(new LRUMap("xx", 10, 0));
});