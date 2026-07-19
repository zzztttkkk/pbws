declare global {
    interface ClassOf<T> {
        new(...args: any): T;
    }
}

export { };