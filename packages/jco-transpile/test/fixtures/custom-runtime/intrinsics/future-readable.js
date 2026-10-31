import { debugLog } from './core-debug.js';
import { getOrCreateAsyncState } from './component.js';

export function initializeFutureReadableEndClass(_context) {
    const FutureEnd = _context.FutureEnd;
    const { FutureValue } = _context;

    class FutureReadableEnd extends FutureEnd {
        #globalFutureMapRep;
        #futureTableIdx;
        #isHostOwned;
        #hostInjectFn;
        #elemMeta;
        #handle;
        #promise;

        target;

        constructor(args) {
            debugLog('[FutureReadableEnd#constructor()] args', args);
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
            return true;
        }
        isWritable() {
            return false;
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
            w.setTarget(`waitable for FutureReadableEnd (waitable [${idx}])`);
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

        _read(args) {
            const { buffer, onCopyDoneFn, componentIdx } = args;
            if (!buffer) {
                throw new Error('missing buffer for future read');
            }

            if (this.isDropped()) {
                throw new Error('cannot read from dropped future');
            }
            if (buffer.remaining() !== 1) {
                throw new Error(`invalid remaining values in buffer (expecetd one, received [${buffer.remaining()}]`);
            }

            const meta = this.getPendingBufferMeta();
            if (!meta) {
                throw new Error('missing pending buffer metadata');
            }
            if (!meta.buffer) {
                this.setPendingBufferMeta({
                    buffer,
                    componentIdx,
                    isWrite: false,
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
            buffer.write(meta.buffer.read(1, { transferResources }), { transferResources });
            this.resetAndNotifyPending(FutureEnd.CopyResult.COMPLETED);
            onCopyDoneFn(FutureEnd.CopyResult.COMPLETED);
        }

        // TODO: rename, guestRead also handles host reads (when data is present)...
        guestRead(args) {
            debugLog('[FutureReadableEnd#guestRead()] args', args);
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
                return { code: _context.events.FUTURE_READ, payload0: this.waitableIdx(), payload1: res };
            };

            const isReadableEnd = this.isReadable();
            const onCopyDoneFn = (res) => {
                if (res === FutureEnd.CopyResult.DROPPED && isReadableEnd) {
                    throw new Error('cannot read from a dropped future');
                }
                this.setPendingEvent(() => futureEvent(res));
            };

            // Before performing this read, if we're dealing with a host-controlled
            // future, start injecting the write. The injection may depend on sibling
            // guest work running, so cleanup is attached without awaiting here; the
            // canonical read must be able to return BLOCKED first.
            let injectedWritePromise;
            if (this.#hostInjectFn) {
                injectedWritePromise = this.#hostInjectFn({ count: 1 });
            }

            this._read({
                buffer,
                onCopyDoneFn,
                componentIdx,
            });

            if (injectedWritePromise) {
                injectedWritePromise.then(
                    (cleanupFn) => cleanupFn(),
                    (err) =>
                        this.setPendingEvent(() => {
                            throw err;
                        }),
                );
            }

            return { buffer };
        }

        async hostRead(args) {
            const { stringEncoding } = args;

            const { buffer } = await this.guestRead({
                stringEncoding,
                isAsync: true,
                data: [],
                componentIdx: -1,
            });

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
                    throw new Error('missing pending event after blocked future read');
                }
            }

            const { code, payload0: index, payload1: payload } = this.getPendingEvent();
            void payload;
            if (code !== _context.events.FUTURE_READ) {
                throw new Error(`mismatched event code [${code}] for host future read`);
            }
            if (index !== this.waitableIdx()) {
                throw new Error('mismatched future end index');
            }

            const vs = buffer.read(1);
            if (vs.length !== 1) {
                throw new Error('multiple results from future');
            }

            // The copy event is published from inside the guest's current
            // callback slice.
            //
            // Here we avoid exposing the lifted value to host code
            // until that slice has returned and released the instance lock, because
            // the consumer could immediately make a synchronous call on the lifted value
            // (e.g. if it's a resource)
            const componentIdx = this.getWaitable().componentIdx();
            if (componentIdx !== -1) {
                await getOrCreateAsyncState(_context.lookup, componentIdx).waitForExclusiveRelease();
            }

            return { value: vs[0] };
        }

        drop() {
            super.drop();
            // Let a host-provided future know if its value was discarded
            this.#hostInjectFn?.drop?.();
        }
    }

    return FutureReadableEnd;
}
