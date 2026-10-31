import { debugLog } from './core-debug.js';
import { getOrCreateAsyncState, trackHostOperation } from './component.js';
import { getCurrentTask } from './task-operations.js';
import { asyncBlockedCode } from './async-task.js';
import { promiseWithResolvers } from './core-promises.js';
export function initializeStreamReadableEndClass(_context) {
    const StreamEnd = _context.StreamEnd;
    class StreamReadableEnd extends StreamEnd {
        #copying = false;
        #done = false;
        #elemMeta;
        // held by both write and read ends
        #pendingBufferMeta;
        // table index that the stream is in (can change after a stream transfer)
        #streamTableIdx;
        // handle (index) inside the given table (can change after a stream transfer)
        #handle;
        // internal stream (which has both ends) rep
        #globalStreamMapRep;
        // only populated for lowered (read) stream ends
        #hostInjectFn;
        #hostDropFn;
        #hostCancelFn;
        // only populated for the write side of a lowered read stream end
        #isHostOwned;
        #result = null;
        #sourceRebufferFn = null;
        #endOfStream = false;
        #rejectedLength = null;
        constructor(args) {
            debugLog('[StreamReadableEnd#constructor()] args', args);
            super(args);
            if (!args.elemMeta) {
                throw new Error('missing/invalid element meta');
            }
            this.#elemMeta = args.elemMeta;
            if (!args.pendingBufferMeta) {
                throw new Error('missing/invalid shared pending buffer meta');
            }
            this.#pendingBufferMeta = args.pendingBufferMeta;
            if (args.tableIdx === undefined) {
                throw new Error('missing index for stream table idx');
            }
            this.#streamTableIdx = args.tableIdx;
            this.#hostInjectFn = args.hostInjectFn;
            this.#isHostOwned = args.hostOwned;
        }
        streamTableIdx() {
            return this.#streamTableIdx;
        }
        setStreamTableIdx(idx) {
            this.#streamTableIdx = idx;
        }
        handle() {
            return this.#handle;
        }
        setHandle(h) {
            this.#handle = h;
        }
        globalStreamMapRep() {
            return this.#globalStreamMapRep;
        }
        setGlobalStreamMapRep(rep) {
            this.#globalStreamMapRep = rep;
        }
        waitableIdx() {
            return this.getWaitable().idx();
        }
        setWaitableIdx(idx) {
            const w = this.getWaitable();
            w.setIdx(idx);
            w.setTarget(`waitable for read end (waitable [${idx}])`);
        }
        setHostInjectFn(f) {
            if (this.#hostInjectFn) {
                throw new Error('host injection fn is already set');
            }
            this.#hostInjectFn = f;
        }
        setHostDropFn(f) {
            if (this.#hostDropFn) {
                throw new Error('host drop fn is already set');
            }
            this.#hostDropFn = f;
        }
        setHostCancelFn(f) {
            this.#hostCancelFn = f;
        }
        hasHostInject() {
            return !!this.#hostInjectFn;
        }
        setSourceRebufferFn(f) {
            this.#sourceRebufferFn = f;
        }
        getElemMeta() {
            return { ...this.#elemMeta };
        }
        isReadable() {
            return true;
        }
        isWritable() {
            return false;
        }
        isDoneState() {
            return this.getCopyState() === StreamEnd.CopyState.DONE;
        }
        isCancelledState() {
            return this.getCopyState() === StreamEnd.CopyState.CANCELLED;
        }
        isIdleState() {
            return this.getCopyState() === StreamEnd.CopyState.IDLE;
        }
        async read(opts = 1) {
            debugLog('[StreamReadableEnd#read()]');
            if (this.#endOfStream) {
                return { value: undefined, done: true };
            }
            let { count, rejectLength, dropAfterCopy } = this.#readOpts(opts);
            // Wait for an existing read operation to end, if present,
            // otherwise register this read for any future operations.
            //
            // NOTE: this complexity below is an attempt to sequence operations
            // to ensure consecutive reads only wait on their direct predecessors,
            // (i.e. read #3 must wait on read #2, *not* read #1)
            //
            const newResult = promiseWithResolvers();
            if (this.#result) {
                try {
                    const p = this.#result.promise;
                    this.#result = newResult;
                    await p;
                } catch (err) {
                    debugLog('[StreamReadableEnd#read()] error waiting for previous read', err);
                    // If the previous write we were waiting on errors for any reason,
                    // we can ignore it and attempt to continue with this read
                    // which may also fail for a similar reason
                }
            } else {
                this.#result = newResult;
            }
            const { promise, resolve, reject } = newResult;
            // TODO(fix): when we do a read, we need to GET the string encoding from the
            // other side, via the lift/lower fn?
            count = Math.min(count, _context.ManagedBuffer.MAX_LENGTH);
            try {
                const { id: bufferID, buffer } = _context.buffers.createBuffer({
                    componentIdx: -1, // componentIdx of -1 indicates the host
                    count,
                    isReadable: false,
                    isWritable: true, // we need to write out the pending buffer (if present)
                    elemMeta: this.#elemMeta,
                    data: [],
                });
                buffer.setTarget(`host stream read buffer (id [${bufferID}], count [${count}])`);
                let packedResult;
                packedResult = await this.copy({
                    isAsync: true,
                    count,
                    bufferID,
                    buffer,
                    eventCode: _context.events.STREAM_READ,
                    componentIdx: -1,
                    rejectLength,
                    dropAfterCopy,
                });
                if (packedResult === asyncBlockedCode) {
                    // If the read was blocked, the pending event produced by the
                    // write side represents the completed copy.
                    await new Promise((resolve) => {
                        let waitInterval = setInterval(() => {
                            if (!this.hasPendingEvent()) {
                                return;
                            }
                            clearInterval(waitInterval);
                            resolve();
                        });
                    });
                    if (!this.hasPendingEvent()) {
                        throw new Error('missing pending event after blocked stream read');
                    }
                    const event = this.getPendingEvent();
                    if (!event) {
                        throw new Error('missing pending event after blocked stream read');
                    }
                    const { code, payload0: index, payload1: payload } = event;
                    if (code !== _context.events.STREAM_READ) {
                        throw new Error(`mismatched event code [${code}] for host stream read`);
                    }
                    if (index !== this.waitableIdx()) {
                        throw new Error('invalid stream end index');
                    }
                    if (event.rejectedLength !== undefined) {
                        this.#rejectedLength = event.rejectedLength;
                    }
                    packedResult = payload;
                    if (packedResult === asyncBlockedCode) {
                        throw new Error('unexpected double block during read');
                    }
                }
                const resultKind = packedResult & 0xf;
                const transferred = packedResult >> 4;
                // The copy event is published from inside the guest's current
                // callback slice. Do not expose lifted values to host code until
                // that slice has returned and released the instance lock: the
                // consumer may immediately make a synchronous call on a lifted
                // resource, which cannot itself wait for a contended lock.
                const componentIdx = this.getWaitable().componentIdx();
                if (componentIdx !== -1) {
                    await getOrCreateAsyncState(_context.lookup, componentIdx).waitForExclusiveRelease();
                }
                if (resultKind === StreamEnd.CopyResult.DROPPED) {
                    this.#endOfStream = true;
                }
                if (transferred > 0) {
                    const values = buffer.read(transferred);
                    const { typedArray } = this.#elemMeta;
                    const value =
                        typedArray === undefined ? (count === 1 ? values[0] : values) : new typedArray(values);
                    this.#result = null;
                    // An option's none value is undefined, but still an item.
                    resolve({ value, done: false });
                } else {
                    this.#result = null;
                    resolve({ value: undefined, done: true });
                }
            } catch (err) {
                debugLog('[StreamReadableEnd#read()] error', err);
                reject(err);
            }
            const result = await promise;
            const rejectedLength = this.#rejectedLength;
            this.#rejectedLength = null;
            if (rejectedLength !== null) {
                result.rejectedLength = rejectedLength;
            }
            return result;
        }
        #readOpts(opts) {
            const count =
                opts === undefined
                    ? 1
                    : typeof opts === 'number'
                      ? opts
                      : opts && typeof opts === 'object'
                        ? (opts.count ?? 1)
                        : undefined;
            const rejectLength = opts && typeof opts === 'object' ? opts.rejectLength : undefined;
            if (count === undefined || !Number.isInteger(count) || count < (rejectLength !== undefined ? 0 : 1)) {
                throw new TypeError(`invalid stream read count [${count}]`);
            }
            if (rejectLength !== undefined && (!Number.isInteger(rejectLength) || rejectLength < 0)) {
                throw new TypeError(`invalid stream read reject length [${rejectLength}]`);
            }
            const dropAfterCopy = opts && typeof opts === 'object' ? opts.dropAfterCopy === true : false;
            return { count, rejectLength, dropAfterCopy };
        }
        _read(args) {
            const { buffer, onCopyDoneFn, onCopyFn, componentIdx, rejectLength, dropAfterCopy } = args;
            if (this.isDropped()) {
                onCopyDoneFn(StreamEnd.CopyResult.DROPPED);
                return;
            }
            if (!this.#pendingBufferMeta.buffer) {
                this.setPendingBufferMeta({
                    componentIdx,
                    buffer,
                    onCopyFn,
                    onCopyDoneFn,
                    rejectLength,
                    dropAfterCopy,
                });
                return;
            }
            const pendingElemMeta = this.#pendingBufferMeta.buffer.getElemMeta();
            const newBufferElemMeta = buffer.getElemMeta();
            if (pendingElemMeta.payloadTypeName !== newBufferElemMeta.payloadTypeName) {
                throw new _context.RuntimeError('stream end type does not match internal buffer');
            }
            // Since we do not know the string encoding until a write is performed, it is possible that
            // one end (i.e. the read end) does not yet know the appropriate string encoding to use when
            // lifting/lowering.
            if (newBufferElemMeta.stringEncoding === undefined || pendingElemMeta.stringEncoding === undefined) {
                const encoding = pendingElemMeta.stringEncoding ?? newBufferElemMeta.stringEncoding;
                if (encoding === undefined) {
                    throw new Error('both writer & reader missing string encoding');
                }
                newBufferElemMeta.stringEncoding = encoding;
                pendingElemMeta.stringEncoding = encoding;
            }
            // If the buffer came from the same component that is currently doing the operation
            // we're doing a inter-component read, and only unit or numeric types are allowed
            const pendingElemIsNoneOrNumeric = pendingElemMeta.isNone || pendingElemMeta.isNumeric;
            // End.copy checks the payload type even when either buffer is empty.
            if (
                this.#pendingBufferMeta.componentIdx === buffer.componentIdx() &&
                buffer.componentIdx() !== -1 &&
                !pendingElemIsNoneOrNumeric
            ) {
                throw new _context.RuntimeError(
                    'cannot read from and write to intra-component future/stream with non-numeric payload',
                );
            }
            const pendingRemaining = this.#pendingBufferMeta.buffer.remaining();
            const shouldDropAfterCopy = dropAfterCopy || this.#pendingBufferMeta.dropAfterCopy;
            // Preserve the inline implementation's bookkeeping.
            // eslint-disable-next-line no-unused-vars
            let transferred = false;
            if (pendingRemaining > 0) {
                const bufferRemaining = buffer.remaining();
                if (rejectLength !== undefined && pendingRemaining > rejectLength) {
                    this.resetAndNotifyPending(StreamEnd.CopyResult.DROPPED);
                    onCopyDoneFn(StreamEnd.CopyResult.DROPPED, pendingRemaining);
                    return;
                }
                if (bufferRemaining > 0) {
                    const count = Math.min(pendingRemaining, bufferRemaining);
                    const transferResources =
                        buffer.componentIdx() !== -1 && this.#pendingBufferMeta.buffer.componentIdx() !== -1;
                    buffer.write(this.#pendingBufferMeta.buffer.read(count, { transferResources }), {
                        transferResources,
                    });
                    this.#pendingBufferMeta.onCopyFn(
                        () => this.resetPendingBufferMeta(),
                        shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED,
                    );
                    transferred = true;
                }
                onCopyDoneFn(shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED);
                return;
            }
            this.resetAndNotifyPending(StreamEnd.CopyResult.COMPLETED);
            this.setPendingBufferMeta({ componentIdx, buffer, onCopyFn, onCopyDoneFn, rejectLength, dropAfterCopy });
        }
        setupCopy(args) {
            const { memory, ptr, count, eventCode, componentIdx, skipStateCheck } = args;
            if (eventCode === undefined) {
                throw new Error('missing/invalid event code');
            }
            let buffer = args.buffer;
            let bufferID = args.bufferID;
            // Only check invariants if we are *not* doing a follow-up/post-blocked read
            if (!skipStateCheck) {
                if (this.isCopying()) {
                    throw new _context.RuntimeError('cannot have concurrent operations active on a future/stream');
                }
                if (this.getCopyState() !== StreamEnd.CopyState.IDLE) {
                    throw new Error(`stream copy state is not idle`);
                }
            }
            const elemMeta = args.elemMeta ?? this.getElemMeta();
            if (elemMeta.isBorrowed) {
                throw new Error('borrowed types cannot be sent over streams');
            }
            // If we already have a managed buffer (likely host case), we can use that, otherwise we must
            // create a buffer (likely in the guest case)
            if (!buffer) {
                const newBufferMeta = _context.buffers.createBuffer({
                    componentIdx,
                    memory,
                    start: ptr,
                    count,
                    // If creating a buffer for a write operation, the buffer we are encapsulating
                    // is a *readable* buffer from the view of the component (as it has written to that buffer data that)
                    // should be sent out
                    isReadable: this.isWritable(),
                    // If creating a buffer for a read operation, the buffer we are encapsulating
                    // is a *writable* buffer from the view of the component (as it has prepared space to receive data)
                    isWritable: this.isReadable(),
                    elemMeta,
                });
                bufferID = newBufferMeta.id;
                buffer = newBufferMeta.buffer;
                buffer.setTarget(
                    `component [${componentIdx}] StreamReadableEnd buffer (id [${bufferID}], count [${count}], eventCode [${eventCode}])`,
                );
            }
            const streamEnd = this;
            const processFn = (result, reclaimBufferFn, rejectedLength) => {
                if (reclaimBufferFn) {
                    reclaimBufferFn();
                }
                // Copy events are materialized lazily. Cancellation may begin
                // after progress queued a COMPLETED event but before the guest
                // consumed it; preserve the count and report the cancellation.
                if (
                    result === StreamEnd.CopyResult.COMPLETED &&
                    streamEnd.getCopyState() === StreamEnd.CopyState.CANCELLING_COPY &&
                    !streamEnd.hasHostInject()
                ) {
                    result = StreamEnd.CopyResult.CANCELLED;
                }
                if (result === StreamEnd.CopyResult.DROPPED) {
                    streamEnd.setCopyState(StreamEnd.CopyState.DONE);
                } else {
                    streamEnd.setCopyState(StreamEnd.CopyState.IDLE);
                }
                if (result < 0 || result >= 16) {
                    throw new Error(`unsupported stream copy result [${result}]`);
                }
                if (buffer.processed >= _context.ManagedBuffer.MAX_LENGTH) {
                    throw new Error(`processed count [${buffer.processed}] greater than max length`);
                }
                if (buffer.capacity > 2 ** 28) {
                    throw new Error('buffer uses reserved space');
                }
                const packedResult = (Number(buffer.processed) << 4) | result;
                const event = {
                    code: eventCode,
                    payload0: streamEnd.waitableIdx(),
                    payload1: packedResult,
                };
                if (rejectedLength !== undefined) {
                    event.rejectedLength = rejectedLength;
                }
                return event;
            };
            const onCopyFn = (reclaimBufferFn, result = StreamEnd.CopyResult.COMPLETED) => {
                streamEnd.setPendingEvent(() => {
                    return processFn(result, reclaimBufferFn);
                });
            };
            const onCopyDoneFn = (result, rejectedLength) => {
                streamEnd.setPendingEvent(() => {
                    return processFn(result, undefined, rejectedLength);
                });
            };
            return { bufferID, buffer, onCopyFn, onCopyDoneFn };
        }
        copy(args) {
            const {
                isAsync,
                memory,
                componentIdx,
                ptr,
                count,
                eventCode,
                initial,
                skipStateCheck,
                stringEncoding,
                reallocFn,
                rejectLength,
                elemMeta,
                dropAfterCopy,
                deferSyncFinish,
            } = args;
            void reallocFn;
            if (eventCode === undefined) {
                throw new TypeError('missing/invalid event code');
            }
            // The operation's metadata supplies the current component's
            // lift/lower functions, while the stream's metadata supplies
            // the canonical payload identity shared across components.
            const copyElemMeta = elemMeta
                ? { ...elemMeta, payloadTypeName: this.#elemMeta.payloadTypeName }
                : this.#elemMeta;
            if (copyElemMeta.stringEncoding === undefined && stringEncoding) {
                copyElemMeta.stringEncoding = stringEncoding;
            }
            if (copyElemMeta.stringEncoding && stringEncoding && copyElemMeta.stringEncoding !== stringEncoding) {
                throw new Error(
                    `inconsistent string encoding (previously [${copyElemMeta.stringEncoding}], now [${stringEncoding}])`,
                );
            }
            if (args.getReallocFn && copyElemMeta.getReallocFn === undefined) {
                copyElemMeta.getReallocFn = args.getReallocFn;
            }
            if (this.hasPendingEvent()) {
                const event = this.getPendingEvent();
                if (event.code !== eventCode || event.payload0 !== this.waitableIdx()) {
                    throw new Error('invalid pending event during stream operation');
                }
                if (this.isWritable() && this.isPeerDropped()) {
                    this.setCopyState(StreamEnd.CopyState.DONE);
                    return (event.payload1 & ~0xf) | StreamEnd.CopyResult.DROPPED;
                }
                return event.payload1;
            }
            if (this.isDropped() || this.isPeerDropped()) {
                if (this.#pendingBufferMeta?.onCopyDoneFn) {
                    const f = this.#pendingBufferMeta.onCopyDoneFn;
                    this.#pendingBufferMeta.onCopyDoneFn = null;
                    f(StreamEnd.CopyResult.DROPPED);
                }
                this.setCopyState(StreamEnd.CopyState.DONE);
                return StreamEnd.CopyResult.DROPPED;
            }
            const { buffer, onCopyFn, onCopyDoneFn } = this.setupCopy({
                memory,
                eventCode,
                componentIdx,
                ptr,
                count,
                buffer: args.buffer,
                bufferID: args.bufferID,
                initial,
                skipStateCheck,
                elemMeta: copyElemMeta,
            });
            // If the stream is readable and was lowered from the host, the
            // writer is host-side. Register the read first; host injection
            // will no-op if the read already produced a pending event.
            const injectHostWrite = this.isReadable() && !!this.#hostInjectFn;
            // Perform the read/write
            this._read({
                buffer,
                onCopyFn,
                onCopyDoneFn,
                componentIdx,
                rejectLength,
                dropAfterCopy,
            });
            let injectedWritePromise;
            if (injectHostWrite) {
                injectedWritePromise = this.#hostInjectFn({ count });
            }
            const finishCopy = () => {
                const event = this.getPendingEvent();
                if (!event) {
                    throw new Error('unexpectedly missing pending event');
                }
                if (event.code === undefined || event.payload0 === undefined || event.payload1 === undefined) {
                    throw new Error('unexpectedly malformed event');
                }
                const { code, payload0: index, payload1: payload } = event;
                const waitableIdx = this.getWaitable().idx();
                if (code !== eventCode || index !== waitableIdx || payload === asyncBlockedCode) {
                    const errMsg = 'invalid event code/event during stream operation';
                    debugLog(errMsg, {
                        event,
                        payload,
                        payloadIsBlockedConst: payload === asyncBlockedCode,
                        code,
                        eventCode,
                        codeDoesNotMatchEventCode: code !== eventCode,
                        index,
                        internalEndIdx: waitableIdx,
                        indexDoesNotMatch: index !== waitableIdx,
                    });
                    throw new Error(errMsg);
                }
                if (event.rejectedLength !== undefined) {
                    this.#rejectedLength = event.rejectedLength;
                }
                if (this.isWritable() && this.isPeerDropped()) {
                    this.setCopyState(StreamEnd.CopyState.DONE);
                    return (payload & ~0xf) | StreamEnd.CopyResult.DROPPED;
                }
                return payload;
            };
            if (!this.hasPendingEvent()) {
                if (isAsync) {
                    this.setCopyState(StreamEnd.CopyState.ASYNC_COPYING);
                    debugLog('[StreamEnd#copy()] blocked', { componentIdx, eventCode, self: this });
                    if (injectedWritePromise) {
                        // Do not await here: the injected write may depend on sibling
                        // guest work running, so the canonical read must return BLOCKED.
                        injectedWritePromise.then(
                            (cleanupFn) => cleanupFn(),
                            (err) =>
                                this.setPendingEvent(() => {
                                    throw err;
                                }),
                        );
                    }
                    return asyncBlockedCode;
                } else {
                    this.setCopyState(StreamEnd.CopyState.SYNC_COPYING);
                    const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
                    if (!taskMeta) {
                        throw new Error(`missing task meta for component idx [${componentIdx}]`);
                    }
                    const task = taskMeta.task;
                    if (!task) {
                        throw new Error('missing task task from task meta');
                    }
                    const streamEnd = this;
                    return task
                        .suspendUntil({
                            readyFn: () => streamEnd.hasPendingEvent(),
                        })
                        .then(async () => {
                            if (deferSyncFinish) {
                                await Promise.resolve();
                            }
                            if (!injectedWritePromise) {
                                return finishCopy();
                            }
                            return injectedWritePromise.then((cleanupFn) => {
                                cleanupFn();
                                return finishCopy();
                            });
                        });
                }
            }
            if (!injectedWritePromise) {
                return finishCopy();
            }
            if (isAsync) {
                injectedWritePromise.then(
                    (cleanupFn) => cleanupFn(),
                    (err) =>
                        this.setPendingEvent(() => {
                            throw err;
                        }),
                );
                return finishCopy();
            }
            return injectedWritePromise.then((cleanupFn) => {
                cleanupFn();
                return finishCopy();
            });
        }
        setPendingBufferMeta(args) {
            const { componentIdx, buffer, onCopyFn, onCopyDoneFn, rejectLength, dropAfterCopy } = args;
            this.#pendingBufferMeta.componentIdx = componentIdx;
            this.#pendingBufferMeta.buffer = buffer;
            this.#pendingBufferMeta.onCopyFn = onCopyFn;
            this.#pendingBufferMeta.onCopyDoneFn = onCopyDoneFn;
            this.#pendingBufferMeta.rejectLength = rejectLength;
            this.#pendingBufferMeta.dropAfterCopy = dropAfterCopy;
        }
        resetPendingBufferMeta() {
            this.setPendingBufferMeta({
                componentIdx: null,
                buffer: null,
                onCopyFn: null,
                onCopyDoneFn: null,
                rejectLength: undefined,
                dropAfterCopy: false,
            });
        }
        getPendingBufferMeta() {
            return this.#pendingBufferMeta;
        }
        hasPendingBuffer() {
            return !!this.#pendingBufferMeta?.buffer;
        }
        resetAndNotifyPending(result) {
            const f = this.#pendingBufferMeta.onCopyDoneFn;
            this.resetPendingBufferMeta();
            if (f) {
                f(result);
            }
        }
        cancel() {
            debugLog('[StreamEnd#cancel()]');
            const completeCancel = () => {
                if (this.isDropped()) {
                    return;
                }
                // Host injection may complete the copy before this deferred
                // cancellation runs. Preserve that completion event instead of
                // cancelling the next operation or starting a duplicate write.
                if (this.hasPendingEvent()) {
                    return;
                }
                if (this.#hostCancelFn?.()) {
                    return;
                }
                this.resetAndNotifyPending(StreamEnd.CopyResult.CANCELLED);
            };
            if (this.#hostInjectFn) {
                // The deferral is runtime work the guest is waiting on: a task
                // suspended in a synchronous cancel resumes only when it runs.
                // Count it like a host operation so a deadlock check scheduled
                // before this timer does not report the wait as a deadlock.
                trackHostOperation(
                    _context.tracking,
                    () =>
                        new Promise((resolve) => {
                            setTimeout(() => {
                                try {
                                    completeCancel();
                                } finally {
                                    resolve();
                                }
                            }, 0);
                        }),
                );
            } else {
                completeCancel();
            }
        }
        drop(opts = {}) {
            debugLog('[StreamEnd#drop()]');
            if (this.isDropped()) {
                return;
            }
            const hostDropFn = this.#hostDropFn;
            this.#hostDropFn = null;
            super.drop(opts);
            // A source drop hook can re-enter the component, so both ends must
            // observe the drop before the hook (which is deferred) wakes a waiting writer.
            if (hostDropFn) {
                hostDropFn();
            }
            if (this.#pendingBufferMeta) {
                this.resetAndNotifyPending(StreamEnd.CopyResult.DROPPED);
            }
        }
    }
    return StreamReadableEnd;
}
