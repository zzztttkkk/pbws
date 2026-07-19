import dayjs from "dayjs";

export interface Appender {
	append(at: number, log: string): Promise<void>;
	close(): Promise<void>;
}

export class ConsoleAppender implements Appender {
	append(at: number, log: string): Promise<void> {
		console.log(dayjs(at).format("YYYY-MM-DD HH:mm:ss"), log);
		return Promise.resolve();
	}

	close(): Promise<void> {
		return Promise.resolve();
	}
}

export type AppendFuncType = (at: number, log: string) => Promise<void>;
export type CloseFuncType = () => Promise<void>;

export class FuncAppender implements Appender {
	private append_fn: AppendFuncType | null = null;
	private close_fn: CloseFuncType | null = null;

	constructor(
		append_fn: AppendFuncType | null,
		close_fn: CloseFuncType | null = null,
	) {
		this.append_fn = append_fn;
		this.close_fn = close_fn;
	}

	append(at: number, log: string): Promise<void> {
		if (this.append_fn == null) return Promise.resolve();
		return this.append_fn(at, log);
	}

	close(): Promise<void> {
		if (this.close_fn == null) return Promise.resolve();
		return this.close_fn();
	}
}
