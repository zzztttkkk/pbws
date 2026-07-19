type Action = () => void;

const BeforeExitActions = [] as Action[];

function RegisterBeforeShutdownAction(action: Action) {
    BeforeExitActions.push(action);
}

let flag = false;
async function exec() {
    if (flag) return;
    flag = true;

    const ps = [] as Promise<any>[];
    for (const action of BeforeExitActions) {
        const val: any = action();
        if (val.then && typeof val.then === "function") {
            ps.push(val);
        }
    }
    await Promise.allSettled(ps);
    process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as NodeJS.Signals[]) {
    process.on(signal, exec);
}

process.on("beforeExit", exec);

Object.defineProperty(process, "RegisterBeforeShutdownAction", {
    value: RegisterBeforeShutdownAction,
    writable: false,
    configurable: false,
    enumerable: false,
});

declare global {
    namespace NodeJS {
        interface Process {
            RegisterBeforeShutdownAction: (action: Action) => void;
        }
    }
}
