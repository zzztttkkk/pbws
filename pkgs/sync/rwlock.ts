import { inspect } from "node:util";
import { List } from "../internal/list.ts";
import { Lock } from "./lock.ts";

interface Waiter {
	w: boolean;
	resolve: () => void;
}

class ReleaseHandle implements AsyncDisposable {
	#fn: () => Promise<void>;

	constructor(v: () => Promise<void>) {
		this.#fn = v;
	}

	[Symbol.asyncDispose](): PromiseLike<void> {
		return this.#fn();
	}
}

export class RwLock {
	private readonly lock: Lock;
	private writing = false;
	private readings = 0;
	private readonly waiters: List<Waiter>;

	constructor() {
		this.lock = new Lock();
		this.waiters = new List();
	}

	[inspect.custom]() {
		return `[RwLock w: ${this.writing}, r: ${this.readings}, waiters: ${this.waiters.size
			}, internal: ${inspect(this.lock)}]`;
	}

	private async releasew() {
		using _ = await this.lock.acquire();
		while (true) {
			if (this.waiters.empty()) {
				this.writing = false;
				return;
			}
			const top = this.waiters.peekl();
			if (top.w) {
				// because this loop can make multi reads once
				if (this.readings > 0) return;
				this.waiters.popl();
				this.writing = true;
				top.resolve();
				return;
			}
			this.waiters.popl();
			this.writing = false;
			this.readings++;
			top.resolve();
		}
	}

	private async releaser() {
		using _ = await this.lock.acquire();

		if (this.waiters.empty()) {
			this.readings--;
			return;
		}

		if (this.waiters.peekl().w) {
			this.readings--;
			if (this.readings < 1) {
				this.writing = true;
				this.waiters.popl().val.resolve();
			}
			return;
		}

		// read count does not changed
		this.waiters.popl().val.resolve();
	}

	async acquirew(): Promise<ReleaseHandle> {
		using _ = await this.lock.acquire();

		if (this.writing || this.readings) {
			await new Promise<void>((resolve) => {
				this.waiters.pushr(this.waiters.mknode({ resolve, w: true }));
			});
		} else {
			this.writing = true;
		}
		return new ReleaseHandle(this.releasew.bind(this));
	}

	async acquirer(): Promise<ReleaseHandle> {
		using _ = await this.lock.acquire();

		if (this.writing || this.waiters.peekl()?.w) {
			await new Promise<void>((resolve) => {
				this.waiters.pushr(this.waiters.mknode({ resolve, w: false }));
			});
		} else {
			this.readings++;
		}
		return new ReleaseHandle(this.releaser.bind(this));
	}
}
