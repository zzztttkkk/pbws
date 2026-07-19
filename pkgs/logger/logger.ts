import { AsyncLocalStorage } from "node:async_hooks";
import type { Appender } from "./appender.ts";
import { type Item, Level } from "./item.ts";
import type { LineRenderer } from "./renderer.ts";

type DispatchFunc = (item: Item) => { renderer: LineRenderer; appender: Appender } | null | undefined;

export abstract class AbsLogger {
	protected _closed = false;

	protected abstract dispatch(
		item: Item,
	): { renderer: LineRenderer; appender: Appender } | null | undefined;

	public abstract close(): Promise<void>;

	private async log(level: Level, msg: string, ...args: any[]) {
		if (this._closed) return;

		const item: Item = {
			at: Date.now(),
			level,
			msg,
			args,
		};
		item.meta = MetaStore.getStore() || {};
		const ra = this.dispatch(item);
		if (!ra) return;
		await ra.appender.append(item.at, ra.renderer.render(item));
	}

	async trace(msg: string, ...args: any[]) {
		return this.log(Level.Trace, msg, ...args);
	}

	async debug(msg: string, ...args: any[]) {
		return this.log(Level.Debug, msg, ...args);
	}

	async info(msg: string, ...args: any[]) {
		return this.log(Level.Info, msg, ...args);
	}

	async warn(msg: string, ...args: any[]) {
		return this.log(Level.Warn, msg, ...args);
	}

	async error(msg: string, ...args: any[]) {
		return this.log(Level.Error, msg, ...args);
	}
}

const MetaStore = new AsyncLocalStorage<{ [k: string]: any }>();

export function With<R>(meta: { [k: string]: any }, fn: () => R): R {
	const pv = MetaStore.getStore();
	return MetaStore.run(pv == null ? meta : { ...pv, ...meta }, fn);
}

export function logger(dispatch: DispatchFunc): AbsLogger {
	class Logger extends AbsLogger {
		#appenders = new Set<Appender>();

		protected dispatch(item: Item) {
			if (this._closed) return null;
			const ra = dispatch(item);
			if (!ra) return null;
			this.#appenders.add(ra.appender);
			return ra;
		}

		async close(): Promise<void> {
			if (this._closed) return;
			this._closed = true;
			await Promise.allSettled(Array.from(this.#appenders).map((a) => a.close()));
		}
	}
	return new Logger();
}
