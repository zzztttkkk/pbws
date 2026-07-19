import { createHash } from "node:crypto";
import * as reflection from "./pkgs/reflection/index.ts";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { entry_state, globimport } from "./internal.ts";

export type MsgKind = "data" | "request" | "response" | "notify";

export interface IMessageOptions {
    label?: string;
    description?: string;
    kind?: MsgKind;
    tags?: string[];
}

export type NumberKind = "int32" | "int64" | "uint32" | "uint64" | "double";

export interface IPropsOptions {
    description?: string;
    numkind?: NumberKind;
    nullable?: boolean;
}

const reg = new reflection.MetaRegister<IMessageOptions, IPropsOptions, {}>(Symbol("fv.pkgs.pb"));

export function msg(opts?: IMessageOptions) { return reg.cls(opts); }

export function field(opts?: IPropsOptions) { return reg.prop(opts); }

const alltypes = new Set<Function>();
const metas = [] as reflection.MetaInfo<IMessageOptions, IPropsOptions, {}>[];

let idseq = 0;
const msgidmap: Record<string, { id: number, opts?: IMessageOptions }> = {};

export async function gen(dest: string, opts?: { packages?: string[]; filter?: (v: Function) => boolean; globs?: string[] }) {
    if (entry_state.app_instantiated) {
        throw new Error("Cannot run gen() after App has been instantiated. Please execute gen() in a standalone script.");
    }
    if (entry_state.gen_executed) {
        throw new Error("gen should be called only once");
    }
    entry_state.gen_executed = true;

    if (opts?.globs) {
        await globimport(opts.globs);
    }

    for (const cls of reg.AllClses) {
        collect(cls);
    }

    metas.sort((a, b) => a.target.name.localeCompare(b.target.name));

    const buf = [
        `syntax = "proto3";`,
        ...(opts?.packages || [])
    ] as string[];

    if (_err_s2i_codes.size > 0) {
        buf.push(`\nenum ErrCode {`);
        for (const [k, n] of _err_s2i_codes) {
            buf.push(`  ${k} = ${n};`);
        }
        buf.push(`}\n`);
    }

    for (const meta of metas) {
        if (opts?.filter && !opts.filter(meta.target)) continue;
        one_type(meta, buf);
    }

    const content = buf.join('\n');

    const version = createHash("md5").update(content).digest("hex");

    fs.writeFileSync(dest, content);
    fs.writeFileSync(`${dest}.meta.json`, JSON.stringify({ version, ids: msgidmap, at: Date.now() }, null, 2));

    const cmd = `pnpm exec pbjs ${dest} -t static-module --wrap esm -es6 -d -o ${dest}.js`;
    execSync(cmd);
}

@msg({ kind: "response" })
export class EmptyResponse { }

@msg({ kind: "notify" })
export class PingNotify {
    @field()
    at!: number;

    @field()
    token!: string;

    @field()
    hash!: string;
}

EmptyResponse;
PingNotify;


function collect(cls: Function) {
    switch (cls) {
        case Buffer:
        case BigInt:
        case Boolean:
        case String:
        case Number: {
            return;
        }
    }

    if (alltypes.has(cls)) return;
    alltypes.add(cls);

    const meta = reflection.metainfo(reg, cls);
    metas.push(meta);

    const props = meta.props();
    if (!props || props.size < 1) {
        return;
    }
    for (const [pname, prop] of props) {
        if (!prop.designtype) {
            throw new Error(`prop ${cls.name}.${pname} has no design type`);
        }
        if (prop.designtype instanceof reflection.ContainerType) {
            collect(prop.designtype.eletype as any);
            if (prop.designtype instanceof reflection.MapType) {
                switch (prop.designtype.keytype) {
                    case Number:
                    case String: {
                        continue;
                    }
                    default: {
                        throw new Error(`map key type is not supported, ${prop.designtype.keytype}`);
                    }
                }
            }
            continue;
        }
        collect(prop.designtype);
    }
}

function push_desc(desc: string | undefined, prefix: string, buf: string[]) {
    if (!desc) return;
    desc = desc.trim();
    if (!desc) return;
    buf.push(...desc.split('\n').map(v => `${prefix}// ${v}`));
}

function one_type(meta: reflection.MetaInfo<IMessageOptions, IPropsOptions, {}>, buf: string[]) {
    const clsopts = meta.cls();
    let desc = clsopts?.description || "";

    const name = meta.target.name;
    const opt_kind = clsopts?.kind || "data";
    if (opt_kind !== "data") {
        idseq++;
        msgidmap[name] = { id: idseq, opts: clsopts };
    }
    const kind = `kind: ${opt_kind}`;
    desc = desc ? `${kind}\n${desc}` : `${kind}`;

    push_desc(desc, "", buf);
    buf.push(`message ${name} {`);
    const props = meta.props();
    if (props) {
        let idx = 1;
        for (const [k, prop] of props.entries()) {
            one_field(idx, k, prop, buf);
            idx++;
        }
    }
    buf.push(`}
`);
}

function one_field(idx: number, k: string, prop: reflection.PropInfo<IPropsOptions>, buf: string[]) {
    push_desc(prop.opts?.description, "  ", buf);
    const pbtype = topbtype(prop.designtype, prop);
    let nullable = prop.opts?.nullable ? "optional " : "";
    if (prop.designtype instanceof reflection.ContainerType) {
        nullable = "";
    }
    buf.push(`  ${nullable}${pbtype} ${k} = ${idx};`);
}

function topbtype(v: any, prop: reflection.PropInfo<IPropsOptions>, hints?: { ismapkey?: boolean }): string {
    if (v instanceof reflection.ContainerType) {
        if (v instanceof reflection.MapType) {
            return `map<${topbtype(v.keytype, prop, { ismapkey: true })}, ${topbtype(v.eletype, prop)}>`;
        }
        else {
            return `repeated ${topbtype(v.eletype, prop)}`
        }
    }

    switch (v) {
        case Buffer: {
            return "bytes";
        }
        case BigInt: {
            return "int64";
        }
        case String: {
            return "string";
        }
        case Boolean: {
            return "bool";
        }
        case Number: {
            if (prop.opts?.numkind) {
                return prop.opts.numkind;
            }
            if (hints?.ismapkey) return "int64";
            return "double";
        }
        default: {
            if (typeof v === "function") {
                return v.name;
            }
            throw new Error(`unexpected desightype: ${v}`);
        }
    }
}

const _err_s2i_codes = new Map<string, number>();
const _err_i2s_codes = new Map<number, string>;

export function errcodes(...enumvs: Record<string, number | string>[]) {
    for (const enumv of enumvs) {
        for (const [k, v] of Object.entries(enumv)) {
            if (typeof v !== "number") continue;
            if (_err_s2i_codes.has(k)) {
                throw new Error(`duplicate errcode: ${k}`);
            }
            if (_err_i2s_codes.has(v)) {
                throw new Error(`duplicate errcode: ${v}`);
            }
            _err_s2i_codes.set(k, v);
            _err_i2s_codes.set(v, k);
        }
    }
}
