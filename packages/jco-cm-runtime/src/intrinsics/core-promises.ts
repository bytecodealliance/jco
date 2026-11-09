export function promiseWithResolvers<T>(): {
    promise: Promise<T>;
    resolve(value: T | PromiseLike<T>): void;
    reject(reason?: unknown): void;
} {
    if (Promise.withResolvers) {
        return Promise.withResolvers<T>();
    }
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** Match Promise resolution's object/function check without coercing primitives. */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return (
        value !== null &&
        (typeof value === 'object' || typeof value === 'function') &&
        typeof (value as { then?: unknown }).then === 'function'
    );
}
