import type { Item } from "./item.ts";
import dayjs from "dayjs";
import * as colors from "@std/fmt/colors";

export interface LineRenderer {
	render(item: Item): string;
}

const LevelStrings = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];

interface Theme {
	meta: (v: string) => string;
	level: (v: string) => string;
	time: (v: string) => string;
	msg: (v: string) => string;
	args: (v: string) => string;
}


const themes: Theme[] = [
	{ meta: colors.white, level: colors.gray, time: colors.white, msg: colors.gray, args: colors.white }, // TRACE
	{ meta: colors.white, level: colors.blue, time: colors.white, msg: colors.white, args: colors.white }, // DEBUG
	{ meta: colors.white, level: colors.green, time: colors.white, msg: colors.white, args: colors.white }, // INFO
	{ meta: colors.white, level: colors.yellow, time: colors.white, msg: colors.yellow, args: colors.white }, // WARN
	{ meta: colors.white, level: colors.red, time: colors.white, msg: colors.red, args: colors.white }, // ERROR
];

export class SimpleLineRenderer implements LineRenderer {
	private _render_fn: (item: Item) => string;

	static buildmeta(item: Item) {
		if (item.meta) {
			const metabuf = [] as string[];
			for (const [k, v] of Object.entries(item.meta)) {
				metabuf.push(`${k}=${JSON.stringify(v)}`);
			}
			return ` [${metabuf.join("; ")}]`;
		}
		return "";
	}

	static buildargs(item: Item) {
		if (item.args && item.args.length > 0) {
			return ` ${JSON.stringify(item.args)}`;
		}
		return "";
	}

	constructor(opts?: { timelayout?: string; colorful?: boolean }) {
		if (opts?.timelayout) {
			this._render_fn = (item: Item) => {
				const theme = themes[item.level];

				let meta = SimpleLineRenderer.buildmeta(item);
				let args = SimpleLineRenderer.buildargs(item);
				let time = dayjs(item.at).format(opts!.timelayout!);
				let level = LevelStrings[item.level];
				let msg = item.msg;
				if (opts?.colorful) {
					meta = theme.meta(meta);
					level = theme.level(level);
					msg = theme.msg(msg);
					args = theme.args(args);
					time = theme.time(time);
				}
				return `[${time}] [${level}]${meta} ${msg};${args}\n`;
			};
		} else {
			this._render_fn = (item: Item) => {
				const theme = themes[item.level];

				let meta = SimpleLineRenderer.buildmeta(item);
				let args = SimpleLineRenderer.buildargs(item);
				let time = `${item.at}`;
				let level = LevelStrings[item.level];
				let msg = item.msg;
				if (opts?.colorful) {
					meta = theme.meta(meta);
					level = theme.level(level);
					msg = theme.msg(msg);
					args = theme.args(args);
					time = theme.time(time);
				}
				return `[${time}] [${level}]${meta} ${msg};${args}\n`;
			};
		}
	}

	render(item: Item): string {
		return this._render_fn(item);
	}
}

export class JSONLRenderer implements LineRenderer {
	private _render_fn: (item: Item) => string;

	constructor(opts?: { timelayout?: string; }) {
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