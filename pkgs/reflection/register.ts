export class PropInfo<T extends object> {
    public accessorstatus?: {
        canget?: boolean;
        canset?: boolean;
    };
    public opts?: IPropOpts<T> = undefined;

    constructor(opts?: IPropOpts<T>) {
        this.opts = opts;
    }

    get readable(): boolean {
        if (!this.accessorstatus) return true;
        return this.accessorstatus.canget ?? false;
    }

    get writable(): boolean {
        if (!this.accessorstatus) return true;
        return this.accessorstatus.canset ?? false;
    }

    get designtype(): TypeValue | undefined {
        const type = this.opts?.designtype;
        if (!type) return undefined;
        if (typeof type === "function" || type instanceof ContainerType) return type;
        return undefined;
    }
}

class MethodInfo<T extends object> {
    public opts?: IMethodOpts<T>;

    constructor(opts?: IMethodOpts<T>) {
        this.opts = opts;
    }

    get paramtypes(): TypeValue[] | undefined {
        return this.opts?.paramtypes;
    }

    get returntype(): TypeValue | undefined {
        return this.opts?.returntype;
    }
}

type PropsMetaMap<T extends object> = Map<string, PropInfo<T>>;
type MethodsMetaMap<T extends object> = Map<string, MethodInfo<T>>;
type ReadonlyPropsMetaMap<T extends object> = ReadonlyMap<string, PropInfo<T>>;
type ReadonlyMethodsMetaMap<T extends object> = ReadonlyMap<string, MethodInfo<T>>;

export class MetaInfo<C extends object, P extends object, M extends object> {
    target: Function;
    #register: MetaRegister<C, P, M>;
    #_chain: Function[];
    #_props: PropsMetaMap<P> | null | undefined;
    #_methods: MethodsMetaMap<M> | null | undefined;

    constructor(
        register: MetaRegister<C, P, M>,
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

    private scope(cls: Function): Scope<C, P, M> | undefined {
        const metas = cls[Symbol.metadata];
        if (!metas) return undefined;
        const scope = metas[this.#register.name];
        if (!scope) return undefined;
        return scope as Scope<C, P, M>;
    }

    cls(): C | undefined {
        return this.scope(this.target)?.cls;
    }

    props(opts?: { readable?: boolean; writable?: boolean; }): ReadonlyPropsMetaMap<P> | null {
        if (this.#_props === undefined) {
            const props: PropsMetaMap<P> = new Map;

            for (const cls of this.#_chain) {
                const scope = this.scope(cls);
                if (!scope) continue;
                for (const [k, v] of scope.props) {
                    props.set(k, v);
                }
            }
            this.#_props = props.size ? props : null;
        }

        if (this.#_props == null) return null;

        if (opts && (opts.readable || opts.writable)) {
            const newprops = new Map();
            for (const [k, v] of this.#_props) {
                if (opts.readable && !v.readable) continue;
                if (opts.writable && !v.writable) continue;
                newprops.set(k, v);
            }
            if (newprops.size < 1) return null;
            return newprops;
        }
        return this.#_props
    }

    methods(): ReadonlyMethodsMetaMap<M> | null {
        if (this.#_methods === undefined) {
            const methods: MethodsMetaMap<M> = new Map;

            for (const cls of this.#_chain) {
                const scope = this.scope(cls);
                if (!scope) continue;
                for (const [k, v] of scope.methods) {
                    methods.set(k, v);
                }
            }
            this.#_methods = methods.size ? methods : null;
        }
        return this.#_methods;
    }

    prop(name: string): PropInfo<P> | undefined {
        return this.props()?.get(name);
    }
}

export function metainfo<C extends object, P extends object, M extends object>(
    register: MetaRegister<C, P, M>,
    cls: Function,
): MetaInfo<C, P, M> {
    return register.meta(cls);
}

export type IPropOpts<T extends object> = T & {
    designtype?: TypeValue;
};

export type IMethodOpts<T extends object> = T & {
    paramtypes?: TypeValue[];
    returntype?: TypeValue;
    wrap?: <F extends Function>(f: F) => F;
};

interface Scope<C extends object, P extends object, M extends object> {
    cls: C | undefined;
    props: PropsMetaMap<P>;
    methods: MethodsMetaMap<M>;
}

export class MetaRegister<
    C extends object,
    P extends object,
    M extends object,
> {
    public readonly name: symbol;
    #all: Function[] = [];
    readonly #metas: Map<Function, MetaInfo<C, P, M>> = new Map();

    constructor(name: symbol) {
        this.name = name;
    }

    public get AllClses(): ReadonlyArray<Function> {
        return this.#all;
    }

    private scope(ctx: DecoratorContext): Scope<C, P, M> {
        const sobj: Scope<C, P, M> = (ctx.metadata[this.name] as Scope<C, P, M> | undefined) || {
            cls: undefined,
            props: new Map,
            methods: new Map,
        };
        ctx.metadata[this.name] = sobj;
        return sobj;
    }

    cls(opts?: C) {
        return (target: Function, ctx: ClassDecoratorContext) => {
            this.scope(ctx).cls = opts;
            this.#all.push(target);
        };
    }

    prop(opts?: IPropOpts<P>) {
        return (_target: any, ctx: ClassGetterDecoratorContext | ClassSetterDecoratorContext | ClassFieldDecoratorContext | ClassAccessorDecoratorContext) => {
            if (typeof ctx.name == "symbol") {
                throw new Error("decorator can not be used on a symbol");
            }

            const props = this.scope(ctx).props;
            const prop: PropInfo<P> = props.get(ctx.name) || new PropInfo(opts);
            prop.opts = { ...prop.opts, ...opts } as IPropOpts<P>;

            switch (ctx.kind) {
                case "accessor": {
                    prop.accessorstatus = { canget: true, canset: true };
                    break;
                }
                case "getter": {
                    if (!prop.accessorstatus) prop.accessorstatus = {};
                    prop.accessorstatus.canget = true;
                    break;
                }
                case "setter": {
                    if (!prop.accessorstatus) prop.accessorstatus = {};
                    prop.accessorstatus.canset = true;
                    break;
                }
                case "field": {
                    break;
                }
            }

            props.set(ctx.name, prop);
        };
    }

    method(opts?: IMethodOpts<M>) {
        return (target: Function, ctx: ClassMethodDecoratorContext) => {
            if (typeof ctx.name == "symbol") {
                throw new Error("decorator can not be used on a symbol");
            }

            const methods = this.scope(ctx).methods;
            methods.set(ctx.name, new MethodInfo(opts));

            if (opts?.wrap) {
                const wraped = opts.wrap(target);
                return function (this: any, ...args: any[]) {
                    return wraped.apply(this, args);
                };
            }
        };
    }

    meta(cls: Function): MetaInfo<C, P, M> {
        const ins = this.#metas.get(cls) || new MetaInfo(this, cls);
        this.#metas.set(cls, ins);
        return ins;
    }
}

Deno.test("register", () => {
    const reg = new MetaRegister<{}, {}, {}>(Symbol("test"));

    @reg.cls()
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

    @reg.cls()
    class Y extends X {
        @reg.prop({ designtype: Number })
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

    console.log(reg.AllClses);
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
