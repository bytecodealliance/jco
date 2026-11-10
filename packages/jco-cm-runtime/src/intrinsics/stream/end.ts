import type {
    StreamEndConstructor,
    StreamEndClassContext,
    StreamEndOptions,
    StreamCopyResults,
    StreamCopyStates,
    StreamCopyOptions,
    StreamInnerCopyOptions,
    StreamElementMetadata,
    StreamPendingBufferMeta,
    StreamHostInjectFn,
    ComponentWaitable,
    StreamEvent,
    StreamCleanup,
} from '../../runtime.js';
import { debugLog } from '../core/debug.js';
import { trackHostOperation } from '../component.js';
import { getCurrentTask } from '../async-task/task-operations.js';
import { asyncBlockedCode } from '../async-task.js';

/**
 * Everything both ends of a stream share: table identity, copy state, the buffer
 * pending for the peer, and the copy, cancel and drop protocol.
 * The readable and writable end classes add the direction: `isReadable`, `isWritable`,
 * and `_transfer`, which moves elements between an operation's buffer and the pending one.
 */
export function initializeStreamEndClass(_context: StreamEndClassContext): StreamEndConstructor {
    const { events } = _context;

    class StreamEnd {
        // Provided by the readable and writable end classes.
        declare isReadable: () => boolean;
        declare isWritable: () => boolean;
        declare _transfer: (args: StreamInnerCopyOptions) => void;

        static CopyResult: StreamCopyResults = {
            COMPLETED: 0,
            DROPPED: 1,
            CANCELLED: 2,
        };

        static CopyState: StreamCopyStates = {
            IDLE: 1,
            SYNC_COPYING: 2,
            ASYNC_COPYING: 3,
            CANCELLING_COPY: 4,
            DONE: 5,
        };

        #waitable: ComponentWaitable;

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

        // length a host read rejected, until that read takes it
        #rejectedLength: number | null = null;

        #copyState = StreamEnd.CopyState.IDLE;

        // host reads and writes blocked on the peer, until an event is set
        #pendingEventWaiters: (() => void)[] = [];

        #dropped = false;
        #isPeerDroppedFn: () => boolean;
        #notifyPeerDroppedFn: () => void;

        target: unknown;

        constructor(args: StreamEndOptions) {
            const { tableIdx } = args;
            if (tableIdx === undefined || typeof tableIdx !== 'number') {
                throw new TypeError(`missing table idx [${tableIdx}]`);
            }
            if (tableIdx < 0 || tableIdx > 2_147_483_647) {
                throw new TypeError(`invalid  tableIdx [${tableIdx}]`);
            }
            if (!args.waitable) {
                throw new Error('missing/invalid waitable');
            }

            this.#streamTableIdx = args.tableIdx;
            this.#waitable = args.waitable;

            if (!args.elemMeta) {
                throw new Error('missing/invalid element meta');
            }
            this.#elemMeta = args.elemMeta;

            if (!args.pendingBufferMeta) {
                throw new Error('missing/invalid shared pending buffer meta');
            }
            this.#pendingBufferMeta = args.pendingBufferMeta;

            if (args.isPeerDroppedFn !== undefined && typeof args.isPeerDroppedFn !== 'function') {
                throw new TypeError('isPeerDroppedFn must be a function');
            }
            if (args.notifyPeerDroppedFn !== undefined && typeof args.notifyPeerDroppedFn !== 'function') {
                throw new TypeError('notifyPeerDroppedFn must be a function');
            }
            this.#isPeerDroppedFn = args.isPeerDroppedFn ?? (() => false);
            this.#notifyPeerDroppedFn = args.notifyPeerDroppedFn ?? (() => {});

            this.target = args.target;
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
            w.setTarget(`waitable for ${this.isReadable() ? 'read' : 'write'} end (waitable [${idx}])`);
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

        getElemMeta() {
            return { ...this.#elemMeta };
        }

        /** The length rejected by the last copy, cleared by reading it. */
        takeRejectedLength() {
            const rejectedLength = this.#rejectedLength;
            this.#rejectedLength = null;
            return rejectedLength;
        }
        setRejectedLength(rejectedLength: number) {
            this.#rejectedLength = rejectedLength;
        }

        isDoneState() {
            return this.getCopyState() === StreamEnd.CopyState.DONE;
        }
        isIdleState() {
            return this.getCopyState() === StreamEnd.CopyState.IDLE;
        }

        setTarget(tgt: unknown) {
            this.target = tgt;
        }

        getWaitable() {
            return this.#waitable;
        }

        setCopyState(state: number) {
            this.#copyState = state;
        }
        getCopyState() {
            return this.#copyState;
        }

        isCopying() {
            switch (this.#copyState) {
                case StreamEnd.CopyState.IDLE:
                case StreamEnd.CopyState.DONE:
                    return false;
                case StreamEnd.CopyState.SYNC_COPYING:
                case StreamEnd.CopyState.ASYNC_COPYING:
                case StreamEnd.CopyState.CANCELLING_COPY:
                    return true;
                default:
                    throw new Error('invalid/unknown copying state');
            }
        }

        setPendingEvent(fn: () => StreamEvent) {
            debugLog('[StreamEnd#setPendingEvent()]', {
                waitable: this.#waitable,
                waitableinSet: this.#waitable.isInSet(),
                componentIdx: this.#waitable.componentIdx(),
            });
            this.#waitable.setPendingEvent(fn);
            for (const wake of this.#pendingEventWaiters.splice(0)) {
                wake();
            }
        }

        /** Settles once an event is pending, in a later macrotask than the one that set it. */
        async waitForPendingEvent() {
            do {
                if (!this.hasPendingEvent()) {
                    await new Promise<void>((resolve) => this.#pendingEventWaiters.push(resolve));
                }
                // The event is set from inside the peer's copy, which must unwind first.
                await new Promise((resolve) => setTimeout(resolve));
            } while (!this.hasPendingEvent());
        }

        hasPendingEvent() {
            return this.#waitable.hasPendingEvent();
        }

        isInSet() {
            return this.#waitable.isInSet();
        }

        getPendingEvent() {
            debugLog('[StreamEnd#getPendingEvent()]', {
                waitable: this.#waitable,
                waitableinSet: this.#waitable.isInSet(),
                componentIdx: this.#waitable.componentIdx(),
            });
            const event = this.#waitable.getPendingEvent();
            return event as StreamEvent | null;
        }

        isDropped() {
            return this.#dropped;
        }
        isPeerDropped() {
            return this.#isPeerDroppedFn();
        }

        notifyDropped() {
            if (this.isDropped() || this.isDoneState() || this.hasPendingEvent()) {
                return;
            }
            const eventCode = this.isReadable() ? events.STREAM_READ : events.STREAM_WRITE;
            this.setPendingEvent(() => {
                this.setCopyState(StreamEnd.CopyState.DONE);
                return {
                    code: eventCode,
                    payload0: this.waitableIdx()!,
                    payload1: StreamEnd.CopyResult.DROPPED,
                };
            });
        }

        #setupCopy(args: StreamCopyOptions) {
            const { memory, ptr, count, eventCode, componentIdx } = args;
            if (eventCode === undefined) {
                throw new Error('missing/invalid event code');
            }

            let buffer = args.buffer;

            if (this.isCopying()) {
                throw new _context.RuntimeError('cannot have concurrent operations active on a future/stream');
            }
            if (this.getCopyState() !== StreamEnd.CopyState.IDLE) {
                throw new Error(`stream copy state is not idle`);
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
                buffer = newBufferMeta.buffer;
                buffer.setTarget(
                    `component [${componentIdx}] ${this.isReadable() ? 'StreamReadableEnd' : 'StreamWritableEnd'} buffer (id [${newBufferMeta.id}], count [${count}], eventCode [${eventCode}])`,
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

            return { buffer, onCopyFn, onCopyDoneFn };
        }

        copy(args: StreamCopyOptions): number | Promise<number> {
            const {
                isAsync,
                memory,
                componentIdx,
                ptr,
                count,
                eventCode,
                stringEncoding,
                rejectLength,
                elemMeta,
                dropAfterCopy,
                deferSyncFinish,
            } = args;
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
                if (this.#pendingBufferMeta.onCopyDoneFn) {
                    const f = this.#pendingBufferMeta.onCopyDoneFn;
                    this.#pendingBufferMeta.onCopyDoneFn = null;
                    f(StreamEnd.CopyResult.DROPPED);
                }
                this.setCopyState(StreamEnd.CopyState.DONE);
                return StreamEnd.CopyResult.DROPPED;
            }

            const { buffer, onCopyFn, onCopyDoneFn } = this.#setupCopy({
                memory,
                eventCode,
                componentIdx,
                ptr,
                count,
                buffer: args.buffer,
                elemMeta: copyElemMeta,
            });

            // If the stream is readable and was lowered from the host, the
            // writer is host-side. Register the read first; host injection
            // will no-op if the read already produced a pending event.
            const injectHostWrite = this.isReadable() && !!this.#hostInjectFn;

            // Perform the read/write
            this._transfer({
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
            return !!this.#pendingBufferMeta.buffer;
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

        drop(opts: { allowPendingEvent?: boolean } = {}) {
            debugLog('[StreamEnd#drop()]', {
                waitable: this.#waitable,
                waitableinSet: this.#waitable.isInSet(),
                componentIdx: this.#waitable.componentIdx(),
            });
            if (this.isDropped()) {
                return;
            }
            const hostDropFn = this.#hostDropFn;
            this.#hostDropFn = null;

            this.#dropped = true;
            this.#notifyPeerDroppedFn();
            if (opts.allowPendingEvent) {
                // A lifted host read can still be observing this event.
                // Detach it from any guest waitable set, but leave the
                // event available for the in-flight host read to consume.
                this.#waitable.join(null);
            } else {
                this.#waitable.drop();
            }

            // A source drop hook can re-enter the component, so both ends must
            // observe the drop before the hook (which is deferred) wakes a waiting writer.
            if (hostDropFn) {
                hostDropFn();
            }
            this.resetAndNotifyPending(StreamEnd.CopyResult.DROPPED);
        }
    }

    return StreamEnd;
}
