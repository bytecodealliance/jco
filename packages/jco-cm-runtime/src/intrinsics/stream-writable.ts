import type {
    StreamWritableEndConstructor,
    StreamEndpointClassContext,
    StreamElementMetadata,
    StreamPendingBufferMeta,
    StreamHostInjectFn,
    StreamEndpointOptions,
    StreamCopyOptions,
    StreamInnerCopyOptions,
    StreamEvent,
    StreamCleanup,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
import { trackHostOperation } from './component.js';
import { getCurrentTask } from './task-operations.js';
import { asyncBlockedCode } from './async-task.js';
import { promiseWithResolvers } from './core-promises.js';
import type { StreamEndSuperclass } from './stream-inheritance.js';
export function initializeStreamWritableEndClass(_context: StreamEndpointClassContext): StreamWritableEndConstructor {
    const StreamEnd: StreamEndSuperclass = _context.StreamEnd;

    class StreamWritableEnd extends StreamEnd {
        #copying = false;
        #done = false;

        #elemMeta: StreamElementMetadata;
        // held by both write and read ends
        #pendingBufferMeta: StreamPendingBufferMeta;

        // table index that the stream is in (can change after a stream transfer)
        #streamTableIdx: number;
        // handle (index) inside the given table (can change after a stream transfer)
        #handle: number | undefined;

        // internal stream (which has both ends) rep
        #globalStreamMapRep: number | undefined;

        // only populated for lowered (read) stream ends
        #hostInjectFn: StreamHostInjectFn | undefined;
        #hostDropFn: ((reason?: unknown) => unknown) | null | undefined;
        #hostCancelFn: (() => boolean) | undefined;
        // only populated for the write side of a lowered read stream end
        #isHostOwned: boolean | undefined;

        #result: ReturnType<typeof promiseWithResolvers<void>> | null = null;
        #sourceRebufferFn: ((items: unknown[]) => void) | null = null;

        #endOfStream = false;
        #rejectedLength: number | null = null;

        constructor(args: StreamEndpointOptions) {
            debugLog('[StreamWritableEnd#constructor()] args', args);
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
        setStreamTableIdx(idx: number) {
            this.#streamTableIdx = idx;
        }

        handle() {
            return this.#handle;
        }
        setHandle(h: number) {
            this.#handle = h;
        }

        globalStreamMapRep() {
            return this.#globalStreamMapRep;
        }
        setGlobalStreamMapRep(rep: number) {
            this.#globalStreamMapRep = rep;
        }

        waitableIdx() {
            return this.getWaitable().idx();
        }
        setWaitableIdx(idx: number) {
            const w = this.getWaitable();
            w.setIdx(idx);
            w.setTarget(`waitable for write end (waitable [${idx}])`);
        }

        setHostInjectFn(f: StreamHostInjectFn) {
            if (this.#hostInjectFn) {
                throw new Error('host injection fn is already set');
            }
            this.#hostInjectFn = f;
        }
        setHostDropFn(f: (reason?: unknown) => unknown) {
            if (this.#hostDropFn) {
                throw new Error('host drop fn is already set');
            }
            this.#hostDropFn = f;
        }
        setHostCancelFn(f: () => boolean) {
            this.#hostCancelFn = f;
        }
        hasHostInject() {
            return !!this.#hostInjectFn;
        }
        setSourceRebufferFn(f: (items: unknown[]) => void) {
            this.#sourceRebufferFn = f;
        }

        getElemMeta() {
            return { ...this.#elemMeta };
        }

        isReadable() {
            return false;
        }
        isWritable() {
            return true;
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

        async write(v: unknown) {
            debugLog('[StreamWritableEnd#write()] args', { v });

            let data;
            if (this.#elemMeta.isNumeric) {
                if (v instanceof ArrayBuffer) {
                    v = new Uint8Array(v);
                }
                data =
                    Array.isArray(v) || (ArrayBuffer.isView(v) && 'length' in v && typeof v.length === 'number')
                        ? Array.from(v as ArrayLike<unknown>)
                        : [v];
            } else {
                data = [v];
            }
            return this.writeMany(data);
        }

        async writeMany(values: unknown[], opts: { dropAfterCopy?: boolean } = {}) {
            debugLog('[StreamWritableEnd#writeMany()] args', { values });
            if (!Array.isArray(values)) {
                throw new TypeError('writeMany values must be an array');
            }

            // Wait for an existing write operation to end, if present,
            // otherwise register this write for any future operations.
            //
            // NOTE: this complexity below is an attempt to sequence operations
            // to ensure consecutive writes only wait on their direct predecessors,
            // (i.e. write #3 must wait on write #2, *not* write #1)
            //
            let newResult = promiseWithResolvers<void>();
            if (this.#result && !this.#isHostOwned) {
                try {
                    const p = this.#result.promise;
                    this.#result = newResult;
                    await p;
                } catch (err) {
                    debugLog('[StreamWritableEnd#writeMany()] error waiting for previous write', err);
                    // If the previous write we were waiting on errors for any reason,
                    // we can ignore it and attempt to continue with this write
                    // which may also fail for a similar reason
                }
            } else {
                this.#result = newResult;
            }
            const { promise, resolve, reject } = newResult;

            const data = values;
            const count = data.length;
            if (this.#elemMeta.stringEncoding === undefined) {
                this.#elemMeta.string = 'utf8';
            }

            try {
                const { id: bufferID, buffer } = _context.buffers.createBuffer({
                    componentIdx: -1,
                    count,
                    isReadable: true, // we need to read from this buffer later
                    isWritable: false,
                    elemMeta: this.#elemMeta,
                    data,
                });
                buffer.setTarget(
                    `host stream write buffer (id [${bufferID}], count [${count}], data len [${data.length}])`,
                );

                let packedResult;
                const copyPromise = this.copy({
                    isAsync: true,
                    count,
                    bufferID,
                    buffer,
                    eventCode: _context.events.STREAM_WRITE,
                    componentIdx: -1,
                    dropAfterCopy: opts.dropAfterCopy === true,
                });
                if (this.#isHostOwned && this.hasPendingEvent()) {
                    // Host owned writes are just-in-time writes for an already pending guest read.
                    // The guest read path consumes the pending event, so waiting here can deadlock.
                    Promise.resolve(copyPromise).catch((err) => reject(err));
                    this.#result = null;
                    resolve();
                    return await promise;
                }
                packedResult = await copyPromise;

                // If we are dealing with a blocked component write operation, we do an immedaite wait
                // on the host side to pause the host until the write can be completed.
                //
                // We do not do this if we're dealing with a host injection,
                // (i.e. a lowered read end into a component does a read() and forces
                // data to be read from the host side), we must signal the write is completed
                // and we are waiting for the read.
                //
                //  In the host injection case, it is OK that the write is blocked, because we
                //  know the read is about to occur (we control the writes to the stream to be
                // just-before reads, no matter what the user does on the other end).
                //
                if (packedResult === asyncBlockedCode && !this.#isHostOwned) {
                    // If the write was blocked, the pending event produced by the
                    // read side represents the completed copy.

                    await new Promise<void>((resolve) => {
                        let waitInterval = setInterval(async () => {
                            if (!this.hasPendingEvent()) {
                                return;
                            }
                            clearInterval(waitInterval);
                            resolve();
                        });
                    });

                    if (!this.hasPendingEvent()) {
                        throw new Error('missing pending event after blocked stream write');
                    }

                    const event = this.getPendingEvent()!;
                    if (!event) {
                        throw new Error('missing pending event after blocked stream write');
                    }

                    const { code, payload0: index, payload1: payload } = event;

                    if (code !== _context.events.STREAM_WRITE) {
                        throw new Error(`mismatched event code [${code}] for host stream write`);
                    }

                    if (index !== this.waitableIdx()) {
                        throw new Error('invalid stream end index');
                    }
                    packedResult = payload;

                    const copied = packedResult >> 4;
                    if (copied === 0 && this.isDoneState()) {
                        reject(new Error('read end dropped during write'));
                    }

                    if (packedResult === asyncBlockedCode) {
                        throw new Error('unexpected double block during write');
                    }
                }

                // Host owned writes were not necessarily unblocked, but are always blocked
                // because they happen just-before a component read (via a lowered end).
                //
                // In this case, we cant to declare the copy state back to idle
                // for the next write that is performed, assuming there may be more writes
                // to do.
                //
                // if (this.#hostOwned) {
                //    this.setCopyState(StreamEnd.CopyState.IDLE);
                // }

                // If the write was not blocked, we can resolve right away
                this.#result = null;
                resolve();
            } catch (err) {
                debugLog('[StreamWritableEnd#write()] error', err);
                reject(err);
            }

            return await promise;
        }

        _write(args: StreamInnerCopyOptions) {
            const { buffer, onCopyFn, onCopyDoneFn, componentIdx, dropAfterCopy } = args;
            if (!buffer) {
                throw new TypeError('missing/invalid buffer');
            }
            if (!onCopyFn) {
                throw new TypeError('missing/invalid onCopy handler');
            }
            if (!onCopyDoneFn) {
                throw new TypeError('missing/invalid onCopyDone handler');
            }
            if (this.isDropped()) {
                onCopyDoneFn(StreamEnd.CopyResult.DROPPED);
                return;
            }

            if (!this.#pendingBufferMeta.buffer) {
                // A just-in-time host-injected write found no reader buffer: the
                // target read was cancelled. Return the undelivered items to the
                // source (redelivered by a later read) instead of stranding
                // (which blocks on a future read -- can deadlock a stream whose
                // write waits on its reader -- or is dropped at stream end).
                if (this.#sourceRebufferFn && buffer.isHostOwned()) {
                    const remaining = buffer.remaining();
                    if (remaining > 0) {
                        this.#sourceRebufferFn(buffer.read(remaining));
                    }
                    onCopyDoneFn(StreamEnd.CopyResult.COMPLETED);
                    return;
                }
                this.setPendingBufferMeta({ componentIdx, buffer, onCopyFn, onCopyDoneFn, dropAfterCopy });
                return;
            }

            const pendingElemMeta = this.#pendingBufferMeta.buffer.getElemMeta();
            const newBufferElemMeta = buffer.getElemMeta();
            if (pendingElemMeta.payloadTypeName !== newBufferElemMeta.payloadTypeName) {
                throw new _context.RuntimeError('stream end type does not match internal buffer');
            }

            // If the buffer came from the same component that is currently doing the operation
            // we're doing a inter-component write, and only unit or numeric types are allowed
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

            // If original capacities were zero, we're dealing with a unit stream,
            // a write to the unit stream is instantly copied without any work.
            if (buffer.capacity === 0 && this.#pendingBufferMeta.buffer.capacity === 0) {
                onCopyDoneFn(StreamEnd.CopyResult.COMPLETED);
                return;
            }

            // If the internal buffer has no space left to take writes,
            // the write is complete, we must reset and wait for another read
            // to clear up space in the buffer.
            if (this.#pendingBufferMeta.buffer.remaining() === 0) {
                this.resetAndNotifyPending(StreamEnd.CopyResult.COMPLETED);
                this.setPendingBufferMeta({ componentIdx, buffer, onCopyFn, onCopyDoneFn, dropAfterCopy });
                return;
            }

            const shouldDropAfterCopy = dropAfterCopy || this.#pendingBufferMeta.dropAfterCopy;

            // At this point it is implied that remaining is > 0,
            // so if there is still remaining capacity in the incoming buffer, perform copy of values
            // to the internal buffer from the incoming buffer
            // Preserve the inline implementation's bookkeeping.
            // eslint-disable-next-line no-unused-vars
            let transferred = false;
            if (buffer.remaining() > 0) {
                const rejectLength = this.#pendingBufferMeta.rejectLength;
                if (rejectLength !== undefined && buffer.remaining() > rejectLength) {
                    const pendingOnCopyDoneFn = this.#pendingBufferMeta.onCopyDoneFn;
                    this.resetPendingBufferMeta();
                    pendingOnCopyDoneFn!(StreamEnd.CopyResult.DROPPED, buffer.remaining());
                    onCopyDoneFn(StreamEnd.CopyResult.DROPPED);
                    return;
                }
                const numElements = Math.min(buffer.remaining(), this.#pendingBufferMeta.buffer.remaining());
                const transferResources =
                    buffer.componentIdx() !== -1 && this.#pendingBufferMeta.buffer.componentIdx() !== -1;
                this.#pendingBufferMeta.buffer.write(buffer.read(numElements, { transferResources }), {
                    transferResources,
                });
                this.#pendingBufferMeta.onCopyFn!(
                    () => this.resetPendingBufferMeta(),
                    shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED,
                );
                transferred = true;
            }

            onCopyDoneFn(shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED);
        }

        setupCopy(args: StreamCopyOptions) {
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
                    `component [${componentIdx}] StreamWritableEnd buffer (id [${bufferID}], count [${count}], eventCode [${eventCode}])`,
                );
            }

            const streamEnd = this;
            const processFn = (result: number, reclaimBufferFn?: () => void, rejectedLength?: number) => {
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
                const event: StreamEvent = {
                    code: eventCode,
                    payload0: streamEnd.waitableIdx()!,
                    payload1: packedResult,
                };
                if (rejectedLength !== undefined) {
                    event.rejectedLength = rejectedLength;
                }

                return event;
            };

            const onCopyFn = (reclaimBufferFn: () => void, result = StreamEnd.CopyResult.COMPLETED) => {
                streamEnd.setPendingEvent(() => {
                    return processFn(result, reclaimBufferFn);
                });
            };

            const onCopyDoneFn = (result: number, rejectedLength?: number) => {
                streamEnd.setPendingEvent(() => {
                    return processFn(result, undefined, rejectedLength);
                });
            };

            return { bufferID, buffer, onCopyFn, onCopyDoneFn };
        }

        copy(args: StreamCopyOptions): number | Promise<number> {
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
                const event = this.getPendingEvent()!;
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
            this._write({
                buffer,
                onCopyFn,
                onCopyDoneFn,
                componentIdx,
                rejectLength,
                dropAfterCopy,
            });

            let injectedWritePromise: Promise<StreamCleanup> | undefined;
            if (injectHostWrite) {
                injectedWritePromise = this.#hostInjectFn!({ count });
            }

            const finishCopy = () => {
                const event = this.getPendingEvent()!;
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

        setPendingBufferMeta(args: StreamPendingBufferMeta) {
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

        resetAndNotifyPending(result: number) {
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
                        new Promise<void>((resolve) => {
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

    return StreamWritableEnd;
}
