import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import { ErrorCode, FailedResponseConstructor } from "./errors.ts";
import { entry_state, globimport } from "./internal.ts";
import { init } from "./packet.ts";
import * as reflection from "./pkgs/reflection/index.ts";
import * as services from "./services.ts";

const msgkinds = ["data", "request", "response", "notify"] as const;

export type MsgKind = (typeof msgkinds)[number];

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

export function msg(opts?: Parameters<typeof reg.cls>[0]) { return reg.cls(opts); }

export function field(opts?: Parameters<typeof reg.prop>[0]) { return reg.prop(opts); }

const alltypes = new Set<Function>();
const metas = [] as reflection.MetaInfo<IMessageOptions, IPropsOptions, {}>[];

let idseq = 0;
const msgidmap: Record<string, { id: number, opts?: IMessageOptions }> = {};

export async function gen(dest: string, opts?: { packages?: string[]; filter?: (v: Function) => boolean; globs?: string[] }) {
    if (!dest.endsWith(".proto")) {
        dest += ".proto";
    }
    dest = path.resolve(dest);
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

    metas.sort((a, b) => {
        const akind = a.cls()?.kind || "data";
        const bkind = b.cls()?.kind || "data";
        if (akind !== bkind) {
            return msgkinds.indexOf(akind) - msgkinds.indexOf(bkind);
        }
        return a.target.name.localeCompare(b.target.name);
    });

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

    let kind: MsgKind | null = null;
    for (const meta of metas) {
        if (opts?.filter && !opts.filter(meta.target)) continue;
        const k = meta.cls()?.kind || "data";
        if (k !== kind) {
            kind = k;
            buf.push(`\n// ---------- ${k.toUpperCase()} ----------\n\n`);
        }
        one_type(meta, buf);
    }

    const content = buf.join('\n');

    const version = createHash("md5").update(content).digest("hex");

    fs.writeFileSync(dest, content);
    fs.writeFileSync(`${dest}.meta.json`, JSON.stringify({ version, ids: msgidmap, at: Date.now() }, null, 2));

    try {
        execSync(`pnpm init`);
        // deno-lint-ignore no-empty
    } catch { }
    execSync(`pnpm add -D protobufjs-cli`);
    const cmd = `pnpm exec pbjs ${dest} -t static-module --wrap esm -es6 -d -o ${dest}.js`;
    execSync(cmd);

    await init(dest);
    await services.gen(buf);
    fs.writeFileSync(dest, buf.join('\n'));
}

@msg({ kind: "response" })
export class EmptyResponse { }

@msg({ kind: "notify" })
export class PingNotify {
    @field({ designtype: Number, numkind: "int32" })
    at!: number;

    @field({ designtype: String })
    token!: string;

    @field({ designtype: String })
    hash!: string;
}

@msg({ kind: "response" })
export class FailedResponse {
    @field({ numkind: "int32", designtype: Number })
    code!: number;

    @field({ nullable: true, designtype: String })
    message?: string;

    @field({ nullable: true, description: "In most cases, this is a json", designtype: String })
    meta?: string;
}

FailedResponseConstructor.fn = () => new FailedResponse;

FailedResponse;
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
    if (!props || props.size < 1) return;

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
    desc = [
        `ANCHOR[id=${name}]${clsopts?.label ? ` ${clsopts.label}` : ""}`,
        desc,
    ].join("\n");

    push_desc(desc, "", buf);
    buf.push(`message ${name} {`);
    const props = meta.props({ readable: true });
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

errcodes(ErrorCode);

Deno.test("gen", async () => {
    class Position {
        @field({ designtype: Number, numkind: "int32" })
        x: number;
        @field({ designtype: Number, numkind: "int32" })
        y: number;

        constructor(x: number, y: number) {
            this.x = x;
            this.y = y;
        }
    }

    class CommonMove {
        @field({ designtype: Position })
        pos: Position;
        constructor(pos: Position) {
            this.pos = pos;
        }
    }

    @msg({ kind: "request" })
    class MoveReq extends CommonMove {
    }

    @msg({ kind: "response", label: "0.0" })
    class MoveResp extends CommonMove {
    }

    class PlayerService {
        @services.serve({
            paramtypes: [MoveReq],
            returntype: MoveResp,
            description: `asdasdasd
asdasdasd
asdasdasdasd            
`,
            label: "move",
            readonly: true,
        })
        static async move(req: MoveReq) {
            return new MoveResp(req.pos);
        }
    }

    PlayerService;
    await gen("./testpbs/a.proto");
});