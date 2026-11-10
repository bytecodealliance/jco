import type {
    StreamReadableEndConstructor,
    StreamEndpointClassContext,
    StreamElementMetadata,
    StreamEndOptions,
    StreamInnerCopyOptions,
    StreamReadOptions,
    StreamReadResult,
} from '../../runtime.js';
import { debugLog } from '../core/debug.js';
import { getOrCreateAsyncState } from '../component.js';
import { asyncBlockedCode } from '../async-task.js';
import { promiseWithResolvers } from '../core/promises.js';
import type { StreamEndSuperclass } from './inheritance.js';
export function initializeStreamReadableEndClass(_context: StreamEndpointClassContext): StreamReadableEndConstructor {
    const StreamEnd: StreamEndSuperclass = _context.StreamEnd;

    class StreamReadableEnd extends StreamEnd {
        #elemMeta: StreamElementMetadata;

        #result: ReturnType<typeof promiseWithResolvers<StreamReadResult>> | null = null;

        #endOfStream = false;
        #stopError: Error | null = null;

        constructor(args: StreamEndOptions) {
            debugLog('[StreamReadableEnd#constructor()] args', args);
            super(args);
            this.#elemMeta = args.elemMeta;
        }

        isReadable() {
            return true;
        }
        isWritable() {
            return false;
        }

        onInstanceStop() {
            // An ordinary close that precedes shutdown must still look like EOF.
            if (!this.isDropped() && !this.isPeerDropped() && !this.isDoneState()) {
                this.#stopError = Object.assign(new Error('component instance has been stopped'), {
                    code: 'ERR_COMPONENT_STOPPED',
                });
            }
            this.drop({ allowPendingEvent: true });
        }

        async read(opts: number | StreamReadOptions = 1): Promise<StreamReadResult> {
            debugLog('[StreamReadableEnd#read()]');

            if (this.#endOfStream) {
                return { value: undefined, done: true };
            }
            if (this.#stopError) {
                throw this.#stopError;
            }
            let { count, rejectLength, dropAfterCopy } = this.#readOpts(opts);

            // Wait for an existing read operation to end, if present,
            // otherwise register this read for any future operations.
            //
            // NOTE: this complexity below is an attempt to sequence operations
            // to ensure consecutive reads only wait on their direct predecessors,
            // (i.e. read #3 must wait on read #2, *not* read #1)
            //
            const newResult = promiseWithResolvers<StreamReadResult>();
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
                    buffer,
                    eventCode: _context.events.STREAM_READ,
                    componentIdx: -1,
                    rejectLength,
                    dropAfterCopy,
                });

                if (packedResult === asyncBlockedCode) {
                    // If the read was blocked, the pending event produced by the
                    // write side represents the completed copy.

                    await this.waitForPendingEvent();

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
                        this.setRejectedLength(event.rejectedLength);
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
                    await getOrCreateAsyncState(_context.lookup, componentIdx!).waitForExclusiveRelease();
                }

                if (resultKind === StreamEnd.CopyResult.DROPPED) {
                    // Preserve data copied before stop, but distinguish an interrupted
                    // host read from ordinary EOF. Guest copy results stay unchanged.
                    if (this.#stopError) {
                        if (transferred === 0) {
                            throw this.#stopError;
                        }
                    } else {
                        this.#endOfStream = true;
                    }
                }

                // A read queued behind this one has already taken the slot, and keeps it.
                if (this.#result === newResult) {
                    this.#result = null;
                }
                if (transferred > 0) {
                    const values = buffer.read(transferred);
                    const { typedArray } = this.#elemMeta;
                    const value =
                        typedArray === undefined ? (count === 1 ? values[0] : values) : new typedArray(values);
                    // An option's none value is undefined, but still an item.
                    resolve({ value, done: false });
                } else {
                    resolve({ value: undefined, done: true });
                }
            } catch (err) {
                debugLog('[StreamReadableEnd#read()] error', err);
                reject(err);
            }

            const result = await promise;
            const rejectedLength = this.takeRejectedLength();
            if (rejectedLength !== null) {
                result.rejectedLength = rejectedLength;
            }
            return result;
        }

        #readOpts(opts?: number | StreamReadOptions) {
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

        /** Fills the reader's buffer from the buffer a writer left pending, or leaves the reader's pending. */
        _transfer(args: StreamInnerCopyOptions) {
            const { buffer, onCopyDoneFn, onCopyFn, componentIdx, rejectLength, dropAfterCopy } = args;
            const pending = this.getPendingBufferMeta();
            if (this.isDropped()) {
                onCopyDoneFn(StreamEnd.CopyResult.DROPPED);
                return;
            }

            if (!pending.buffer) {
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

            const pendingElemMeta = pending.buffer.getElemMeta();
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
                pending.componentIdx === buffer.componentIdx() &&
                buffer.componentIdx() !== -1 &&
                !pendingElemIsNoneOrNumeric
            ) {
                throw new _context.RuntimeError(
                    'cannot read from and write to intra-component future/stream with non-numeric payload',
                );
            }

            const pendingRemaining = pending.buffer.remaining();
            const shouldDropAfterCopy = dropAfterCopy || pending.dropAfterCopy;
            if (pendingRemaining > 0) {
                const bufferRemaining = buffer.remaining();
                if (rejectLength !== undefined && pendingRemaining > rejectLength) {
                    this.resetAndNotifyPending(StreamEnd.CopyResult.DROPPED);
                    onCopyDoneFn(StreamEnd.CopyResult.DROPPED, pendingRemaining);
                    return;
                }
                if (bufferRemaining > 0) {
                    const count = Math.min(pendingRemaining, bufferRemaining);
                    const transferResources = buffer.componentIdx() !== -1 && pending.buffer.componentIdx() !== -1;
                    buffer.write(pending.buffer.read(count, { transferResources }), {
                        transferResources,
                    });
                    pending.onCopyFn!(
                        () => this.resetPendingBufferMeta(),
                        shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED,
                    );
                }

                onCopyDoneFn(shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED);

                return;
            }

            this.resetAndNotifyPending(StreamEnd.CopyResult.COMPLETED);
            this.setPendingBufferMeta({ componentIdx, buffer, onCopyFn, onCopyDoneFn, rejectLength, dropAfterCopy });
        }
    }

    return StreamReadableEnd;
}
