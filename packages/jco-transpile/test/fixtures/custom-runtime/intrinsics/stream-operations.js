import { debugLog } from './core-debug.js';
import { getOrCreateAsyncState } from './component.js';
import { getCurrentTask } from './task-operations.js';
import { asyncBlockedCode } from './async-task.js';
import {
    createStream,
    getStreamEnd,
    deleteStreamEnd,
    removeStreamEndFromTable,
    addStreamEndToTable,
} from './stream-state.js';
export function streamNew(_context, ctx) {
    debugLog('[streamNew()] args', { ctx });
    const { streamTableIdx, callerComponentIdx, elemMeta } = ctx;
    if (callerComponentIdx === undefined) {
        throw new Error('missing caller component idx during stream.new');
    }
    const taskMeta = getCurrentTask(_context.taskLookup, callerComponentIdx);
    if (!taskMeta) {
        throw new Error('missing async task metadata during stream.new');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('invalid/missing async task during stream.new');
    }
    if (task.componentIdx() !== callerComponentIdx) {
        throw new Error(
            `task component idx [${task.componentIdx()}] does not match stream new intrinsic component idx [${callerComponentIdx}]`,
        );
    }
    const cstate = getOrCreateAsyncState(_context.lookup, callerComponentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave during stream.new');
    }
    const { writeEndWaitableIdx, readEndWaitableIdx, writeEndHandle, readEndHandle } = createStream(
        _context.creation,
        cstate,
        {
            tableIdx: streamTableIdx,
            elemMeta,
        },
    );
    debugLog('[streamNew()] created stream ends', {
        writeEnd: {
            waitableIdx: writeEndWaitableIdx,
            handle: writeEndHandle,
        },
        readEnd: {
            waitableIdx: readEndWaitableIdx,
            handle: readEndHandle,
        },
        streamTableIdx,
        callerComponentIdx,
    });
    return (BigInt(writeEndWaitableIdx) << 32n) | BigInt(readEndWaitableIdx);
}
export function streamNewFromLift(_context, ctx) {
    debugLog('[streamNewFromLift()] args', { ctx });
    const { componentIdx, streamEndWaitableIdx, streamTableIdx, payloadLiftFn, payloadTypeSize32, payloadLowerFn } =
        ctx;
    void payloadTypeSize32;
    const stream = new _context.HostStream({
        componentIdx,
        streamEndWaitableIdx,
        streamTableIdx,
        payloadLiftFn: payloadLiftFn,
        payloadLowerFn: payloadLowerFn,
    });
    const rep = _context.streams.insert(stream);
    stream.setRep(rep);
    return stream.createUserStream();
}
export function streamRead(_context, ctx, streamEndWaitableIdx, ptr, count) {
    debugLog('[streamRead()] args', { ctx, streamEndWaitableIdx, ptr, count });
    const {
        componentIdx,
        memoryIdx,
        getMemoryFn,
        reallocIdx,
        getReallocFn,
        stringEncoding,
        isAsync,
        streamTableIdx,
        elemMeta,
        syncFastOnly,
        deferSyncFinish,
    } = ctx;
    void memoryIdx;
    void reallocIdx;
    if (componentIdx === undefined) {
        throw new TypeError('missing/invalid component idx');
    }
    if (streamTableIdx === undefined) {
        throw new TypeError('missing/invalid stream table idx');
    }
    if (streamEndWaitableIdx === undefined) {
        throw new TypeError('missing/invalid stream end idx');
    }
    // pointers at or above 2GiB come in as negative values
    ptr >>>= 0;
    // count may come in as u32::MAX which is mangled by JS into a negative value
    count = Math.min(count >>> 0, _context.ManagedBuffer.MAX_LENGTH);
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave');
    }
    if (!_context.mayBlock && !isAsync) {
        throw new _context.RuntimeError('only async tasks or otherwise blocking-allowed tasks my stream.streamRead');
    }
    const streamEnd = getStreamEnd(_context.ends, { tableIdx: streamTableIdx, streamEndWaitableIdx });
    if (!streamEnd) {
        throw new _context.RuntimeError(
            `missing stream end [${streamEndWaitableIdx}] (table [${streamTableIdx}], component [${componentIdx}])`,
        );
    }
    if (!(streamEnd instanceof _context.StreamEnd)) {
        throw new _context.RuntimeError('invalid stream type, expected _context.StreamEnd');
    }
    if (streamEnd.streamTableIdx() !== streamTableIdx) {
        throw new Error(
            `stream end table idx [${streamEnd.streamTableIdx()}] != operation table idx [${streamTableIdx}]`,
        );
    }
    if (streamEnd.isDoneState()) {
        const message = streamEnd.isWritable()
            ? 'cannot write to stream after being notified that the readable end dropped'
            : 'cannot read from stream after being notified that the writable end dropped';
        throw new _context.RuntimeError(message);
    }
    // Validate before copy can return early for a dropped peer.
    const memory = getMemoryFn?.();
    _context.ManagedBuffer.validateGuestBuffer(memory, ptr, count, elemMeta ?? streamEnd.getElemMeta());
    // A synchronous canonical operation is exposed through a
    // plain Wasm fast path so an already-queued event can be
    // consumed without entering JSPI. If it would block, the
    // generated conditional trampoline retries on its
    // suspending slow path.
    if (syncFastOnly && !streamEnd.hasPendingEvent() && !streamEnd.isPeerDropped() && !streamEnd.hasPendingBuffer()) {
        // -2 tells the conditional trampoline to take its suspending
        // slow path (a synchronous copy must block, never report BLOCKED).
        return 0xfffffffe;
    }
    return streamEnd.copy({
        isAsync,
        memory,
        ptr,
        count,
        eventCode: _context.events.STREAM_READ,
        componentIdx,
        stringEncoding,
        realloc: getReallocFn?.(),
        getReallocFn,
        elemMeta,
        deferSyncFinish,
    });
}
export function streamWrite(_context, ctx, streamEndWaitableIdx, ptr, count) {
    debugLog('[streamWrite()] args', { ctx, streamEndWaitableIdx, ptr, count });
    const {
        componentIdx,
        memoryIdx,
        getMemoryFn,
        reallocIdx,
        getReallocFn,
        stringEncoding,
        isAsync,
        streamTableIdx,
        elemMeta,
        syncFastOnly,
        deferSyncFinish,
    } = ctx;
    void memoryIdx;
    void reallocIdx;
    if (componentIdx === undefined) {
        throw new TypeError('missing/invalid component idx');
    }
    if (streamTableIdx === undefined) {
        throw new TypeError('missing/invalid stream table idx');
    }
    if (streamEndWaitableIdx === undefined) {
        throw new TypeError('missing/invalid stream end idx');
    }
    // pointers at or above 2GiB come in as negative values
    ptr >>>= 0;
    // count may come in as u32::MAX which is mangled by JS into a negative value
    count = Math.min(count >>> 0, _context.ManagedBuffer.MAX_LENGTH);
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave');
    }
    if (!_context.mayBlock && !isAsync) {
        throw new _context.RuntimeError('only async tasks or otherwise blocking-allowed tasks my stream.streamWrite');
    }
    const streamEnd = getStreamEnd(_context.ends, { tableIdx: streamTableIdx, streamEndWaitableIdx });
    if (!streamEnd) {
        throw new _context.RuntimeError(
            `missing stream end [${streamEndWaitableIdx}] (table [${streamTableIdx}], component [${componentIdx}])`,
        );
    }
    if (!(streamEnd instanceof _context.StreamEnd)) {
        throw new _context.RuntimeError('invalid stream type, expected _context.StreamEnd');
    }
    if (streamEnd.streamTableIdx() !== streamTableIdx) {
        throw new Error(
            `stream end table idx [${streamEnd.streamTableIdx()}] != operation table idx [${streamTableIdx}]`,
        );
    }
    if (streamEnd.isDoneState()) {
        const message = streamEnd.isWritable()
            ? 'cannot write to stream after being notified that the readable end dropped'
            : 'cannot read from stream after being notified that the writable end dropped';
        throw new _context.RuntimeError(message);
    }
    // Validate before copy can return early for a dropped peer.
    const memory = getMemoryFn?.();
    _context.ManagedBuffer.validateGuestBuffer(memory, ptr, count, elemMeta ?? streamEnd.getElemMeta());
    // A synchronous canonical operation is exposed through a
    // plain Wasm fast path so an already-queued event can be
    // consumed without entering JSPI. If it would block, the
    // generated conditional trampoline retries on its
    // suspending slow path.
    if (syncFastOnly && !streamEnd.hasPendingEvent() && !streamEnd.isPeerDropped() && !streamEnd.hasPendingBuffer()) {
        // -2 tells the conditional trampoline to take its suspending
        // slow path (a synchronous copy must block, never report BLOCKED).
        return 0xfffffffe;
    }
    return streamEnd.copy({
        isAsync,
        memory,
        ptr,
        count,
        eventCode: _context.events.STREAM_WRITE,
        componentIdx,
        stringEncoding,
        realloc: getReallocFn?.(),
        getReallocFn,
        elemMeta,
        deferSyncFinish,
    });
}
export function streamCancelRead(_context, ctx, streamEndWaitableIdx) {
    debugLog('[streamCancelRead()] args', { ctx, streamEndWaitableIdx });
    const { streamTableIdx, isAsync, componentIdx } = ctx;
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave');
    }
    const streamEnd = getStreamEnd(_context.ends, { streamEndWaitableIdx, tableIdx: streamTableIdx });
    if (!streamEnd) {
        throw new _context.RuntimeError('missing stream end with idx [' + streamEndWaitableIdx + ']');
    }
    if (!(streamEnd instanceof _context.StreamEnd)) {
        throw new Error('invalid stream end, expected value of type [StreamReadableEnd]');
    }
    if (!streamEnd.isCopying()) {
        throw new _context.RuntimeError('stream end is not copying, cannot cancel');
    }
    streamEnd.setCopyState(_context.StreamEnd.CopyState.CANCELLING_COPY);
    const finishCancel = () => {
        const event = streamEnd.getPendingEvent();
        const { code, payload0: index, payload1: payload } = event;
        if (streamEnd.isCopying()) {
            throw new Error(`stream end (idx [${streamEndWaitableIdx}]) is still in copying state`);
        }
        if (code !== _context.events.STREAM_READ) {
            throw new Error(`unexpected event code [${code}], expected [_context.events.STREAM_READ]`);
        }
        if (index !== streamEnd.waitableIdx()) {
            throw new Error('event index does not match stream end');
        }
        debugLog('[streamCancelRead()] successful cancel', { ctx, streamEndWaitableIdx, streamEnd, event });
        return payload;
    };
    if (!streamEnd.hasPendingEvent()) {
        streamEnd.cancel();
        if (!streamEnd.hasPendingEvent()) {
            if (isAsync) {
                return asyncBlockedCode;
            }
            const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
            if (!taskMeta) {
                throw new Error('missing current task metadata while doing stream transfer');
            }
            const task = taskMeta.task;
            if (!task) {
                throw new Error('missing task while doing stream transfer');
            }
            return task
                .suspendUntil({
                    readyFn: () => streamEnd.hasPendingEvent(),
                })
                .then(finishCancel);
        }
    }
    return finishCancel();
}
export function streamCancelWrite(_context, ctx, streamEndWaitableIdx) {
    debugLog('[streamCancelWrite()] args', { ctx, streamEndWaitableIdx });
    const { streamTableIdx, isAsync, componentIdx } = ctx;
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new Error('component instance is not marked as may leave');
    }
    const streamEnd = getStreamEnd(_context.ends, { streamEndWaitableIdx, tableIdx: streamTableIdx });
    if (!streamEnd) {
        throw new _context.RuntimeError('missing stream end with idx [' + streamEndWaitableIdx + ']');
    }
    if (!(streamEnd instanceof _context.StreamEnd)) {
        throw new Error('invalid stream end, expected value of type [StreamWritableEnd]');
    }
    if (!streamEnd.isCopying()) {
        throw new _context.RuntimeError('stream end is not copying, cannot cancel');
    }
    streamEnd.setCopyState(_context.StreamEnd.CopyState.CANCELLING_COPY);
    const finishCancel = () => {
        const event = streamEnd.getPendingEvent();
        const { code, payload0: index, payload1: payload } = event;
        if (streamEnd.isCopying()) {
            throw new Error(`stream end (idx [${streamEndWaitableIdx}]) is still in copying state`);
        }
        if (code !== _context.events.STREAM_WRITE) {
            throw new Error(`unexpected event code [${code}], expected [_context.events.STREAM_WRITE]`);
        }
        if (index !== streamEnd.waitableIdx()) {
            throw new Error('event index does not match stream end');
        }
        debugLog('[streamCancelWrite()] successful cancel', { ctx, streamEndWaitableIdx, streamEnd, event });
        return payload;
    };
    if (!streamEnd.hasPendingEvent()) {
        streamEnd.cancel();
        if (!streamEnd.hasPendingEvent()) {
            if (isAsync) {
                return asyncBlockedCode;
            }
            const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
            if (!taskMeta) {
                throw new Error('missing current task metadata while doing stream transfer');
            }
            const task = taskMeta.task;
            if (!task) {
                throw new Error('missing task while doing stream transfer');
            }
            return task
                .suspendUntil({
                    readyFn: () => streamEnd.hasPendingEvent(),
                })
                .then(finishCancel);
        }
    }
    return finishCancel();
}
export function streamDropReadable(_context, ctx, streamEndWaitableIdx) {
    debugLog('[streamDropReadable()] args', { ctx, streamEndWaitableIdx });
    const { streamTableIdx, componentIdx } = ctx;
    const task = getCurrentTask(_context.taskLookup, componentIdx);
    if (!task) {
        throw new Error('invalid/missing async task');
    }
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate) {
        throw new Error(`missing component state for component idx [${componentIdx}]`);
    }
    const streamEnd = getStreamEnd(_context.ends, { tableIdx: streamTableIdx, streamEndWaitableIdx });
    if (!streamEnd) {
        throw new Error(
            `missing stream (waitable [${streamEndWaitableIdx}], table [${streamTableIdx}], component [${componentIdx}])`,
        );
    }
    if (!(streamEnd instanceof _context.StreamEnd)) {
        throw new _context.RuntimeError('invalid stream end class, expected [StreamReadableEnd]');
    }
    if (streamEnd.isCopying()) {
        throw new _context.RuntimeError('cannot remove busy stream');
    }
    const removedStreamEnd = deleteStreamEnd(_context.ends, { tableIdx: streamTableIdx, streamEndWaitableIdx });
    if (removedStreamEnd !== streamEnd) {
        throw new Error('removed stream end does not match validated stream end');
    }
    streamEnd.drop();
}
export function streamDropWritable(_context, ctx, streamEndWaitableIdx) {
    debugLog('[streamDropWritable()] args', { ctx, streamEndWaitableIdx });
    const { streamTableIdx, componentIdx } = ctx;
    const task = getCurrentTask(_context.taskLookup, componentIdx);
    if (!task) {
        throw new Error('invalid/missing async task');
    }
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate) {
        throw new Error(`missing component state for component idx [${componentIdx}]`);
    }
    const streamEnd = getStreamEnd(_context.ends, { tableIdx: streamTableIdx, streamEndWaitableIdx });
    if (!streamEnd) {
        throw new Error(
            `missing stream (waitable [${streamEndWaitableIdx}], table [${streamTableIdx}], component [${componentIdx}])`,
        );
    }
    if (!(streamEnd instanceof _context.StreamEnd)) {
        throw new _context.RuntimeError('invalid stream end class, expected [StreamWritableEnd]');
    }
    if (streamEnd.isCopying()) {
        throw new _context.RuntimeError('cannot drop busy stream');
    }
    const removedStreamEnd = deleteStreamEnd(_context.ends, { tableIdx: streamTableIdx, streamEndWaitableIdx });
    if (removedStreamEnd !== streamEnd) {
        throw new Error('removed stream end does not match validated stream end');
    }
    streamEnd.drop();
}
export function streamTransfer(_context, srcStreamWaitableIdx, srcTableIdx, destTableIdx) {
    debugLog('[streamTransfer()] args', {
        srcStreamWaitableIdx,
        srcTableIdx,
        destTableIdx,
    });
    const streamMeta = _context.tables[srcTableIdx];
    if (!streamMeta) {
        throw new Error('missing stream meta during transfer');
    }
    const componentIdx = streamMeta.componentIdx;
    // NOTE: no current-task lookup here: per the Canonical ABI the
    // transfer is a pure table operation between the source and
    // destination components' waitable tables.
    //
    // In particular, the return-position transfer of a fused *sync* guest->guest
    // call runs after the callee task's teardown has already cleared the
    // per-component current-task register, so deriving task context
    // from the source stream's owning component is unsatisfiable
    // there.
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate) {
        throw new Error(`missing async state for component [${componentIdx}]`);
    }
    const streamEnd = getStreamEnd(_context, { tableIdx: srcTableIdx, streamEndWaitableIdx: srcStreamWaitableIdx });
    if (!streamEnd.isReadable()) {
        throw new Error('writable stream ends cannot be moved');
    }
    if (streamEnd.isDoneState()) {
        throw new _context.RuntimeError('cannot lift stream after being notified that the writable end dropped');
    }
    if (streamEnd.isInSet()) {
        throw new _context.RuntimeError("cannot lift stream while it's in a waitable set");
    }
    const removedStreamEnd = removeStreamEndFromTable(_context, {
        tableIdx: srcTableIdx,
        streamWaitableIdx: srcStreamWaitableIdx,
    });
    if (removedStreamEnd !== streamEnd) {
        throw new Error('removed stream end does not match validated stream end');
    }
    const { handle, waitableIdx } = addStreamEndToTable(_context, { tableIdx: destTableIdx, streamEnd });
    streamEnd.setTarget(`stream read end (waitable [${waitableIdx}])`);
    debugLog('[streamTransfer()] successfully transferred', {
        dest: {
            streamEndHandle: handle,
            streamEndWaitableIdx: waitableIdx,
            tableIdx: destTableIdx,
        },
        src: {
            streamEndWaitableIdx: srcStreamWaitableIdx,
            tableIdx: srcTableIdx,
        },
        componentIdx,
    });
    return waitableIdx;
}
