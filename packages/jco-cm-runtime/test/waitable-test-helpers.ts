// Test-only assembly of selected constructors and the actual operation contexts.
import * as operations from '../src/intrinsics/waitable.js';
import type { WaitableTaskLookup, AsyncTaskMeta, WaitableTask, TaskIdentity } from '../src/runtime.js';
import { create as createComponent } from './component-helpers.js';

type WaitableTestOptions = NonNullable<Parameters<typeof createComponent>[0]> & {
    waitableContext?: Partial<WaitableTaskLookup>;
};
export function create(options: WaitableTestOptions = {}) {
    const Waitable = operations.initializeWaitableClass();
    const selected = createComponent({ ...options, Waitable });
    const { core, lookup } = selected;
    const WaitableSet = operations.initializeWaitableSetClass(core.asyncEventCode);
    const context = {
        RuntimeError: core.RuntimeError,
        lookup,
        Waitable,
        WaitableSet,
        taskLookup: options.waitableContext?.taskLookup ?? {
            registers: core.currentTaskMeta,
            tasks: new Map<number, AsyncTaskMeta<WaitableTask & TaskIdentity>[]>(),
        },
        events: core.asyncEventCode,
    };
    const waitable = {
        Waitable,
        WaitableSet,
        waitableSetNew: (idx: number) => operations.waitableSetNew(context, idx),
        waitableSetWait: (
            ...args: Parameters<typeof operations.waitableSetWait> extends [unknown, ...infer A] ? A : never
        ) => operations.waitableSetWait(context, ...args),
        waitableSetPoll: (
            ...args: Parameters<typeof operations.waitableSetPoll> extends [unknown, ...infer A] ? A : never
        ) => operations.waitableSetPoll(context, ...args),
        waitableSetDrop: (idx: number, rep: number) => operations.waitableSetDrop(context, idx, rep),
        removeWaitableSet: (args: Parameters<typeof operations.removeWaitableSet>[1]) =>
            operations.removeWaitableSet(context, args),
        waitableJoin: (idx: number, rep: number, set: number) => operations.waitableJoin(context, idx, rep, set),
    };
    return { ...selected, waitable };
}
