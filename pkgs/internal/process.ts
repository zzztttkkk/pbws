type Action = () => void | Promise<void>;

const actions = [] as { act: Action, order: number }[];

function RegisterBeforeShutdownAction(action: Action, order?: number) {
    actions.push({ act: action, order: order ?? 0 });
}

let flag = false;

async function exec() {
    if (flag) return;
    flag = true;

    actions.sort((a, b) => a.order - b.order);

    const fas = [] as Action[];
    const sas = [] as Action[];
    const tas = [] as Action[];
    const las = [] as Action[];

    for (const action of actions) {
        if (action.order <= Order.First) {
            fas.push(action.act);
            continue;
        }
        if (action.order <= Order.Second) {
            sas.push(action.act);
            continue;
        }
        if (action.order <= Order.Third) {
            tas.push(action.act);
            continue;
        }
        las.push(action.act);
    }

    await Promise.allSettled(fas.map((a) => Promise.resolve(a())));
    await Promise.allSettled(sas.map((a) => Promise.resolve(a())));
    await Promise.allSettled(tas.map((a) => Promise.resolve(a())));
    await Promise.allSettled(las.map((a) => Promise.resolve(a())));

    process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"] as Deno.Signal[]) {
    Deno.addSignalListener(sig, exec);
}

enum Order {
    First = 0,
    Second = 500,
    Third = 1000,
    Last = 9999,
}

Object.defineProperty(process, "RegisterBeforeShutdownAction", {
    value: RegisterBeforeShutdownAction,
    writable: false,
    configurable: false,
    enumerable: false,
});

Object.defineProperty(process, "Order", {
    value: Order,
    writable: false,
    configurable: false,
    enumerable: false,
});

Object.defineProperty(process, "dying", {
    configurable: false,
    enumerable: false,
    get() {
        return flag;
    },
});

declare global {
    namespace NodeJS {
        interface Process {
            dying: boolean;

            Order: typeof Order;

            RegisterBeforeShutdownAction: (action: Action, order?: Order) => void;
        }
    }
}
