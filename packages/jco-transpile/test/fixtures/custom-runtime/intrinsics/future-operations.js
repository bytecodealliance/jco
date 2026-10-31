import { debugLog } from './core-debug.js';
import { getErrorPayload, disposeHostValue } from './core.js';
import { getOrCreateAsyncState, trackHostOperation } from './component.js';
import { getCurrentTask } from './task-operations.js';
import { asyncBlockedCode } from './async-task.js';
import { createFuture, getFutureEnd, removeFutureEndFromTable, addFutureEndToTable } from './future-state.js';

export function futureNew(_context, ctx) {
    debugLog('[futureNew()] args', { ctx });
    const { componentIdx, futureTableIdx, elemMeta } = ctx;

    const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
    if (!taskMeta) {
        throw new Error('invalid/missing async task meta');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('invalid/missing async task');
    }

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave');
    }

    const { readEnd, writeEnd } = createFuture(_context.creation, cstate, {
        tableIdx: futureTableIdx,
        elemMeta,
    });

    let writeEndWaitableIdx = writeEnd.waitableIdx();
    let readEndWaitableIdx = readEnd.waitableIdx();

    return (BigInt(writeEndWaitableIdx) << 32n) | BigInt(readEndWaitableIdx);
}

export function futureNewFromLift(_context, ctx) {
    debugLog('[futureNewFromLift()] args', { ctx });
    const { componentIdx, futureEndWaitableIdx, futureTableIdx, payloadLiftFn, payloadTypeSize32, payloadLowerFn } =
        ctx;

    void payloadTypeSize32;
    const future = new _context.HostFuture({
        componentIdx,
        futureEndWaitableIdx,
        futureTableIdx,
        payloadLiftFn: payloadLiftFn,
        payloadLowerFn: payloadLowerFn,
    });

    const rep = _context.futures.insert(future);
    future.setRep(rep);

    return future.createUserFuture();
}

export function futureWrite(_context, ctx, futureEndWaitableIdx, ptr) {
    debugLog('[futureWrite()] args', {
        ctx,
        futureEndWaitableIdx,
        ptr,
    });
    const {
        componentIdx,
        futureTableIdx,
        memoryIdx,
        getMemoryFn,
        reallocIdx,
        getReallocFn,
        stringEncoding,
        isAsync,
        elemMeta,
    } = ctx;

    void memoryIdx;
    void reallocIdx;
    // pointers at or above 2GiB come in as negative values
    ptr >>>= 0;

    const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
    if (!taskMeta) {
        throw new Error('missing task metadata during future operation');
    }

    const task = taskMeta.task;
    if (!task) {
        throw new Error('missing task in metadata during future operation');
    }

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave');
    }

    if (!task.mayBlock() && !isAsync) {
        throw new Error('only tasks that may block may call future.futureWrite');
    }

    const futureEnd = getFutureEnd(_context.ends, { tableIdx: futureTableIdx, futureEndWaitableIdx });
    if (!futureEnd) {
        throw new Error(`missing future with waitable idx [${futureEndWaitableIdx}] (component [${componentIdx}])`);
    }
    if (!(futureEnd instanceof _context.FutureEnd)) {
        throw new _context.RuntimeError('invalid future end, expected [FutureWritableEnd]');
    }
    if (futureEnd.isDoneState()) {
        const message = futureEnd.isWritable()
            ? 'cannot write to future after previous write succeeded or readable end dropped'
            : 'cannot read from future after previous read succeeded';
        throw new _context.RuntimeError(message);
    }
    if (!futureEnd.isIdleState()) {
        throw new _context.RuntimeError('cannot have concurrent operations active on a future/stream');
    }

    if (futureEnd.hasPendingEvent()) {
        const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
        if (code !== _context.events.FUTURE_WRITE) {
            throw new Error(`mismatched event code [${code}] (expected _context.events.FUTURE_WRITE)`);
        }
        if (index !== futureEnd.waitableIdx()) {
            throw new Error('mismatched future end index');
        }
        return payload;
    }

    futureEnd.guestWrite({
        componentIdx,
        stringEncoding,
        elemMeta,
        memory: getMemoryFn?.(),
        realloc: getReallocFn?.(),
        getReallocFn,
        ptr,
    });

    if (!futureEnd.hasPendingEvent()) {
        if (isAsync) {
            futureEnd.setCopyState(_context.Base.CopyState.ASYNC_COPYING);
            return asyncBlockedCode;
        } else {
            futureEnd.setCopyState(_context.Base.CopyState.SYNC_COPYING);
            return task
                .suspendUntil({
                    readyFn: () => futureEnd.hasPendingEvent(),
                })
                .then((completed) => {
                    // The wait is resumed without the copy's event when the
                    // task is torn down (e.g. the store trapped meanwhile).
                    if (!completed || !futureEnd.hasPendingEvent()) {
                        throw (
                            task.isErrored() ??
                            new _context.RuntimeError('synchronous future operation interrupted before completion')
                        );
                    }
                    const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
                    if (code !== _context.events.FUTURE_WRITE) {
                        throw new Error(`mismatched event code [${code}] (expected _context.events.FUTURE_WRITE)`);
                    }
                    if (index !== futureEnd.waitableIdx()) {
                        throw new Error('mismatched future end index');
                    }
                    return payload;
                });
        }
    }

    const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
    if (code !== _context.events.FUTURE_WRITE) {
        throw new Error(`mismatched event code [${code}] (expected _context.events.FUTURE_WRITE)`);
    }
    if (index !== futureEnd.waitableIdx()) {
        throw new Error('mismatched future end index');
    }

    return payload;
}

export function futureRead(_context, ctx, futureEndWaitableIdx, ptr) {
    debugLog('[futureRead()] args', {
        ctx,
        futureEndWaitableIdx,
        ptr,
    });
    const {
        componentIdx,
        futureTableIdx,
        memoryIdx,
        getMemoryFn,
        reallocIdx,
        getReallocFn,
        stringEncoding,
        isAsync,
        elemMeta,
    } = ctx;

    void memoryIdx;
    void reallocIdx;
    // pointers at or above 2GiB come in as negative values
    ptr >>>= 0;

    const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
    if (!taskMeta) {
        throw new Error('missing task metadata during future operation');
    }

    const task = taskMeta.task;
    if (!task) {
        throw new Error('missing task in metadata during future operation');
    }

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave');
    }

    if (!task.mayBlock() && !isAsync) {
        throw new Error('only tasks that may block may call future.futureRead');
    }

    const futureEnd = getFutureEnd(_context.ends, { tableIdx: futureTableIdx, futureEndWaitableIdx });
    if (!futureEnd) {
        throw new Error(`missing future with waitable idx [${futureEndWaitableIdx}] (component [${componentIdx}])`);
    }
    if (!(futureEnd instanceof _context.FutureEnd)) {
        throw new _context.RuntimeError('invalid future end, expected [FutureReadableEnd]');
    }
    if (futureEnd.isDoneState()) {
        const message = futureEnd.isWritable()
            ? 'cannot write to future after previous write succeeded or readable end dropped'
            : 'cannot read from future after previous read succeeded';
        throw new _context.RuntimeError(message);
    }
    if (!futureEnd.isIdleState()) {
        throw new _context.RuntimeError('cannot have concurrent operations active on a future/stream');
    }

    if (futureEnd.hasPendingEvent()) {
        const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
        if (code !== _context.events.FUTURE_READ) {
            throw new Error(`mismatched event code [${code}] (expected _context.events.FUTURE_READ)`);
        }
        if (index !== futureEnd.waitableIdx()) {
            throw new Error('mismatched future end index');
        }
        return payload;
    }

    futureEnd.guestRead({
        componentIdx,
        stringEncoding,
        elemMeta,
        memory: getMemoryFn?.(),
        realloc: getReallocFn?.(),
        getReallocFn,
        ptr,
    });

    if (!futureEnd.hasPendingEvent()) {
        if (isAsync) {
            futureEnd.setCopyState(_context.Base.CopyState.ASYNC_COPYING);
            return asyncBlockedCode;
        } else {
            futureEnd.setCopyState(_context.Base.CopyState.SYNC_COPYING);
            return task
                .suspendUntil({
                    readyFn: () => futureEnd.hasPendingEvent(),
                })
                .then((completed) => {
                    // The wait is resumed without the copy's event when the
                    // task is torn down (e.g. the store trapped meanwhile).
                    if (!completed || !futureEnd.hasPendingEvent()) {
                        throw (
                            task.isErrored() ??
                            new _context.RuntimeError('synchronous future operation interrupted before completion')
                        );
                    }
                    const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
                    if (code !== _context.events.FUTURE_READ) {
                        throw new Error(`mismatched event code [${code}] (expected _context.events.FUTURE_READ)`);
                    }
                    if (index !== futureEnd.waitableIdx()) {
                        throw new Error('mismatched future end index');
                    }
                    return payload;
                });
        }
    }

    const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
    if (code !== _context.events.FUTURE_READ) {
        throw new Error(`mismatched event code [${code}] (expected _context.events.FUTURE_READ)`);
    }
    if (index !== futureEnd.waitableIdx()) {
        throw new Error('mismatched future end index');
    }

    return payload;
}

export function futureCancelRead(_context, ctx, futureEndWaitableIdx) {
    debugLog('[futureCancelRead()] args', {
        ctx,
        futureEndWaitableIdx,
    });
    const { componentIdx, futureTableIdx, isAsync } = ctx;

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave');
    }

    const futureEnd = getFutureEnd(_context.ends, { tableIdx: futureTableIdx, futureEndWaitableIdx });
    if (!futureEnd) {
        throw new _context.RuntimeError(`missing future end with idx [${futureEndWaitableIdx}]`);
    }
    if (!(futureEnd instanceof _context.FutureEnd)) {
        throw new _context.RuntimeError('invalid future end, expected value of type [FutureReadableEnd]');
    }

    if (!futureEnd.isCopying()) {
        throw new _context.RuntimeError('future end is not copying, cannot cancel');
    }

    futureEnd.setCopyState(_context.FutureEnd.CopyState.CANCELLING_COPY);

    const finishCancel = () => {
        const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
        if (futureEnd.isCopying()) {
            throw new Error('future end is still in copying state');
        }
        if (code !== _context.events.FUTURE_READ) {
            throw new Error('unexpected event code [' + code + '], expected [' + _context.events.FUTURE_READ + ']');
        }
        if (index !== futureEndWaitableIdx) {
            throw new Error('index does not match future end');
        }

        return payload;
    };

    if (!futureEnd.hasPendingEvent()) {
        futureEnd.cancel();

        if (!futureEnd.hasPendingEvent()) {
            if (isAsync) {
                return asyncBlockedCode;
            }

            const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
            if (!taskMeta?.task) {
                throw new Error('missing current task while cancelling future');
            }
            return taskMeta.task.suspendUntil({ readyFn: () => futureEnd.hasPendingEvent() }).then(finishCancel);
        }
    }

    return finishCancel();
}

export function futureCancelWrite(_context, ctx, futureEndWaitableIdx) {
    debugLog('[futureCancelWrite()] args', {
        ctx,
        futureEndWaitableIdx,
    });
    const { componentIdx, futureTableIdx, isAsync } = ctx;

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave');
    }

    const futureEnd = getFutureEnd(_context.ends, { tableIdx: futureTableIdx, futureEndWaitableIdx });
    if (!futureEnd) {
        throw new _context.RuntimeError(`missing future end with idx [${futureEndWaitableIdx}]`);
    }
    if (!(futureEnd instanceof _context.FutureEnd)) {
        throw new _context.RuntimeError('invalid future end, expected value of type [FutureWritableEnd]');
    }

    if (!futureEnd.isCopying()) {
        throw new _context.RuntimeError('future end is not copying, cannot cancel');
    }

    futureEnd.setCopyState(_context.FutureEnd.CopyState.CANCELLING_COPY);

    const finishCancel = () => {
        const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
        if (futureEnd.isCopying()) {
            throw new Error('future end is still in copying state');
        }
        if (code !== _context.events.FUTURE_WRITE) {
            throw new Error('unexpected event code [' + code + '], expected [' + _context.events.FUTURE_WRITE + ']');
        }
        if (index !== futureEndWaitableIdx) {
            throw new Error('index does not match future end');
        }

        return payload;
    };

    if (!futureEnd.hasPendingEvent()) {
        futureEnd.cancel();

        if (!futureEnd.hasPendingEvent()) {
            if (isAsync) {
                return asyncBlockedCode;
            }

            const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
            if (!taskMeta?.task) {
                throw new Error('missing current task while cancelling future');
            }
            return taskMeta.task.suspendUntil({ readyFn: () => futureEnd.hasPendingEvent() }).then(finishCancel);
        }
    }

    return finishCancel();
}

export function futureDropReadable(_context, ctx, futureEndWaitableIdx) {
    debugLog('[futureDropReadable()] args', { ctx });
    const { componentIdx, futureTableIdx } = ctx;

    const cstate = getOrCreateAsyncState(_context.tables.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave');
    }

    const futureEnd = removeFutureEndFromTable(_context.tables, {
        tableIdx: futureTableIdx,
        futureWaitableIdx: futureEndWaitableIdx,
    });
    if (!(futureEnd instanceof _context.FutureEnd)) {
        throw new _context.RuntimeError('invalid future end, expected [FutureReadableEnd]');
    }

    futureEnd.drop();
}

export function futureDropWritable(_context, ctx, futureEndWaitableIdx) {
    debugLog('[futureDropWritable()] args', { ctx });
    const { componentIdx, futureTableIdx } = ctx;

    const cstate = getOrCreateAsyncState(_context.tables.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave');
    }

    const futureEnd = removeFutureEndFromTable(_context.tables, {
        tableIdx: futureTableIdx,
        futureWaitableIdx: futureEndWaitableIdx,
    });
    if (!(futureEnd instanceof _context.FutureEnd)) {
        throw new _context.RuntimeError('invalid future end, expected [FutureWritableEnd]');
    }

    futureEnd.drop();
}

export function futureTransfer(_context, srcFutureWaitableIdx, srcTableIdx, destTableIdx) {
    debugLog('[futureTransfer()] args', {
        srcFutureWaitableIdx,
        srcTableIdx,
        destTableIdx,
    });

    const futureMeta = _context.tables[srcTableIdx];
    if (!futureMeta) {
        throw new Error('missing future meta during transfer');
    }
    const componentIdx = futureMeta.componentIdx;

    // NOTE: no current-task lookup here: per the Canonical ABI the
    // transfer is a pure table operation between the source and
    // destination components' waitable tables, and the
    // return-position transfer of a fused *sync* call runs after
    // the callee task's teardown (same as stream.transfer).

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate) {
        throw new Error(`missing async state for component [${componentIdx}]`);
    }

    const futureEnd = getFutureEnd(_context, { tableIdx: srcTableIdx, futureEndWaitableIdx: srcFutureWaitableIdx });
    if (!futureEnd.isReadable()) {
        throw new Error('writable future ends cannot be moved');
    }
    if (futureEnd.isDoneState()) {
        throw new _context.RuntimeError('cannot lift future after previous read succeeded');
    }
    if (futureEnd.isInSet()) {
        throw new _context.RuntimeError("cannot lift future while it's in a waitable set");
    }

    const removedFutureEnd = removeFutureEndFromTable(_context, {
        tableIdx: srcTableIdx,
        futureWaitableIdx: srcFutureWaitableIdx,
    });
    if (removedFutureEnd !== futureEnd) {
        throw new Error('removed future end does not match validated future end');
    }

    const { handle, waitableIdx } = addFutureEndToTable(_context, { tableIdx: destTableIdx, futureEnd });
    futureEnd.setTarget(`future read end (waitable [${waitableIdx}])`);

    debugLog('[futureTransfer()] successfully transferred', {
        dest: {
            futureEndHandle: handle,
            futureEndWaitableIdx: waitableIdx,
            tableIdx: destTableIdx,
        },
        src: {
            futureEndWaitableIdx: srcFutureWaitableIdx,
            tableIdx: srcTableIdx,
        },
        componentIdx,
    });

    return waitableIdx;
}

export function genFutureHostInjectFn(_context, genArgs) {
    const { promise, hostWriteEnd, stringEncoding, getReallocFn } = genArgs;
    if (promise instanceof Promise) {
        promise.catch(() => {});
    }
    let done;
    let delivered = false;

    const inject = async function generateFutureHostInject(args) {
        let { count } = args;
        if (count !== 1) {
            throw new Error('invalid count');
        }

        // Futures should only be completed once
        if (done) {
            return () => {
                throw new Error('cannot inject write: future already completed');
            };
        }

        // The host *must* write something to this channel before closing it
        if (hostWriteEnd.isDoneState()) {
            return () => {
                throw new Error('cannot inject write: host must write to future before closing');
            };
        }

        let value;
        try {
            value = await trackHostOperation(_context.tracking, () => promise);
        } catch (err) {
            // The reader was dropped (and the promise disposed) while it was pending,
            // so a rejection (e.g. from handling disposal) has nowhere to go
            if (hostWriteEnd.isPeerDropped()) {
                return () => {};
            }
            const elemMeta = hostWriteEnd.getElemMeta();
            if (!elemMeta.payloadTypeName?.startsWith('Result(')) {
                debugLog('failed to inject host write', err);
                throw new Error('cannot inject write: promise failed');
            }
            value = { tag: 'err', val: getErrorPayload(_context.hasOwnProperty, err) };
        }

        // A value produced after the reader was dropped is never delivered
        if (hostWriteEnd.isPeerDropped()) {
            return () => {};
        }

        try {
            // If we've read a nested promise from the outside,
            // we must convert the value that we get back into a future,
            // because we are not at the lowest level yet.
            if (value && typeof value === 'object' && value[_context.nestedSymbol]) {
                value = Promise.resolve(value);
            }

            delivered = await hostWriteEnd.hostWrite({ stringEncoding, value, getReallocFn });
        } catch (err) {
            debugLog('failed to inject host write', err);
            throw new Error('cannot inject write: promise failed');
        }

        hostWriteEnd.getPendingEvent();
        hostWriteEnd.drop();

        return () => {
            // After the write is finished, we consume the event that was generated
            // by the just-in-time write (and the subsequent read), if one was generated
            if (hostWriteEnd.hasPendingEvent()) {
                hostWriteEnd.getPendingEvent();
            }
        };
    };

    // Called when the guest drops the read end: a value that was never delivered
    // was discarded, so the host promise is disposed
    inject.drop = () => {
        if (!delivered) {
            disposeHostValue(_context.disposeSymbol, promise);
        }
    };

    return inject;
}

export function isFutureLowerableObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return false;
    }
    return obj instanceof Promise || ('then' in obj && typeof obj.then === 'function');
}
