import type { LiftModule } from '../runtime.js';

/** Decode UTF-8 while distinguishing malformed bytes from truncated sequences. */
export const decodeUtf8: LiftModule['decodeUtf8'] = (RuntimeError, decoder, input, shortAscii = false) => {
    // Short attribute names and IDs can be lifted without entering TextDecoder.
    // A high bit in any byte sends the whole input through the decoder so malformed
    // or truncated UTF-8 still has the usual validation and trap behavior.
    ascii: if (shortAscii && input instanceof Uint8Array && input.length > 0 && input.length <= 32) {
        const length = input.length;
        if (length === 2) {
            const a = input[0],
                b = input[1];
            if ((a | b) >= 0x80) break ascii;
            return String.fromCharCode(a, b);
        }
        let text = '';
        let i = 0;
        for (; i + 4 <= length; i += 4) {
            const a = input[i],
                b = input[i + 1],
                c = input[i + 2],
                d = input[i + 3];
            if ((a | b | c | d) >= 0x80) break ascii;
            text += String.fromCharCode(a, b, c, d);
        }
        for (; i < length; i++) {
            const byte = input[i];
            if (byte >= 0x80) break ascii;
            text += String.fromCharCode(byte);
        }
        return text;
    }
    try {
        return decoder.decode(input);
    } catch (error) {
        if (!(error instanceof TypeError)) {
            throw error;
        }
        let bytes: Uint8Array;
        try {
            bytes = ArrayBuffer.isView(input)
                ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
                : new Uint8Array(input);
        } catch {
            throw error;
        }

        // Fatal codecs do not distinguish malformed data from truncated prefixes.
        // Preserve provider errors when the input is valid.
        for (let i = 0; i < bytes.length; i++) {
            const lead = bytes[i];
            if (lead < 0x80) {
                continue;
            }
            const count =
                lead >= 0xc2 && lead <= 0xdf
                    ? 1
                    : lead >= 0xe0 && lead <= 0xef
                      ? 2
                      : lead >= 0xf0 && lead <= 0xf4
                        ? 3
                        : -1;
            if (count < 0) {
                throw new RuntimeError('invalid utf-8');
            }
            for (let j = 1; j <= count; j++) {
                if (i + j >= bytes.length) {
                    throw new RuntimeError('incomplete utf-8 byte sequence');
                }
                const byte = bytes[i + j];
                if (
                    byte < 0x80 ||
                    byte > 0xbf ||
                    (j === 1 &&
                        ((lead === 0xe0 && byte < 0xa0) ||
                            (lead === 0xed && byte > 0x9f) ||
                            (lead === 0xf0 && byte < 0x90) ||
                            (lead === 0xf4 && byte > 0x8f)))
                ) {
                    throw new RuntimeError('invalid utf-8');
                }
            }
            i += count;
        }
        throw error;
    }
};
