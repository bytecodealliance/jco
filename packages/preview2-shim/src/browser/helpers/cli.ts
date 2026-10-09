import { pollableCreate, type InputStreamHandler } from "../io.js";

/**
 * Build an `InputStreamHandler` that serves a fixed buffer, then reports `closed`.
 *
 * Pass the result to `createCli({ stdin })` or `_setStdin` to feed a guest a fixed stdin.
 */
export function bufferedInputStream(input: Uint8Array | string): InputStreamHandler {
    const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
    let offset = 0;

    return {
        blockingRead(len: bigint): Uint8Array {
            if (offset >= bytes.length) {
                throw { tag: "closed" };
            }
            const remaining = bytes.length - offset;
            const toRead = len < BigInt(remaining) ? Number(len) : remaining;
            const chunk = bytes.slice(offset, offset + toRead);
            offset += toRead;
            return chunk;
        },
        subscribe() {
            return pollableCreate();
        },
    };
}
