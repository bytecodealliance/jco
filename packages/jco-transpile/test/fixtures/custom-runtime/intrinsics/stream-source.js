import { disposeHostValue } from './core.js';

export function isStreamLowerableObject(context, obj) {
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

export function genReadFnFromLowerableStream(context, stream) {
    if (!isStreamLowerableObject(context.lowerable, stream)) {
        throw new Error('cannot generate read fn: object is not a stream lowerable object');
    }
    const { asyncIteratorSymbol, iteratorSymbol, ReadableStream } = context.lowerable;
    const source = stream;
    let readFn;
    if (asyncIteratorSymbol in source) {
        const iterator = source[asyncIteratorSymbol]();
        readFn = () => iterator.next();
        readFn.drop = (reason) =>
            iterator.return
                ? disposeHostValue(context.disposeSymbol, iterator, () => iterator.return(reason))
                : disposeHostValue(context.disposeSymbol, stream);
    } else if (iteratorSymbol in source) {
        const iterator = source[iteratorSymbol]();
        readFn = async () => iterator.next();
        readFn.drop = (reason) =>
            iterator.return
                ? disposeHostValue(context.disposeSymbol, iterator, () => iterator.return(reason))
                : disposeHostValue(context.disposeSymbol, stream);
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
    return readFn;
}
