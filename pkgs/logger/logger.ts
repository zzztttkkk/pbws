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

	private log(level: Level, msg: string, ...args: any[]): Promise<void> {
		if (this._closed) return Promise.resolve();

		const item: Item = {
			at: Date.now(),
			level,
			msg,
			args,
		};
		item.meta = MetaStore.getStore();
		const ra = this.dispatch(item);
		if (!ra) return Promise.resolve();
		return ra.appender.append(item.at, ra.renderer.render(item));
	}

	trace(msg: string, ...args: any[]) {
		return this.log(Level.Trace, msg, ...args);
	}

	debug(msg: string, ...args: any[]) {
		return this.log(Level.Debug, msg, ...args);
	}

	info(msg: string, ...args: any[]) {
		return this.log(Level.Info, msg, ...args);
	}

	warn(msg: string, ...args: any[]) {
		return this.log(Level.Warn, msg, ...args);
	}

	error(msg: string, ...args: any[]) {
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
