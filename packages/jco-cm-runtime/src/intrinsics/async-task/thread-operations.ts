import type {
    ThreadControlContext,
    ThreadOperationOptions,
    ThreadLookupContext,
    ThreadNewContext,
    AsyncThreadMeta,
} from '../../runtime.js';
import { debugLog } from '../core-debug.js';
import { getOrCreateAsyncState } from '../component.js';
import { getCurrentTaskMeta } from '../task-context.js';

export function getCurrentThread(
    context: ThreadLookupContext,
    componentIdx: number,
    threadID?: number,
    taskID?: bigint,
): AsyncThreadMeta | undefined {
    if (componentIdx === -1 || threadID === undefined || threadID === null || threadID === 0) {
        return undefined;
    }
    const state = getOrCreateAsyncState(context.lookup, componentIdx);
    const thread = state.threads.get(threadID) as AsyncThreadMeta['thread'] | undefined;
    if (!thread || (taskID !== undefined && thread.taskID() !== taskID)) {
        return undefined;
    }
    return { id: threadID, componentIdx, taskID: thread.taskID(), task: thread.task(), thread };
}
export function currentThreadOrThrow(context: ThreadLookupContext, componentIdx: number): AsyncThreadMeta {
    const meta = getCurrentTaskMeta(context.registers, componentIdx);
    if (!meta) {
        throw new Error(`missing/incomplete global current thread meta for component idx [${componentIdx}]`);
    }
    const thread = getCurrentThread(context, meta.componentIdx, meta.threadID, meta.taskID);
    if (!thread) {
        throw new Error(`invalid/missing async thread [${meta.threadID}] for component idx [${componentIdx}]`);
    }
    return thread;
}

export function asyncYield(_context: ThreadControlContext, ctx: ThreadOperationOptions) {
    debugLog('[asyncYield()] args', { ctx });
    const { componentIdx, isCancellable } = ctx;
    const { thread, task } = currentThreadOrThrow(_context, componentIdx);

    // A nonblocking task cannot suspend its Wasm stack. The
    // Canonical ABI permits yield to complete without scheduling
    // another thread, so take that synchronous fast path here.
    if (!task.mayBlock()) {
        getOrCreateAsyncState(_context.lookup, componentIdx).runTickLoop();
        return isCancellable && thread.isCancelled() ? 1 : 0;
    }

    // A canonical thread.yield must give the scheduler a chance to
    // run other work before reporting NOT_CANCELLED. Unlike an
    // ordinary ready wait, it cannot take the immediate-completion
    // shortcut.
    return thread
        .suspend({
            // Cancellation is delivered only while an implicit
            // callback thread is parked in its event loop.
            cancellable: false,
            readyFn: () => true,
        })
        .then((keepGoing) => (keepGoing ? 0 : 1));
}

export function threadIndex(_context: ThreadLookupContext, componentIdx: number) {
    const meta = getCurrentTaskMeta(_context.registers, componentIdx);
    if (!meta) {
        throw new Error('missing/incomplete global current thread meta for component idx [' + componentIdx + ']');
    }
    return meta.threadID;
}

export async function threadSuspend(_context: ThreadControlContext, ctx: ThreadOperationOptions) {
    debugLog('[threadSuspend()] args', { ctx });
    const { componentIdx, isCancellable } = ctx;
    const { thread } = currentThreadOrThrow(_context, componentIdx);

    const keepGoing = await thread.suspend({
        cancellable: isCancellable,
        suspended: true,
        readyFn: () => false,
    });
    return keepGoing ? 0 : 1;
}

export function threadNewIndirect(
    _context: ThreadNewContext,
    ctx: { componentIdx: number; getStartFuncTableFn: () => WebAssembly.Table },
    startFuncIdx: number,
    context: number,
) {
    const { componentIdx, getStartFuncTableFn } = ctx;
    debugLog('[threadNewIndirect()] args', { componentIdx, startFuncIdx, context });

    const table = getStartFuncTableFn();
    if (!table) {
        throw new Error('missing start function table for thread.new-indirect');
    }

    // (the index is a core i32; an out-of-range index traps like `call_indirect`)
    const tableIdx = startFuncIdx >>> 0;
    if (tableIdx >= table.length) {
        throw new _context.RuntimeError('thread.new-indirect: table index out of bounds');
    }
    const startFuncRef = table.get(tableIdx);
    if (typeof startFuncRef !== 'function') {
        throw new _context.RuntimeError('thread.new-indirect: uninitialized table element');
    }
    if (!_context.start.checked.has(startFuncRef)) {
        try {
            new _context.start.platform.Instance(_context.start.typeCheck, { '': { f: startFuncRef } });
        } catch (err) {
            if (!(err instanceof _context.start.platform.LinkError)) {
                throw err;
            }
            throw new _context.RuntimeError('thread.new-indirect: start function type mismatch');
        }
        _context.start.checked.add(startFuncRef);
    }
    const promisingStartFuncRef = _context.start.platform.promising(startFuncRef);

    const { task } = currentThreadOrThrow(_context, componentIdx);

    const newThread = task.addThread(
        new _context.AsyncThread({
            componentIdx,
            task,
            startFn: () => promisingStartFuncRef(context),
        }),
    );

    // Suspended, not ready: only an explicit `thread.resume-later`
    // (never the tick loop's own readiness polling) may wake it.
    getOrCreateAsyncState(_context.lookup, componentIdx).suspendThread({
        thread: newThread,
        cancellable: false,
        suspended: true,
        readyFn: () => false,
        onResume: () => newThread.start(),
    });

    return newThread.id();
}

export function threadResumeLater(_context: ThreadControlContext, ctx: { componentIdx: number }, threadHandle: number) {
    const { componentIdx } = ctx;
    debugLog('[threadResumeLater()] args', { componentIdx, threadHandle });

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate) {
        throw new Error(`missing async state for component idx [${componentIdx}]`);
    }
    const thread = threadHandle === 0 ? undefined : cstate.threads.get(threadHandle >>> 0);
    if (!thread) {
        throw new _context.RuntimeError(`unknown handle index ${threadHandle}`);
    }

    if (!cstate.markThreadReady(thread)) {
        throw new _context.RuntimeError(`thread [${threadHandle}] is not suspended, cannot resume-later`);
    }
}

export function threadSuspendThenResume(
    _context: ThreadControlContext,
    ctx: ThreadOperationOptions,
    threadIdx: number,
) {
    const { componentIdx, isCancellable } = ctx;
    debugLog('[threadSuspendThenResume()] args', { componentIdx, isCancellable, threadIdx });
    const { thread } = currentThreadOrThrow(_context, componentIdx);

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    const other = threadIdx === 0 ? undefined : cstate.threads.get(threadIdx >>> 0);
    if (!other || other === thread || !cstate.isThreadSuspended(other)) {
        throw new _context.RuntimeError('cannot resume thread which is not suspended');
    }

    const suspension = thread.suspend({
        cancellable: isCancellable,
        suspended: true,
        readyFn: () => false,
    });
    cstate.resumeThread(other);

    return suspension.then((keepGoing) => (keepGoing ? 0 : 1));
}

export function threadYieldThenResume(_context: ThreadControlContext, ctx: ThreadOperationOptions, threadIdx: number) {
    const { componentIdx, isCancellable } = ctx;
    debugLog('[threadYieldThenResume()] args', { componentIdx, isCancellable, threadIdx });
    const { thread } = currentThreadOrThrow(_context, componentIdx);

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    const other = threadIdx === 0 ? undefined : cstate.threads.get(threadIdx >>> 0);
    if (!other || other === thread || !cstate.isThreadSuspended(other)) {
        throw new _context.RuntimeError('cannot resume thread which is not suspended');
    }

    const suspension = thread.suspend({
        cancellable: isCancellable,
        suspended: false,
        readyFn: () => true,
    });
    cstate.resumeThread(other);

    return suspension.then((keepGoing) => (keepGoing ? 0 : 1));
}

export function threadSuspendThenPromote(
    _context: ThreadControlContext,
    ctx: ThreadOperationOptions,
    threadIdx: number,
) {
    const { componentIdx, isCancellable } = ctx;
    debugLog('[threadSuspendThenPromote()] args', { componentIdx, isCancellable, threadIdx });
    const { thread } = currentThreadOrThrow(_context, componentIdx);

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    const other = threadIdx === 0 ? undefined : cstate.threads.get(threadIdx >>> 0);
    // An index that names no live thread traps; so does a self
    // switch (the same check as the `*-then-resume` built-ins).
    if (!other) {
        throw new _context.RuntimeError('invalid thread handle');
    }
    if (other === thread) {
        throw new _context.RuntimeError('cannot resume thread which is not suspended');
    }

    if (cstate.isThreadReady(other)) {
        const suspension = thread.suspend({
            cancellable: isCancellable,
            suspended: true,
            readyFn: () => false,
        });
        cstate.resumeThread(other);
        return suspension.then((keepGoing) => (keepGoing ? 0 : 1));
    }

    return threadSuspend(_context, ctx);
}

export function threadYieldThenPromote(_context: ThreadControlContext, ctx: ThreadOperationOptions, threadIdx: number) {
    const { componentIdx, isCancellable } = ctx;
    debugLog('[threadYieldThenPromote()] args', { componentIdx, isCancellable, threadIdx });
    const { thread } = currentThreadOrThrow(_context, componentIdx);

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    const other = threadIdx === 0 ? undefined : cstate.threads.get(threadIdx >>> 0);
    // An index that names no live thread traps; so does a self
    // switch (the same check as the `*-then-resume` built-ins).
    if (!other) {
        throw new _context.RuntimeError('invalid thread handle');
    }
    if (other === thread) {
        throw new _context.RuntimeError('cannot resume thread which is not suspended');
    }

    if (cstate.isThreadReady(other)) {
        const suspension = thread.suspend({
            cancellable: isCancellable,
            suspended: false,
            readyFn: () => true,
        });
        cstate.resumeThread(other);
        return suspension.then((keepGoing) => (keepGoing ? 0 : 1));
    }

    return asyncYield(_context, ctx);
}
