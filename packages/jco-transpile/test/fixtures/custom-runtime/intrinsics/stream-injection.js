export function genStreamHostInjectFn(_context, genArgs) {
    const { readFn, hostWriteEnd, readEnd } = genArgs;
    if (!readEnd) {
        throw new TypeError('missing read end');
    }
    const doNothingFn = () => {};
    const resetWriteEndToIdleFn = () => {
        // After the write is finished, we consume the event that was generated
        // by the just-in-time write (and the subsequent read), if one was generated
        if (hostWriteEnd.hasPendingEvent()) {
            hostWriteEnd.getPendingEvent();
        }
    };

    const elemMeta = hostWriteEnd.getElemMeta();

    const pendingValues = new _context.PendingValueQueue(readFn, elemMeta);
    hostWriteEnd.setSourceRebufferFn?.((items) => pendingValues.prepend(items));

    return async function generatedStreamHostInject(args) {
        let { count } = args;
        if (count < 0) {
            throw new Error('invalid count');
        }
        if (readEnd.hasPendingEvent()) {
            return resetWriteEndToIdleFn;
        }

        if (hostWriteEnd.isDoneState()) {
            return doNothingFn;
        }

        const values = [];
        const hasPendingReadBuffer = () => !!readEnd.getPendingBufferMeta?.().buffer;

        const drainPendingValues = () => {
            count -= pendingValues.drainInto(values, count);
        };

        const writeValues = async (writeValues, dropAfterCopy = false) => {
            // The previous injected write's completion event is consumed lazily,
            // and consuming it is what returns the write end to idle. A guest
            // that issues reads back to back within one slice can start the next
            // injected write before that happens, which would fail as a
            // concurrent operation and leave the read with no completion.
            resetWriteEndToIdleFn();
            const writePromise = hostWriteEnd.writeMany(writeValues, { dropAfterCopy });
            if (hostWriteEnd.hasPendingEvent()) {
                void writePromise.catch(() => {});
            } else {
                await writePromise;
            }
            resetWriteEndToIdleFn();
        };

        const bail = () => {
            pendingValues.prepend(values);
            return doNothingFn;
        };

        readEnd.setHostCancelFn?.(() => {
            const buffer = readEnd.getPendingBufferMeta?.().buffer;
            if (!buffer || pendingValues.length === 0) {
                return false;
            }
            const cancelValues = [];
            pendingValues.drainInto(cancelValues, buffer.remaining());
            if (cancelValues.length === 0) {
                return false;
            }
            resetWriteEndToIdleFn();
            const writePromise = hostWriteEnd.writeMany(cancelValues);
            if (!hostWriteEnd.hasPendingEvent()) {
                pendingValues.prepend(cancelValues);
                return false;
            }
            void writePromise.catch(() => {});
            resetWriteEndToIdleFn();
            return true;
        });

        if (!hasPendingReadBuffer()) {
            return doNothingFn;
        }
        if (count === 0) {
            if (pendingValues.length === 0 && !pendingValues.done) {
                await pendingValues.readSource();
                if (readEnd.hasPendingEvent() || !hasPendingReadBuffer()) {
                    return doNothingFn;
                }
            }
            if (pendingValues.length > 0) {
                // Readiness signal for a zero-length read: complete it with zero
                // items rather than draining/buffering one (which the wasmtime
                // host contract warns can be lost, and which stores a pending
                // write that corrupts the next read's rendezvous).
                readEnd.resetAndNotifyPending(readEnd.constructor.CopyResult.COMPLETED);
            } else if (pendingValues.done) {
                hostWriteEnd.getPendingEvent();
                hostWriteEnd.drop();
            }
            return doNothingFn;
        }
        drainPendingValues();

        while (count > 0 && !pendingValues.done) {
            const appended = await pendingValues.readSource();
            if (readEnd.hasPendingEvent()) {
                return bail();
            }
            if (!hasPendingReadBuffer()) {
                return bail();
            }
            drainPendingValues();
            // Deliver data as soon as any is available rather than
            // waiting on the source for a full count -- except for
            // synchronous sources, which can be drained eagerly
            // without waiting
            if (values.length > 0 && !pendingValues.sourceIsSync) {
                break;
            }
            if (appended === 0 && !pendingValues.done) {
                count -= 1;
            }
            if (pendingValues.done) {
                break;
            }
        }

        // Iterator provided `done: true` with no final value
        if (pendingValues.done && values.length === 0 && pendingValues.length > 0 && hasPendingReadBuffer()) {
            drainPendingValues();
        }
        if (pendingValues.done && values.length === 0) {
            hostWriteEnd.getPendingEvent();
            hostWriteEnd.drop();
            return doNothingFn;
        }

        if (!hasPendingReadBuffer()) {
            return bail();
        }
        await writeValues(values, pendingValues.done);

        return doNothingFn;
    };
}
