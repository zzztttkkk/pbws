import fs from "node:fs";
import path from "node:path";
import type { FileHandle } from "node:fs/promises";
import type { Appender } from "./appender.ts";
import dayjs from "dayjs";
import { Lock } from "../sync/lock.ts";

export type RotationKind = "daily" | "hourly" | "minutely";

export class AsyncFileAppender implements Appender {
	private fp: string;

	private dir: string;
	private filename: string;
	private ext: string;

	private bufsize: number;
	private rotation: RotationKind | undefined;
	private rotationbeginat = 0;
	private rotationendat = 0;

	private fd: FileHandle | null = null;
	private buf: Buffer[] = [];
	private currentbufsize = 0;
	private closed = false;

	private lock = new Lock();

	constructor(
		fp: string,
		opts?: {
			rotation?: RotationKind;
			bufsize?: number;
		},
	) {
		this.fp = fp;
		this.bufsize = opts?.bufsize ?? 1024 * 8;
		if (!Number.isSafeInteger(this.bufsize)) {
			this.bufsize = 1024 * 8;
		}

		this.rotation = opts?.rotation;
		this.rotationbeginat = Date.now();
		this.rotationendat = AsyncFileAppender.endat(
			this.rotationbeginat,
			opts?.rotation || "daily",
		);

		this.dir = path.dirname(fp);
		this.ext = path.extname(fp);
		this.filename = path.basename(fp, this.ext);
	}

	private static endat(v: number, rotation: RotationKind) {
		const dt = dayjs(v);
		switch (rotation) {
			case "daily": {
				return dt.endOf("day").valueOf();
			}
			case "hourly": {
				return dt.endOf("hour").valueOf();
			}
			case "minutely": {
				return dt.endOf("minute").valueOf();
			}
		}
	}

	private async rotate(at: number) {
		if (this.rotation == null) return;
		if (at <= this.rotationendat) return;

		await this.flush();

		if (this.fd != null) {
			await this.fd.close();
		}
		this.fd = null;

		let dv = "";
		switch (this.rotation) {
			case "daily": {
				dv = dayjs(this.rotationbeginat).format("YYYYMMdd");
				break;
			}
			case "hourly": {
				dv = dayjs(this.rotationbeginat).format("YYYYMMddHH");
				break;
			}
			case "minutely": {
				dv = dayjs(this.rotationbeginat).format("YYYYMMddHHmm");
				break;
			}
			default: {
				throw new Error("unreachable");
			}
		}

		const filename = `${this.dir}/${this.filename}.${dv}${this.ext}`;
		try {
			await fs.promises.rename(this.fp, filename);
			// deno-lint-ignore no-empty
		} catch { }

		this.rotationbeginat = Date.now();
		this.rotationendat = AsyncFileAppender.endat(
			this.rotationbeginat,
			this.rotation!,
		);
	}

	private async flush() {
		if (this.buf.length === 0) return;
		if (this.fd == null) {
			this.fd = await fs.promises.open(this.fp, "a+");
		}

		if (this.buf.length <= 64) {
			await this.fd.writev(this.buf);
		} else {
			await this.fd.write(Buffer.concat(this.buf, this.currentbufsize));
		}

		this.buf.length = 0;
		this.currentbufsize = 0;
	}

	async append(at: number, log: string) {
		using _ = await this.lock.acquire();

		await this.rotate(at);
		if (this.closed) return;

		const logbuf = Buffer.from(log);
		this.buf.push(logbuf);
		this.currentbufsize += logbuf.length;
		if (this.currentbufsize >= this.bufsize) {
			await this.flush();
		}
	}

	async close() {
		using _ = await this.lock.acquire();

		if (this.closed) return;
		this.closed = true;

		await this.rotate(Date.now());
		await this.flush();
		if (this.fd) {
			await this.fd.close();
			this.fd = null;
		}
	}
}
