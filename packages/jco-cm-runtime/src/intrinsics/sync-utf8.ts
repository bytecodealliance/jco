import type { StringEncodeInto, StringMemory, StringRealloc } from '../runtime.js';
import { utf8Encode } from './string.js';

interface SyncUtf8Context {
    encoder: StringEncodeInto;
    bytes?: Uint8Array;
    busy: boolean;
}

// One lazily allocated buffer per component instance. A result larger than the
// buffer can still use the ordinary exact-size encoder.
const MAX_STAGING_BYTES = 256 * 1024;

/** Lower a synchronous import result. Its caller only needs a pointer and byte length. */
export function encodeSyncUtf8(context: SyncUtf8Context, value: unknown, realloc: StringRealloc, memory: StringMemory) {
    if (typeof value !== 'string' || value.length < 256 || value.length > MAX_STAGING_BYTES || context.busy) {
        return utf8Encode(context.encoder, value, realloc, memory, true);
    }

    // Realloc or the encoder can call back into these bindings. A nested call
    // must not overwrite bytes awaiting their copy into the outer allocation.
    context.busy = true;
    try {
        // Three bytes per UTF-16 unit covers even a lone surrogate. Leave room for
        // one more scalar when possible so codecs can finish at the last boundary.
        const needed = Math.min(MAX_STAGING_BYTES, value.length * 3 + 4);
        let bytes = context.bytes;
        if (!bytes || bytes.length < needed) {
            const capacity = Math.min(MAX_STAGING_BYTES, Math.max(needed, 2 * (bytes?.length ?? 0)));
            context.bytes = bytes = new Uint8Array(capacity);
        }
        const { read, written } = context.encoder.encodeInto(value, bytes);
        if (read !== value.length || !Number.isInteger(written) || written < value.length || written > bytes.length) {
            return utf8Encode(context.encoder, value, realloc, memory, true);
        }
        const ptr = realloc(0, 0, 1, written);
        // Realloc may have grown memory.
        new Uint8Array(memory.buffer, ptr, written).set(bytes.subarray(0, written));
        return { ptr, len: written };
    } finally {
        context.busy = false;
    }
}
