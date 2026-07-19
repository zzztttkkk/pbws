import { assertEquals } from "@std/assert/equals";

export function IsClass(v: Function): boolean {
    if (typeof v !== "function") return false;
    const ins = Deno.inspect(v, { depth: 1, colors: false });
    if (!ins.startsWith(`[class ${v.name}`) || !ins.endsWith("]")) {
        return false;
    }
    const ts = v.toString();
    return ts.startsWith(`class ${v.name} `) && ts.endsWith("}");
}

Deno.test("IsClass", () => {
    assertEquals(IsClass(() => { }), false);
    assertEquals(IsClass(class X { }), true);
});

export function IsSubClassOf(sub: Function, base: Function): boolean {
    return sub.prototype instanceof base;
}

Deno.test("IsSubClassOf", () => {
    class X { }

    class Y extends X { }

    assertEquals(IsSubClassOf(X, Y), false);
    assertEquals(IsSubClassOf(Y, X), true);
});

export function IsPureObject(v: any): boolean {
    switch (typeof v) {
        case "object": {
            if (v == null) return false;
            return Object.getPrototypeOf(v).constructor === Object;
        }
        default: {
            return false;
        }
    }
}

export function classof<T>(obj: T): ClassOf<T> {
    return Object.getPrototypeOf(obj).constructor;
}

Deno.test("classof", () => {
    console.log(classof({}));
    console.log(classof([]));
    console.log(classof(121));
});