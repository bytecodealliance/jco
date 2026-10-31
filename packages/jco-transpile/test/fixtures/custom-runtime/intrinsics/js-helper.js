export const emptyFunc = () => {};

/** Only selected DataView users allocate this owner; emptyFunc needs no cache. */
export const initializeDataViewCache = () => ({
    view: new DataView(new ArrayBuffer(0)),
});

export const dataView = (context, memory) =>
    context.view.buffer === memory.buffer ? context.view : (context.view = new DataView(memory.buffer));

/** Preserve synchronous results and throws until the generator actually yields a thenable. */
export const maybeSyncGenerator = (genFn) => {
    return function (...args) {
        const gen = genFn.apply(this, args);
        const step = (method, value) => {
            while (true) {
                const { value: yielded, done } = gen[method](value);
                if (done) {
                    return yielded;
                }
                if (
                    yielded === null ||
                    (typeof yielded !== 'object' && typeof yielded !== 'function') ||
                    typeof yielded.then !== 'function'
                ) {
                    method = 'next';
                    value = yielded;
                    continue;
                }
                return Promise.resolve(yielded).then(
                    (res) => step('next', res),
                    (err) => step('throw', err),
                );
            }
        };
        return step('next', undefined);
    };
};

import { getCurrentThread } from './thread-operations.js';

export const conditionalSuspendingHostImport = (context, module, componentIdx, fn) => {
    return new context.WebAssembly.Instance(module, {
        '': {
            mayBlock: () => {
                const saved = context.threads.registers[componentIdx];
                const thread = saved ? getCurrentThread(context.threads, saved.componentIdx, saved.threadID) : null;
                return thread?.task.mayBlock() ?? false;
            },
            fast: fn,
            slow: new context.WebAssembly.Suspending(fn),
        },
    }).exports.run;
};
