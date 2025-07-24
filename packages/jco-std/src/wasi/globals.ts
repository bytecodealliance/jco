/** Get the global `Request` */
export function ensureGlobalRequest() {
    if (!globalThis.Request) {
        throw new TypeError('Request not provided by platform');
    }
    return globalThis.Request;
}

/** Get the global `ReadableStream` */
export function ensureGlobalReadableStream() {
    if (!globalThis.ReadableStream) {
        throw new TypeError('ReadableStream not provided by platform');
    }
    return globalThis.ReadableStream;
}

/** Get the global `AddEventListener` */
export function ensureGlobalAddEventListener(): any {
    if (!('addEventListener' in globalThis)) {
        throw new TypeError('AddEventListener not provided by platform');
    }
    return (globalThis as any).addEventListener;
}
