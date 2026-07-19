import { IsClass } from "./classes.ts";
import "reflect-metadata";

export class PropInfo<T> {
    public readonly designtype: any;
    public accessorstatus?: {
        canget?: boolean;
        canset?: boolean;
    };
    public readonly opts?: T = undefined;

    constructor(designtype: any, opts?: T) {
        this.designtype = designtype;
        this.opts = opts;
    }
}

class MethodInfo<T> {
    public paramtypes: any[] | undefined;
    public returntype: any | undefined;
    public opts?: T;
}

type PropsMetaMap<T> = Map<string, PropInfo<T>>;
type MethodsMetaMap<T> = Map<string, MethodInfo<T>>;

export class MetaInfo<ClsOpts, PropOpts, MethodOpts> {
    target: Function;
    #register: MetaRegister<ClsOpts, PropOpts, MethodOpts>;
    #_chain: Function[];
    #_props: PropsMetaMap<PropOpts> | null | undefined;
    #_methods: MethodsMetaMap<MethodOpts> | null | undefined;

    constructor(
        register: MetaRegister<ClsOpts, PropOpts, MethodOpts>,
        cls: Function,
    ) {
        this.#register = register;
        this.target = cls;
        this.#_chain = [];

        let cursor = this.target;
        while (cursor && cursor !== Function.prototype) {
            this.#_chain.push(cursor);
            cursor = Object.getPrototypeOf(cursor);
        }
        this.#_chain = this.#_chain.reverse();
    }

    cls(): ClsOpts | undefined {
        return this.#register[ClsMetaDataKey].get(this.target);
    }

    props(): PropsMetaMap<PropOpts> | null {
        if (this.#_props === undefined) {
            const props: PropsMetaMap<PropOpts> = new Map;

            for (const cls of this.#_chain) {
                const pm = this.#register[PropsMetaDataKey].get(cls);
                if (!pm) continue;
                for (const [k, v] of pm) {
                    props.set(k, v);
                }
            }
            this.#_props = props.size ? props : null;
        }
        return this.#_props
    }

    methods(): MethodsMetaMap<MethodOpts> | null {
        if (this.#_methods === undefined) {
            const methods: MethodsMetaMap<MethodOpts> = new Map;

            for (const cls of this.#_chain) {
                const mm = this.#register[MethodMetaDataKey].get(cls);
                if (!mm) continue;
                for (const [k, v] of mm) {
                    methods.set(k, v);
                }
            }
            this.#_methods = methods.size ? methods : null;
        }
        return this.#_methods;
    }

    prop(name: string): PropInfo<PropOpts> | undefined {
        return this.props()?.get(name);
    }
}

const MetaInfosKey = Symbol("reflection.metainfos");

export function metainfo<ClsOpts, PropOpts, MethodOpts>(
    register: MetaRegister<ClsOpts, PropOpts, MethodOpts>,
    cls: Function,
): MetaInfo<ClsOpts, PropOpts, MethodOpts> {
    if (!IsClass(cls)) {
        throw new Error(`${Deno.inspect(cls)} is not a class`);
    }

    const metas: Record<symbol, any> = Object.getOwnPropertyDescriptor(cls, MetaInfosKey)?.value || {};
    const meta = metas[register.name] || new MetaInfo(register, cls);
    metas[register.name] = meta;
    Reflect.set(cls, MetaInfosKey, metas);
    return meta;
}

const ClsMetaDataKey = Symbol("reflection.clsmd");
const PropsMetaDataKey = Symbol("reflection.propsmd");
const MethodMetaDataKey = Symbol("reflection.methmd");

export function AllClasses(reg: MetaRegister): Function[] {
    return Array.from(reg[ClsMetaDataKey].keys()).sort((a, b) => a.name.localeCompare(b.name));
}

export class MetaRegister<
    ClsOpts = unknown,
    PropOpts = unknown,
    MethodOpts = unknown,
> {
    public readonly name: symbol;

    private readonly [ClsMetaDataKey]: Map<Function, ClsOpts | undefined>;
    private readonly [PropsMetaDataKey]: Map<Function, PropsMetaMap<PropOpts>>;
    private readonly [MethodMetaDataKey]: Map<
        Function,
        MethodsMetaMap<MethodOpts>
    >;

    constructor(name: symbol) {
        this.name = name;
        this[ClsMetaDataKey] = new Map();
        this[PropsMetaDataKey] = new Map();
        this[MethodMetaDataKey] = new Map();
    }

    cls(opts?: ClsOpts): ClassDecorator {
        return (target) => {
            this[ClsMetaDataKey].set(target, opts);
        };
    }

    prop(opts?: PropOpts, info?: { designtype: TypeValue }): PropertyDecorator {
        return (target: object, key: string | symbol, desc?: TypedPropertyDescriptor<any>) => {
            if (typeof key === "symbol") {
                throw new Error(`decorator can not on a symbol`);
            }

            const cls: Function = target.constructor;

            const pm: PropsMetaMap<PropOpts> = this[PropsMetaDataKey].get(cls) || new Map();
            let designType;
            if (info) {
                designType = info.designtype;
            } else {
                designType = Reflect.getMetadata("design:type", target, key);
                if (desc) {
                    if (!desc.get) throw new Error(`prop decorator on a method`);
                    designType = Reflect.getMetadata("design:returntype", target, key);
                }
            }
            const prop = new PropInfo(designType, opts);
            if (desc) {
                prop.accessorstatus = {};
                prop.accessorstatus.canget = desc.get != null;
                prop.accessorstatus.canset = desc.set != null;
            }
            pm.set(key, prop);
            this[PropsMetaDataKey].set(cls, pm);
        };
    }

    method(opts?: MethodOpts, info?: { paramtypes: TypeValue[], returntype: TypeValue }): MethodDecorator {
        return (target, key, desc) => {
            if (typeof key === "symbol") {
                throw new Error(`decorator can not on a symbol`);
            }
            if (desc.get || desc.set) {
                throw new Error(`method decorator on a accessor`);
            }

            const cls: Function = target.constructor;

            const pm: MethodsMetaMap<MethodOpts> = this[MethodMetaDataKey].get(cls) || new Map();

            let methodinfo = pm.get(key as string);
            if (!methodinfo) methodinfo = new MethodInfo();

            if (info) {
                methodinfo.paramtypes = info.paramtypes;
                methodinfo.returntype = info.returntype;
            } else {
                methodinfo.paramtypes = Reflect.getMetadata(
                    "design:paramtypes",
                    target,
                    key,
                );
                methodinfo.returntype = Reflect.getMetadata(
                    "design:returntype",
                    target,
                    key,
                );
            }
            methodinfo.opts = opts;

            pm.set(key, methodinfo);
            this[MethodMetaDataKey].set(cls, pm);
        };
    }
}

Deno.test("register", () => {
    const reg = new MetaRegister<{}, {}, {}>(Symbol("test"));

    @reg.cls({})
    class X {
        @reg.prop()
        public a!: number;

        @reg.prop()
        get c(): number {
            return 1;
        }

        @reg.method()
        b() { }
    }


    class Y extends X {
        @reg.prop()
        public d!: number;

        @reg.method()
        e() { }
    }

    const xmeta = metainfo(reg, X);

    console.log(xmeta.cls());
    console.log(xmeta.props());
    console.log(xmeta.methods());

    const ymeta = metainfo(reg, Y);

    console.log(xmeta === ymeta);
    console.log(ymeta.cls());
    console.log(ymeta.props());
    console.log(ymeta.methods());
})

const DenoCustomInspect = Symbol.for("Deno.customInspect");

export class ContainerType {
    public readonly eletype: TypeValue;
    public readonly bindhint?: any;

    constructor(v: TypeValue, bindhint?: any) {
        this.eletype = v;
        this.bindhint = bindhint;
    }

    [DenoCustomInspect]() {
        return `[${Object.getPrototypeOf(this).constructor.name} of ${Deno.inspect(
            this.eletype,
        )}]`;
    }
}


export type TypeValue = ContainerType | Function;

export class ArrayType extends ContainerType { }

export class SetType extends ContainerType { }

export class MapType extends ContainerType {
    public readonly keytype: TypeValue;
    public readonly keybindhint?: any;

    constructor(
        k: TypeValue,
        v: TypeValue,
        bindhints?: { key?: any; value?: any },
    ) {
        super(v, bindhints?.value);
        this.keytype = k;
        this.keybindhint = bindhints?.key;
    }

    override[DenoCustomInspect]() {
        return `[${Object.getPrototypeOf(this).constructor.name} of { k: ${Deno.inspect(
            this.keytype,
        )}, v: ${Deno.inspect(this.eletype)}]}`;
    }
}

export const containers = {
    array: (v: TypeValue, bindhint?: any) => new ArrayType(v, bindhint),
    set: (v: TypeValue, bindhint?: any) => new SetType(v, bindhint),
    map: (k: TypeValue, v: TypeValue, bindhints?: { key?: any; value?: any }) =>
        new MapType(k, v, bindhints),
};
