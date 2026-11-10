import type { StreamLowerableContext, StreamSourceContext, StreamReadFn } from '../runtime.js';
import { disposeHostValue } from './core.js';

export function isStreamLowerableObject(context: StreamLowerableContext, obj: unknown): boolean {
    if (obj === null || typeof obj !== 'object') {
        return false;
    }
    return (
        obj instanceof context.Stream ||
        context.asyncIteratorSymbol in obj ||
        context.iteratorSymbol in obj ||
        obj instanceof context.ReadableStream
    );
}

export function genReadFnFromLowerableStream(context: StreamSourceContext, stream: unknown): StreamReadFn {
    if (!isStreamLowerableObject(context.lowerable, stream)) {
        throw new Error('cannot generate read fn: object is not a stream lowerable object');
    }
    const { asyncIteratorSymbol, iteratorSymbol, ReadableStream } = context.lowerable;
    const source = stream as Record<symbol, () => AsyncIterator<unknown> | Iterator<unknown>>;
    // Ends the iteration when the iterator supports it, and disposes the source otherwise.
    const dropIterator = (iterator: AsyncIterator<unknown> | Iterator<unknown>) => (reason?: unknown) =>
        iterator.return
            ? disposeHostValue(context.disposeSymbol, iterator, () => iterator.return!(reason))
            : disposeHostValue(context.disposeSymbol, stream);
    let readFn: StreamReadFn;
    if (asyncIteratorSymbol in source) {
        const iterator = source[asyncIteratorSymbol]();
        readFn = () => iterator.next();
        readFn.drop = dropIterator(iterator);
    } else if (iteratorSymbol in source) {
        const iterator = source[iteratorSymbol]();
        readFn = async () => iterator.next();
        readFn.drop = dropIterator(iterator);
        readFn.sourceIsSync = true;
    } else if (stream instanceof ReadableStream) {
        const reader = stream.getReader();
        readFn = () => reader.read();
        readFn.drop = (reason) =>
            disposeHostValue(context.disposeSymbol, reader, () =>
                reader.cancel(reason).finally(() => reader.releaseLock()),
            );
    } else {
        throw new Error('invalid stream object, cannot generate read fn');
    }
    const drop = readFn.drop;
    readFn.drop = (reason) => {
        readFn.dropped = true;
        return drop(reason);
    };
    return readFn;
}
