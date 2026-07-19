import type { Item } from "./item.ts";
import dayjs from "dayjs";

export interface LineRenderer {
	render(item: Item): string;
}

const LevelStrings = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];

export class SimpleLineRenderer implements LineRenderer {
	private _render_fn: (item: Item) => string;

	constructor(timelayout?: string) {
		if (timelayout) {
			this._render_fn = (item: Item) => {
				let meta = "";
				if (item.meta) {
					const metabuf = [] as string[];
					for (const [k, v] of Object.entries(item.meta)) {
						metabuf.push(`${k}=${JSON.stringify(v)}`);
					}
					meta = `[${metabuf.join("; ")}]`;
				}
				const times = dayjs(item.at).format(timelayout);
				return `[${LevelStrings[item.level]}] [${times}] ${meta} Message: ${item.msg
					}; Args: ${item.args}\n`;
			};
		} else {
			this._render_fn = (item: Item) => {
				let meta = "";
				if (item.meta) {
					const metabuf = [] as string[];
					for (const [k, v] of Object.entries(item.meta)) {
						metabuf.push(`${k}=${JSON.stringify(v)}`)
					}
					meta = `[${metabuf.join("; ")}]`;
				}
				return `[${LevelStrings[item.level]}] [${item.at}] ${meta} Message: ${item.msg
					}; Args: ${item.args}\n`;
			};
		}
	}

	render(item: Item): string {
		return this._render_fn(item);
	}
}

export class JSONLRenderer implements LineRenderer {
	private _render_fn: (item: Item) => string;

	constructor(opts?: { timelayout?: string; rawlevel?: boolean }) {
		if (opts?.timelayout) {
			this._render_fn = (item: Item) => {
				return JSON.stringify({
					...item,
					at: dayjs(item.at).format(opts!.timelayout!),
				}) + "\n";
			};
		} else {
			this._render_fn = (item: Item) => JSON.stringify(item) + "\n";
		}

		if (!opts?.rawlevel) {
			const fn = this._render_fn;
			this._render_fn = (item: Item) => {
				const ele = { ...item, level: LevelStrings[item.level] };
				return fn(ele as any);
			};
		}
	}

	render(item: Item): string {
		return this._render_fn(item);
	}
}

function jsonl(b: unknown): string {
	const buf = [] as string[];
	dojsonl(buf, b, new WeakSet());
	buf.push("\n");
	return buf.join("");
}


function dojsonl(buf: string[], v: unknown, ws: WeakSet<any>) {
	switch (typeof v) {
		case "string":
		case "number":
		case "boolean": {
			buf.push(JSON.stringify(v));
			return;
		}
		case "bigint": {
			buf.push(`{"$bigint":${v.toString()}}`);
			return;
		}
		case "undefined": {
			buf.push("null");
			return;
		}
		case "object": {
			if (v == null) {
				buf.push("null");
				return;
			}

			if (ws.has(v)) {
				buf.push("<cycle>");
				ws.add(v);
				return;
			};

			if (Array.isArray(v)) {
				jsonl_sized_iter(buf, v, v.length, "[", "]", ws);
				return;
			}

			if (v instanceof Set) {
				jsonl_sized_iter(buf, v, v.size, "[", "]", ws);
				return;
			}

			if (v instanceof Map) {
				jsonl_sized_pair_iter(buf, v, v.size, "{", "}", ":", ws);
				return;
			}

			if (v instanceof Date) {
				buf.push(`${v.getTime()}`);
				return;
			}
			const pairs = Object.entries(v);
			jsonl_sized_pair_iter(buf, pairs, pairs.length, "{", "}", ":", ws);
			break;
		}
	}
}

function jsonl_sized_iter(buf: string[], iter: Iterable<unknown>, size: number, lb: string, rb: string, ws: WeakSet<any>) {
	buf.push(lb);
	let i = 0;
	const end = size - 1;
	for (const ele of iter) {
		dojsonl(buf, ele, ws);
		if (i < end) {
			buf.push(",");
		}
		i++;
	}
	buf.push(rb);
}

function jsonl_sized_pair_iter(buf: string[], iter: Iterable<[string, unknown]>, size: number, lb: string, rb: string, kvsep: string, ws: WeakSet<any>) {
	buf.push(lb);
	let i = 0;
	const end = size - 1;
	for (const [k, v] of iter) {
		dojsonl(buf, k, ws);
		buf.push(kvsep);
		dojsonl(buf, v, ws);
		if (i < end) {
			buf.push(",");
		}
		i++;
	}
	buf.push(rb);
}

const obj = {
	a: 34, c: `
		asdasdas`,
	d: [1, 2, 3]
};

Deno.bench("jsonl", () => {
	jsonl(obj);
});


Deno.bench("json", () => {
	JSON.stringify(obj);
});


Deno.bench("json+nl", () => {
	JSON.stringify(obj) + "\n";
});