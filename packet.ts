import { readFileSync } from "node:fs";
import pbjs from "protobufjs/minimal.js";
import { fileURLToPath } from "node:url";
import { IMessageOptions } from "./gen.ts";
import { unzip, zip } from "./zip.ts";
import { AppError, ErrorCode } from "./errors.ts";

interface IMsgClass {
    new(properties?: any): any;
    create(val: any): any;
    encode(msg: any, buf: any): any;
    decode(buf: any): any;
    fromObject(object: { [k: string]: any }): any;
    toObject(message: any): { [k: string]: any };

    [MsgIdKey]?: number;
}

const id2cls = new Map<number, { cls: IMsgClass, opts?: IMessageOptions }>();

const MsgIdKey = Symbol("msgid");

let root: Record<string, IMsgClass> | undefined;
let meta: { version: string; at: number; ids: Record<string, { id: number, opts?: IMessageOptions }> } | undefined;

export function version() { return meta!.version; }
export function at() { return meta!.at; }
export function msginfobyname(name: string): { id: number, opts?: IMessageOptions } | null { return meta!.ids[name] || null; }
export function msginfobyid(id: number): { id: number, opts?: IMessageOptions } | null {
    const info = id2cls.get(id);
    if (!info) return null;
    return msginfobyname(info.cls.name);
}

export async function init(dir: string, filename: string) {
    if (!filename.endsWith(".proto")) {
        throw new Error("filename must end with .proto");
    }

    root = await import(fileURLToPath(`file://${dir}/${filename}.js`));

    meta = JSON.parse(readFileSync(`${dir}/${filename}.meta.json`, "utf-8"));

    for (const [name, info] of Object.entries(meta!.ids)) {
        const cls = root![name];
        if (!cls) {
            throw new Error(`class ${name} not found`);
        }
        cls[MsgIdKey] = info.id;
        id2cls.set(info.id, { cls, opts: info.opts });
    }
}

enum MessageFlag {
    Compressed = 0b0000_0001,
}

const COMPRESS_THRESHOLD = 2048;

export async function encode(msgid: number, reqid: number, msg: any): Promise<Buffer> {
    const info = id2cls.get(msgid);
    if (!info) throw MkNotFoundErr(msgid);

    const Cls = info.cls;
    const cache = new pbjs.Writer;
    Cls.encode(Cls.create(msg), cache);
    let data = cache.finish(true);
    let flags = 0;

    if (data.length > COMPRESS_THRESHOLD) {
        data = await zip(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
        flags |= MessageFlag.Compressed;
    }

    const buf = Buffer.allocUnsafe(data.length + 8);
    buf.writeUInt16BE(msgid);
    buf.writeUint16BE(reqid, 2);
    buf.writeUint32BE(flags, 4);
    buf.set(data, 8);
    return buf;
}

export async function encodebycls<T>(cls: ClassOf<T>, reqid: number, msg: T): Promise<Buffer> {
    let mid = cls[MsgIdKey];
    if (!mid) {
        mid = msginfobyname(cls.name)?.id;
        if (!mid) throw MkNotFoundErr(`${Deno.inspect(cls)}`);
        cls[MsgIdKey] = mid;
    }
    return encode(mid, reqid, msg);
}

function MkNotFoundErr(msgid: number | string) {
    return new AppError(ErrorCode.MsgIdNotFound, `decode: ${msgid}, version: ${version()}`);
}

export async function decode<T>(src: Buffer): Promise<{ msg: T; msgid: number; reqid: number; }> {
    if (src.length < 8) throw new AppError(ErrorCode.MsgDecodeFailed, `packet too short`);

    const msgid = src.readUint16BE();
    const info = id2cls.get(msgid);
    if (!info) throw MkNotFoundErr(msgid);
    const Cls = info.cls;

    const reqid = src.readUint16BE(2);
    const flags = src.readUint32BE(4);

    try {
        let payload = src.subarray(8);
        if (flags & MessageFlag.Compressed) {
            payload = await unzip(payload);
        }
        return { msg: Cls.decode(payload), msgid, reqid };
    } catch (e) {
        console.error("payload decode failed", e);
        throw new AppError(ErrorCode.MsgDecodeFailed, "payload decode failed");
    }
}
