import { inspect } from "node:util";
import { Queue } from "./stack.ts";

type Waiter = () => void;

export class LockError extends Error { };

export class Lock {
	private locked = false;
	private readonly waiters: Queue<Waiter>;

	constructor() {
		this.waiters = new Queue();
	}

	async acquire(): Promise<{ [Symbol.dispose]: () => void }> {
		if (this.locked) {
			await new Promise<void>((resolve) => this.waiters.push(resolve));
		} else {
			this.locked = true;
		}
		return {
			[Symbol.dispose]: () => this.release()
		};
	}

	release() {
		if (!this.locked) throw new LockError("lock is free");;

		if (this.waiters.empty()) {
			this.locked = false;
			return;
		}
		this.waiters.pop()();
	}

	[inspect.custom]() {
		return `[Lock locked: ${this.locked}, waiters: ${this.waiters.depth}]`;
	}

	async exec<T>(ps: (() => Promise<T>)): Promise<T> {
		using _ = await this.acquire();
		return ps();
	}
}


Deno.test("Lock", async () => {

});