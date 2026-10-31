import { debugLog } from './core-debug.js';

export function initializeFutureWritableEndClass(_context) {
    const FutureEnd = _context.FutureEnd;
    const { FutureValue } = _context;

    class FutureWritableEnd extends FutureEnd {
        // Only the readable endpoint implements this hook; promise() is guarded by endpoint direction.

        #globalFutureMapRep;
        #futureTableIdx;
        #isHostOwned;
        #hostInjectFn;
        #elemMeta;
        #handle;
        #promise;

        target;

        constructor(args) {
            debugLog('[FutureWritableEnd#constructor()] args', args);
            super(args);

            if (!args.elemMeta) {
                throw new Error('missing/invalid element meta');
            }
            this.#elemMeta = args.elemMeta;

            if (args.tableIdx === undefined) {
                throw new Error('missing index for future table idx');
            }
            this.#futureTableIdx = args.tableIdx;

            this.#hostInjectFn = args.hostInjectFn;
            this.#isHostOwned = args.hostOwned;
        }

        isReadable() {
            return false;
        }
        isWritable() {
            return true;
        }

        setTarget(tgt) {
            this.target = tgt;
        }

        getElemMeta() {
            return { ...this.#elemMeta };
        }
        futureTableIdx() {
            return this.#futureTableIdx;
        }
        setFutureTableIdx(idx) {
            this.#futureTableIdx = idx;
        }

        globalFutureMapRep() {
            return this.#globalFutureMapRep;
        }
        setGlobalFutureMapRep(rep) {
            this.#globalFutureMapRep = rep;
        }

        waitableIdx() {
            return this.getWaitable().idx();
        }
        setWaitableIdx(idx) {
            const w = this.getWaitable();
            w.setIdx(idx);
            w.setTarget(`waitable for FutureWritableEnd (waitable [${idx}])`);
        }

        handle() {
            return this.#handle;
        }
        setHandle(h) {
            this.#handle = h;
        }

        setHostInjectFn(f) {
            if (this.#hostInjectFn) {
                throw new Error('host injection fn is already set');
            }
            this.#hostInjectFn = f;
        }

        promise() {
            if (this.#promise) {
                return this.#promise;
            }
            // NOTE: we return a "thenable" here to ensure that simply lifting the future does
            // not trigger a host read.

            this.#promise = new FutureValue(() => this.hostRead({ stringEncoding: 'utf8' }));
            return this.#promise;
        }

        cancel() {
            debugLog('[FutureEnd#cancel()]');
            this.resetAndNotifyPending(FutureEnd.CopyResult.CANCELLED);
        }

        _write(args) {
            const { buffer, onCopyDoneFn, componentIdx } = args;
            if (!buffer) {
                throw new Error('missing buffer for future write');
            }

            if (buffer.remaining() !== 1) {
                throw new Error('invalid remaining capacity for pending buffer');
            }

            if (this.isDropped()) {
                throw new Error('cannot write to dropped future');
            }

            if (this.isPeerDropped()) {
                onCopyDoneFn(FutureEnd.CopyResult.DROPPED);
                return;
            }

            const meta = this.getPendingBufferMeta();
            if (!meta) {
                throw new Error('missing pending buffer metadata');
            }
            if (!meta.buffer) {
                this.setPendingBufferMeta({
                    buffer,
                    componentIdx,
                    isWrite: true,
                    onCopyDoneFn,
                });
                return;
            }

            if (
                componentIdx === meta.componentIdx &&
                componentIdx !== -1 &&
                !(this.#elemMeta.isNone || this.#elemMeta.isNumeric)
            ) {
                throw new _context.RuntimeError('cannot read from and write to intra-component future');
            }

            const transferResources = buffer.componentIdx() !== -1 && meta.buffer.componentIdx() !== -1;
            meta.buffer.write(buffer.read(1, { transferResources }), { transferResources });
            this.resetAndNotifyPending(FutureEnd.CopyResult.COMPLETED);
            onCopyDoneFn(FutureEnd.CopyResult.COMPLETED);
        }

        guestWrite(args) {
            debugLog('[FutureWritableEnd#guestWrite()] args', args);
            const { componentIdx, stringEncoding, memory, realloc, ptr, data } = args;

            const elemMeta = {
                ...(args.elemMeta ?? this.#elemMeta),
                stringEncoding: stringEncoding ?? this.#elemMeta.stringEncoding,
                getReallocFn: args.getReallocFn ?? this.#elemMeta.getReallocFn,
            };
            if (elemMeta.isBorrowed) {
                throw new Error('cannot call future.read on a borrow');
            }

            let buffer = args.buffer;
            if (!buffer) {
                const createBufferRes = _context.buffers.createBuffer({
                    componentIdx,
                    memory,
                    realloc,
                    start: ptr,
                    data,
                    count: 1,
                    isReadable: this.isWritable(),
                    isWritable: this.isReadable(),
                    elemMeta,
                });
                buffer = createBufferRes.buffer;
            }

            const futureEvent = (res) => {
                if (buffer.remaining() === 0) {
                    if (res !== FutureEnd.CopyResult.COMPLETED) {
                        throw new Error('invalid buffer state, expected zero remaining post-completion');
                    }
                } else {
                    if (res === FutureEnd.CopyResult.COMPLETED) {
                        throw new Error('invalid buffer state, expected 1 remaining post-completion');
                    }
                }
                if (res === FutureEnd.CopyResult.DROPPED || res === FutureEnd.CopyResult.COMPLETED) {
                    this.setCopyState(FutureEnd.CopyState.DONE);
                } else {
                    this.setCopyState(FutureEnd.CopyState.IDLE);
                }
                return { code: _context.events.FUTURE_WRITE, payload0: this.waitableIdx(), payload1: res };
            };

            const onCopyDoneFn = (res) => {
                this.setPendingEvent(() => futureEvent(res));
            };

            this._write({
                buffer,
                onCopyDoneFn,
                componentIdx,
            });

            return { buffer };
        }

        async hostWrite(args) {
            const { stringEncoding, value, getReallocFn } = args;

            const { buffer } = await this.guestWrite({
                stringEncoding,
                getReallocFn,
                // TODO: support sync host writes
                isAsync: true,
                data: [value],
                componentIdx: -1,
            });

            void buffer;
            if (!this.hasPendingEvent()) {
                this.setCopyState(FutureEnd.CopyState.ASYNC_COPYING);

                // Wait for the write to complete
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
                    throw new Error('missing pending event after blocked future write');
                }
            }

            const { code, payload0: index, payload1: payload } = this.getPendingEvent();
            if (code !== _context.events.FUTURE_WRITE) {
                throw new Error(`mismatched event code [${code}] for host future write`);
            }
            if (index !== this.waitableIdx()) {
                throw new Error('mismatched future end index');
            }
            // Whether the value was delivered to the reader (rather than the reader being dropped)
            return payload === FutureEnd.CopyResult.COMPLETED;
        }

        drop() {
            if (this.isWritable() && !this.isDoneState()) {
                throw new _context.RuntimeError('cannot drop future write end without first writing a value');
            }

            super.drop();
            // Let a host-provided future know if its value was discarded
            this.#hostInjectFn?.drop?.();
        }
    }

    return FutureWritableEnd;
}
