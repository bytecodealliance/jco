export function promiseWithResolvers() {
    if (Promise.withResolvers) {
        return Promise.withResolvers();
    }
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}
