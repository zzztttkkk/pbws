declare global {
    interface ClassOf<T> {
        new(...args: any): T;
    }

    type KeysOnly<T, V> = keyof {
        [P in keyof T as T[P] extends V ? P : never]: P;
    };
}

export { };