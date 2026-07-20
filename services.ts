import { EmptyResponse } from "./gen.ts";
import { msginfobyname } from "./packet.ts";
import * as reflection from "./pkgs/reflection/index.ts";

export interface IServeProps {
    label?: string;
    description?: string;
    readonly?: boolean;
    tags?: string[];
}

const reg = new reflection.MetaRegister<{}, {}, IServeProps>(Symbol("fv.pkgs.pb.serve"));

export function serve(opts: Parameters<typeof reg.method>[0]) {
    return reg.method(opts, (target, ctx) => {
        if (!ctx.static) {
            throw new Error(`${target.name}.${ctx.name.toString()} must be static`);
        }
        ctx.addInitializer(function () {
            (reg.AllClses as Function[]).push(this as Function);
        });
    });
}

export async function load() {
    const services: Map<number, {
        fnc: (v: any) => Promise<any>;
        opts?: IServeProps;
        name: string;
        input: string;
        output: string;
    }> = new Map;
    for (const cls of reg.AllClses) {
        const meta = reflection.metainfo(reg, cls);
        const methods = meta.methods();
        if (!methods) continue;
        for (const [name, method] of methods) {
            if (!method.paramtypes || method.paramtypes.length != 1) {
                throw new Error(`${cls.name}.${name} must have only one param`);
            }
            const input_type = method.paramtypes[0];
            if (!input_type) throw new Error(`${cls.name}.${name}'s input type not found`);
            if (typeof input_type !== "function") {
                throw new Error(`${cls.name}.${name}'s input type must be function`);
            }
            const inputinfo = msginfobyname(input_type.name);
            if (!inputinfo) throw new Error(`${name} not found`);
            if (inputinfo.opts?.kind !== "request") throw new Error(`${cls.name}.${name}'s input type must be request`);

            const output_type = method.returntype || EmptyResponse;
            if (typeof output_type !== "function") {
                throw new Error(`${cls.name}.${name}'s output type must be function`);
            }
            const outputinfo = msginfobyname(output_type.name);
            if (!outputinfo) throw new Error(`${cls.name}.${name}'s output type not found`);
            if (outputinfo.opts?.kind !== "response") throw new Error(`${cls.name}.${name}'s output type must be response`);

            if (services.has(inputinfo.id)) {
                throw new Error(`${cls.name}.${name}'s input type already registered`);
            }
            services.set(inputinfo.id, {
                fnc: async (v: any) => cls[name](v),
                opts: method.opts,
                name: `${cls.name}.${name}`,
                input: input_type.name,
                output: output_type.name,
            });
        }
    }
    return services;
}

export async function gen(buf: string[]) {
    const services = await load();
    if (services.size < 1) return;

    buf.push(`\n// ---------- SERVICE ----------\n\n`);
    buf.push(`// Comment Anchors: https://marketplace.visualstudio.com/items?itemName=ExodiusStudios.comment-anchors`);

    for (const service of Array.from(services.values()).sort((a, b) => a.name.localeCompare(b.name))) {
        buf.push(`// >>>>> ${service.name}${service.opts?.readonly ? " [READONLY]" : ""}`);
        push_one_line(buf, "//   label: ", service.opts?.label || "", "");
        push_desc(buf, "// ---- ", service.opts?.description);
        buf.push("//" + ` LINK #${service.input}`);
        buf.push("//" + ` LINK #${service.output}`);
    }
}

function push_one_line(buf: string[], prefix: string, line: string, suffix: string) {
    line = line.trim();
    if (!line) return;
    line = line.split("\n").map(v => v.trim()).filter(v => v.length).join(" ").trim();
    if (!line) return;
    buf.push(`${prefix}${line}${suffix}`);
    buf.push(`//`);
}

function push_desc(buf: string[], prefix: string, desc: string | undefined) {
    if (!desc) return;
    desc = desc.trim();
    if (!desc) return;
    for (const line of desc.split('\n')) {
        buf.push(`${prefix}${line}`);
    }
}