import type { JsHelperModule } from '../runtime.js';
import { getCurrentThread } from './async-task/thread-operations.js';

export const emptyFunc: JsHelperModule['emptyFunc'] = () => {};

/** Only selected DataView users allocate this owner; emptyFunc needs no cache. */
export const initializeDataViewCache: JsHelperModule['initializeDataViewCache'] = () => ({
    view: new DataView(new ArrayBuffer(0)),
});

export const dataView: JsHelperModule['dataView'] = (context, memory) =>
    context.view.buffer === memory.buffer ? context.view : (context.view = new DataView(memory.buffer));

/**
 * Wraps a generator function, which yields where an async function would await,
 * so that it runs synchronously until it yields a promise. A host import that
 * answers synchronously then returns synchronously, which a task that cannot
 * block (e.g. a resource destructor) requires.
 */
export const maybeSyncGenerator: JsHelperModule['maybeSyncGenerator'] = (genFn) =>
    function (...args) {
        const gen = genFn.apply(this, args);
        type Result = ReturnType<typeof gen.next> extends IteratorResult<unknown, infer R> ? R : never;
        const step = (method: 'next' | 'throw', value: unknown): Result | Promise<Result> => {
            while (true) {
                const { value: yielded, done } = gen[method](value);
                if (done) {
                    return yielded as Result;
                }
                if (
                    yielded === null ||
                    (typeof yielded !== 'object' && typeof yielded !== 'function') ||
                    typeof (yielded as { then?: unknown }).then !== 'function'
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

/** Instantiates the module that calls a host import directly, or through JSPI when the current task may block. */
export const conditionalSuspendingHostImport: JsHelperModule['conditionalSuspendingHostImport'] = (
    context,
    module,
    componentIdx,
    fn,
) =>
    new context.WebAssembly.Instance(module, {
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
