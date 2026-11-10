import type {
    StreamWritableEndConstructor,
    StreamEndpointClassContext,
    StreamElementMetadata,
    StreamEndOptions,
    StreamInnerCopyOptions,
} from '../../runtime.js';
import { debugLog } from '../core/debug.js';
import type { StreamEndSuperclass } from './inheritance.js';
export function initializeStreamWritableEndClass(_context: StreamEndpointClassContext): StreamWritableEndConstructor {
    const StreamEnd: StreamEndSuperclass = _context.StreamEnd;

    class StreamWritableEnd extends StreamEnd {
        #elemMeta: StreamElementMetadata;
        #sourceRebufferFn: ((items: unknown[]) => void) | null = null;

        constructor(args: StreamEndOptions) {
            debugLog('[StreamWritableEnd#constructor()] args', args);
            super(args);
            this.#elemMeta = args.elemMeta;
        }

        isReadable() {
            return false;
        }
        isWritable() {
            return true;
        }

        setSourceRebufferFn(f: (items: unknown[]) => void) {
            this.#sourceRebufferFn = f;
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

        /**
         * Offers `values` to the reader. Every writable end is written by the host, just in time
         * for a guest read, so a write the reader has not taken yet stays pending and is not awaited.
         */
        async writeMany(values: unknown[], opts: { dropAfterCopy?: boolean } = {}) {
            debugLog('[StreamWritableEnd#writeMany()] args', { values });
            if (!Array.isArray(values)) {
                throw new TypeError('writeMany values must be an array');
            }

            const count = values.length;
            const { id: bufferID, buffer } = _context.buffers.createBuffer({
                componentIdx: -1,
                count,
                isReadable: true, // we need to read from this buffer later
                isWritable: false,
                elemMeta: this.#elemMeta,
                data: values,
            });
            buffer.setTarget(`host stream write buffer (id [${bufferID}], count [${count}])`);

            const copied = this.copy({
                isAsync: true,
                count,
                buffer,
                eventCode: _context.events.STREAM_WRITE,
                componentIdx: -1,
                dropAfterCopy: opts.dropAfterCopy === true,
            });
            if (this.hasPendingEvent()) {
                // The guest read path consumes the pending event, so waiting here can deadlock.
                Promise.resolve(copied).catch(() => {});
                return;
            }
            await copied;
        }

        /** Drains the writer's buffer into the buffer a reader left pending, or leaves the writer's pending. */
        _transfer(args: StreamInnerCopyOptions) {
            const { buffer, onCopyFn, onCopyDoneFn, componentIdx, dropAfterCopy } = args;
            const pending = this.getPendingBufferMeta();
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

            if (!pending.buffer) {
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

            const pendingElemMeta = pending.buffer.getElemMeta();
            const newBufferElemMeta = buffer.getElemMeta();
            if (pendingElemMeta.payloadTypeName !== newBufferElemMeta.payloadTypeName) {
                throw new _context.RuntimeError('stream end type does not match internal buffer');
            }

            // If the buffer came from the same component that is currently doing the operation
            // we're doing a inter-component write, and only unit or numeric types are allowed
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

            // If original capacities were zero, we're dealing with a unit stream,
            // a write to the unit stream is instantly copied without any work.
            if (buffer.capacity === 0 && pending.buffer.capacity === 0) {
                onCopyDoneFn(StreamEnd.CopyResult.COMPLETED);
                return;
            }

            // If the internal buffer has no space left to take writes,
            // the write is complete, we must reset and wait for another read
            // to clear up space in the buffer.
            if (pending.buffer.remaining() === 0) {
                this.resetAndNotifyPending(StreamEnd.CopyResult.COMPLETED);
                this.setPendingBufferMeta({ componentIdx, buffer, onCopyFn, onCopyDoneFn, dropAfterCopy });
                return;
            }

            const shouldDropAfterCopy = dropAfterCopy || pending.dropAfterCopy;

            // At this point it is implied that remaining is > 0,
            // so if there is still remaining capacity in the incoming buffer, perform copy of values
            // to the internal buffer from the incoming buffer
            if (buffer.remaining() > 0) {
                const rejectLength = pending.rejectLength;
                if (rejectLength !== undefined && buffer.remaining() > rejectLength) {
                    const pendingOnCopyDoneFn = pending.onCopyDoneFn;
                    this.resetPendingBufferMeta();
                    pendingOnCopyDoneFn!(StreamEnd.CopyResult.DROPPED, buffer.remaining());
                    onCopyDoneFn(StreamEnd.CopyResult.DROPPED);
                    return;
                }
                const numElements = Math.min(buffer.remaining(), pending.buffer.remaining());
                const transferResources = buffer.componentIdx() !== -1 && pending.buffer.componentIdx() !== -1;
                pending.buffer.write(buffer.read(numElements, { transferResources }), {
                    transferResources,
                });
                pending.onCopyFn!(
                    () => this.resetPendingBufferMeta(),
                    shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED,
                );
            }

            onCopyDoneFn(shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED);
        }
    }

    return StreamWritableEnd;
}
