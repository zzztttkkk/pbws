import { inspect } from "node:util";
import { List } from "../internal/list.ts";

type Waiter = () => void;

export class LockError extends Error { };

export class Lock {
	private locked = false;
	private readonly waiters: List<Waiter>;

	constructor() {
		this.waiters = new List();
	}

	async acquire(): Promise<{ [Symbol.dispose]: () => void }> {
		if (this.locked) {
			await new Promise<void>((resolve) => {
				this.waiters.pushr(this.waiters.mknode(resolve));
			});
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
		this.waiters.popl().val();
	}

	[inspect.custom]() {
		return `[Lock locked: ${this.locked}, waiters: ${this.waiters.size}]`;
	}

	async exec<T>(ps: (() => Promise<T>)): Promise<T> {
		using _ = await this.acquire();
		return ps();
	}
}


Deno.test("Lock", async () => {

});