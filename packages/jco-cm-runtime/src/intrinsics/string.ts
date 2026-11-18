import type {
    StringModule,
    StringMemory,
    StringAllocation,
    Utf16EncodingContext,
    StringEncodeInto,
} from '../runtime.js';

const nonAscii = /[^\x00-\x7f]/;

function requireString(value: unknown): string {
    if (typeof value !== 'string') {
        throw new TypeError('expected a string, received [' + typeof value + ']');
    }
    return value;
}

/**
 * The exact UTF-8 size of a string, where an unpaired surrogate counts as the three bytes
 * of the replacement character that encodes it.
 */
function utf8Size(s: string): number {
    // Every ASCII code unit occupies one byte. Scan long strings in bulk.
    if (s.length >= 256 && !nonAscii.test(s)) {
        return s.length;
    }
    let len = 0;
    for (let i = 0; i < s.length; i++) {
        const ch = s.charCodeAt(i);
        if (ch < 0x80) {
            len += 1;
        } else if (ch < 0x800) {
            len += 2;
        } else if (ch >= 0xd800 && ch <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
            len += 4;
            i++;
        } else {
            len += 3;
        }
    }
    return len;
}

export const initializeUtf8Decoder: StringModule['initializeUtf8Decoder'] = () =>
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export const initializeUtf16Decoder: StringModule['initializeUtf16Decoder'] = () =>
    new TextDecoder('utf-16', { fatal: true, ignoreBOM: true });
export const initializeUtf8Encoder: StringModule['initializeUtf8Encoder'] = () => new TextEncoder();
export const initializeUtf16Encoding: StringModule['initializeUtf16Encoding'] = () => ({
    littleEndian: new Uint8Array(new Uint16Array([1]).buffer)[0] === 1,
});

function writeUtf16(context: Utf16EncodingContext, str: string, ptr: number, memory: StringMemory): StringAllocation {
    const len = str.length;
    const out = new Uint16Array(memory.buffer, ptr, len);

    // Write the code units in the byte order of this platform, replacing each
    // lone surrogate.
    for (let i = 0; i < len; i++) {
        let ch = str.charCodeAt(i);
        if ((ch & 0xf800) === 0xd800) {
            if (ch < 0xdc00 && i + 1 < len && (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
                out[i++] = ch;
                ch = str.charCodeAt(i);
            } else {
                ch = 0xfffd;
            }
        }
        out[i] = ch;
    }

    // Guest memory is little endian.
    if (!context.littleEndian) {
        for (let i = 0; i < len; i++) {
            out[i] = ((out[i] & 0xff) << 8) | (out[i] >>> 8);
        }
    }
    return { ptr, len };
}

function writeUtf8(
    encoder: StringEncodeInto,
    s: string,
    ptr: number,
    len: number,
    memory: StringMemory,
): StringAllocation {
    const out = new Uint8Array(memory.buffer, ptr, len);
    const { read, written } = encoder.encodeInto(s, out);
    if (read !== s.length || written !== len) {
        finishUtf8(s, read, out, written);
    }
    return { ptr, len };
}

/**
 * Encode the rest of a string whose encoder stopped before its end.
 *
 * An encoder may leave a tail unwritten although the destination has room for it.
 * Node.js 26.13 stops before a final character in U+0400 to U+07FF when exactly
 * its two bytes remain, in strings of more than 32 code units. The destination
 * was sized by `utf8Size`, which measures scalars the same way as this function,
 * so the tail fills it exactly.
 *
 * @param s - string being encoded
 * @param read - UTF-16 code units of `s` that the encoder consumed
 * @param out - destination of exactly the UTF-8 length of `s`
 * @param written - bytes of `out` that the encoder filled
 * @throws {Error} when the encoder's progress is not a scalar boundary inside
 *   `s` and `out`, or the tail does not end exactly at the end of `out`
 */
function finishUtf8(s: string, read: number, out: Uint8Array, written: number): void {
    const failure = 'failed to encode whole string';
    if (read >>> 0 !== read || read > s.length || written >>> 0 !== written || written > out.length) {
        throw new Error(failure);
    }
    // Resuming inside a surrogate pair would encode its second half as a lone surrogate.
    if (read > 0 && (s.charCodeAt(read - 1) & 0xfc00) === 0xd800 && (s.charCodeAt(read) & 0xfc00) === 0xdc00) {
        throw new Error(failure);
    }

    for (let i = read; i < s.length; i++) {
        let scalar = s.charCodeAt(i);
        let size = 3;
        if (scalar < 0x80) {
            size = 1;
        } else if (scalar < 0x800) {
            size = 2;
        } else if ((scalar & 0xf800) === 0xd800) {
            const next = s.charCodeAt(i + 1);
            if (scalar < 0xdc00 && (next & 0xfc00) === 0xdc00) {
                scalar = 0x10000 + ((scalar - 0xd800) << 10) + (next - 0xdc00);
                size = 4;
                i++;
            } else {
                // A lone surrogate encodes as U+FFFD, as TextEncoder does.
                scalar = 0xfffd;
            }
        }
        if (written + size > out.length) {
            throw new Error(failure);
        }

        // Write the lead byte, then six bits of the scalar in each continuation byte.
        if (size === 1) {
            out[written++] = scalar;
            continue;
        }
        if (size === 2) {
            out[written++] = 0xc0 | (scalar >> 6);
        } else if (size === 3) {
            out[written++] = 0xe0 | (scalar >> 12);
        } else {
            out[written++] = 0xf0 | (scalar >> 18);
            out[written++] = 0x80 | ((scalar >> 12) & 0x3f);
        }
        if (size > 2) {
            out[written++] = 0x80 | ((scalar >> 6) & 0x3f);
        }
        out[written++] = 0x80 | (scalar & 0x3f);
    }
    if (written !== out.length) {
        throw new Error(failure);
    }
}

export const utf16Encode: StringModule['utf16Encode'] = (context, value, realloc, memory) => {
    const str = requireString(value);
    const ptr = realloc(0, 0, 2, str.length * 2);
    return writeUtf16(context, str, ptr, memory);
};

export const utf16EncodeAsync: StringModule['utf16EncodeAsync'] = async (context, value, realloc, memory) => {
    const str = requireString(value);
    const ptr = await realloc(0, 0, 2, str.length * 2);
    return writeUtf16(context, str, ptr, memory);
};

export const utf16ValidatingCopy: StringModule['utf16ValidatingCopy'] = (from, to) => {
    let allLatin1 = true;
    let highSurrogate = false;
    for (let i = 0; i < from.length; i++) {
        const unit = from[i];
        if (highSurrogate !== ((unit & 0xfc00) === 0xdc00)) {
            throw new Error('invalid utf16 encoding');
        }
        highSurrogate = (unit & 0xfc00) === 0xd800;
        if (unit > 0xff) {
            allLatin1 = false;
        }
        to[i] = unit;
    }
    if (highSurrogate) {
        throw new Error('invalid utf16 encoding');
    }
    return allLatin1;
};

export const utf8Encode: StringModule['utf8Encode'] = (encoder, value, realloc, memory) => {
    const s = requireString(value);
    if (s.length === 0) {
        return { ptr: 1, len: 0 };
    }
    // Some preview1 allocators cannot shrink, so allocate exactly once.
    const len = utf8Size(s);
    const ptr = realloc(0, 0, 1, len);
    return writeUtf8(encoder, s, ptr, len, memory);
};

export const utf8EncodeAsync: StringModule['utf8EncodeAsync'] = async (encoder, value, realloc, memory) => {
    const s = requireString(value);
    if (s.length === 0) {
        return { ptr: 1, len: 0 };
    }
    const len = utf8Size(s);
    const ptr = await realloc(0, 0, 1, len);
    return writeUtf8(encoder, s, ptr, len, memory);
};

export const validateGuestChar: StringModule['validateGuestChar'] = (value) => {
    if (value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
        throw new TypeError('not a valid char');
    }
    return String.fromCodePoint(value);
};

/** Lower exactly one Unicode scalar value from a host string. */
export const validateHostChar: StringModule['validateHostChar'] = (value) => {
    if (typeof value !== 'string') {
        throw new TypeError('must be a string');
    }

    const codePoint = value.codePointAt(0);
    if (
        codePoint === undefined ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
        value.length !== (codePoint > 0xffff ? 2 : 1)
    ) {
        throw new TypeError('not a valid char');
    }

    return codePoint;
};

/** Decode canonical Latin-1 bytes directly; TextDecoder('latin1') uses Windows-1252. */
export const compactUtf16Decode: StringModule['compactUtf16Decode'] = (decoder, memory, ptr, taggedLength) => {
    ptr >>>= 0;
    taggedLength >>>= 0;
    if (ptr % 2 !== 0) {
        throw new RangeError('unaligned compact UTF-16 string');
    }
    if (taggedLength & 0x80000000) {
        return decoder.decode(new Uint8Array(memory.buffer, ptr, (taggedLength & 0x7fffffff) * 2));
    }
    const bytes = new Uint8Array(memory.buffer, ptr, taggedLength);
    let value = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        value += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return value;
};

export const compactUtf16Encode: StringModule['compactUtf16Encode'] = (context, value, realloc, memory) => {
    if (typeof value !== 'string') {
        throw new TypeError('expected a string');
    }
    if (value.length >= 0x80000000) {
        throw new RangeError('compact UTF-16 string is too long');
    }
    for (let i = 0; i < value.length; i++) {
        if (value.charCodeAt(i) > 0xff) {
            const encoded = utf16Encode(context, value, realloc, memory);
            return { ...encoded, len: (encoded.len | 0x80000000) >>> 0 };
        }
    }
    const ptr = realloc(0, 0, 2, value.length) >>> 0;
    if (ptr % 2 !== 0) {
        throw new RangeError('unaligned compact UTF-16 allocation');
    }
    const bytes = new Uint8Array(memory.buffer, ptr, value.length);
    for (let i = 0; i < value.length; i++) {
        bytes[i] = value.charCodeAt(i);
    }
    return { ptr, len: value.length };
};
