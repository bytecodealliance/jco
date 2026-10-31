import type {
    StringModule,
    StringMemory,
    StringAllocation,
    Utf16EncodingContext,
    StringEncodeInto,
} from '../runtime.js';

function requireString(value: unknown): string {
    if (typeof value !== 'string') {
        throw new TypeError('expected a string, received [' + typeof value + ']');
    }
    return value;
}

function utf8Size(s: string): { len: number; codepoints: number } {
    let len = 0;
    let codepoints = 0;
    for (let i = 0; i < s.length; i++) {
        const ch = s.charCodeAt(i);
        codepoints++;
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
    return { len, codepoints };
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
    const put = context.littleEndian
        ? (i: number, ch: number) => {
              out[i] = ch;
          }
        : (i: number, ch: number) => {
              out[i] = ((ch & 0xff) << 8) | (ch >>> 8);
          };
    for (let i = 0; i < len; i++) {
        let ch = str.charCodeAt(i);
        if ((ch & 0xf800) === 0xd800) {
            if (ch < 0xdc00 && i + 1 < len && (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
                put(i++, ch);
                ch = str.charCodeAt(i);
            } else {
                ch = 0xfffd;
            }
        }
        put(i, ch);
    }
    return { ptr, len, codepoints: [...str].length };
}

function writeUtf8(
    encoder: StringEncodeInto,
    s: string,
    ptr: number,
    len: number,
    codepoints: number,
    memory: StringMemory,
): StringAllocation {
    const { read, written } = encoder.encodeInto(s, new Uint8Array(memory.buffer, ptr, len));
    if (read !== s.length || written !== len) {
        throw new Error('failed to encode whole string');
    }
    return { ptr, len, codepoints };
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
    const { len, codepoints } = utf8Size(s);
    const ptr = realloc(0, 0, 1, len);
    return writeUtf8(encoder, s, ptr, len, codepoints, memory);
};

export const utf8EncodeAsync: StringModule['utf8EncodeAsync'] = async (encoder, value, realloc, memory) => {
    const s = requireString(value);
    if (s.length === 0) {
        return { ptr: 1, len: 0 };
    }
    const { len, codepoints } = utf8Size(s);
    const ptr = await realloc(0, 0, 1, len);
    return writeUtf8(encoder, s, ptr, len, codepoints, memory);
};

export const validateGuestChar: StringModule['validateGuestChar'] = (value) => {
    if (value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
        throw new TypeError('not a valid char');
    }
    return String.fromCodePoint(value);
};

export const validateHostChar: StringModule['validateHostChar'] = (value) => {
    if (typeof value !== 'string') {
        throw new TypeError('must be a string');
    }
    return value.codePointAt(0);
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
