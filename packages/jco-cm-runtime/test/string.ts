import { expect, test } from 'vitest';

import * as string from '../src/intrinsics/string.js';
import type { StringRealloc, AsyncStringRealloc, StringMemory } from '../src/runtime.js';

test.concurrent.each([
    ['', '', false],
    ['A\u0080\u009féÿ', 'A\u0080\u009féÿ', false],
    ['\ufeffA😀β', '\ufeffA😀β', true],
    ['\ud800x\udc00', '\ufffdx\ufffd', true],
] as const)('compact encoding preserves canonical representation: %j', (input, expected, tagged) => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 });
    const allocations: number[][] = [];
    const result = string.compactUtf16Encode(
        string.initializeUtf16Encoding(),
        input,
        (...args) => {
            allocations.push(args);
            memory.grow(1);
            return 65536;
        },
        memory,
    );
    expect(allocations).toEqual([[0, 0, 2, input.length * (tagged ? 2 : 1)]]);
    expect(!!(result.len & 0x80000000)).toBe(tagged);
    expect(result.len & 0x7fffffff).toBe(input.length);
    expect(string.compactUtf16Decode(string.initializeUtf16Decoder(), memory, result.ptr, result.len)).toBe(expected);
});

test.concurrent('compact Latin-1 decoding handles more than one argument chunk', () => {
    const bytes = new Uint8Array(65538).fill(0x80);
    expect(string.compactUtf16Decode(string.initializeUtf16Decoder(), { buffer: bytes.buffer }, 0, bytes.length)).toBe(
        '\u0080'.repeat(bytes.length),
    );
});

test.concurrent('compact strings reject malformed, misaligned and out-of-bounds data', () => {
    const memory = { buffer: new ArrayBuffer(8) };
    const decoder = string.initializeUtf16Decoder();
    new DataView(memory.buffer).setUint16(0, 0xd800, true);
    expect(() => string.compactUtf16Decode(decoder, memory, 0, 0x80000001)).toThrow(TypeError);
    expect(() => string.compactUtf16Decode(decoder, memory, 1, 1)).toThrow(RangeError);
    expect(() => string.compactUtf16Decode(decoder, memory, 0, 9)).toThrow(RangeError);
    expect(() => string.compactUtf16Decode(decoder, memory, 0, 0x80000005)).toThrow(RangeError);
    expect(() => string.compactUtf16Encode(string.initializeUtf16Encoding(), 'A', () => 1, memory)).toThrow(RangeError);
    expect(() =>
        string.compactUtf16Encode(
            string.initializeUtf16Encoding(),
            42,
            () => {
                throw new Error('must reject before allocation');
            },
            memory,
        ),
    ).toThrow('expected a string');
});

function strings() {
    const utf8Encoder = string.initializeUtf8Encoder();
    const utf16Context = string.initializeUtf16Encoding();
    return {
        ...string,
        utf8Encoder,
        utf8Decoder: string.initializeUtf8Decoder(),
        utf16Decoder: string.initializeUtf16Decoder(),
        utf8Encode: (value: unknown, realloc: StringRealloc, memory: StringMemory) =>
            string.utf8Encode(utf8Encoder, value, realloc, memory),
        utf8EncodeAsync: (value: unknown, realloc: AsyncStringRealloc, memory: StringMemory) =>
            string.utf8EncodeAsync(utf8Encoder, value, realloc, memory),
        utf16Encode: (value: unknown, realloc: StringRealloc, memory: StringMemory) =>
            string.utf16Encode(utf16Context, value, realloc, memory),
        utf16EncodeAsync: (value: unknown, realloc: AsyncStringRealloc, memory: StringMemory) =>
            string.utf16EncodeAsync(utf16Context, value, realloc, memory),
    };
}

const CASES = [
    { value: '', utf8: [], utf16: [], codepoints: 0 },
    { value: 'aé中', utf8: [0x61, 0xc3, 0xa9, 0xe4, 0xb8, 0xad], utf16: [0x61, 0, 0xe9, 0, 0x2d, 0x4e], codepoints: 3 },
    { value: '🚀', utf8: [0xf0, 0x9f, 0x9a, 0x80], utf16: [0x3d, 0xd8, 0x80, 0xde], codepoints: 1 },
    { value: '\ufeff', utf8: [0xef, 0xbb, 0xbf], utf16: [0xff, 0xfe], codepoints: 1 },
    {
        value: '\ud800x\udc00',
        utf8: [0xef, 0xbf, 0xbd, 0x78, 0xef, 0xbf, 0xbd],
        utf16: [0xfd, 0xff, 0x78, 0, 0xfd, 0xff],
        codepoints: 3,
    },
];

for (const encoding of ['utf8', 'utf16'] as const) {
    for (const async of [false, true]) {
        const method = `${encoding}Encode${async ? 'Async' : ''}` as const;
        test.concurrent.each(CASES)(`${method} encodes $value with one exact allocation`, async (entry) => {
            const s = strings();
            const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 });
            const calls: number[][] = [];
            const realloc = (...args: number[]) => {
                calls.push(args);
                memory.grow(1);
                return 65536;
            };
            const allocate = async
                ? async (...args: number[]) => {
                      await Promise.resolve();
                      return realloc(...args);
                  }
                : realloc;
            const result = async
                ? await s[`${encoding}EncodeAsync`](entry.value, allocate, memory)
                : s[`${encoding}Encode`](entry.value, realloc, memory);
            if (encoding === 'utf8' && entry.value === '') {
                expect(result).toEqual({ ptr: 1, len: 0 });
                expect(calls).toEqual([]);
            } else {
                const bytes = entry[encoding];
                expect(calls).toEqual([[0, 0, encoding === 'utf8' ? 1 : 2, bytes.length]]);
                expect(result).toEqual({
                    ptr: 65536,
                    len: encoding === 'utf8' ? bytes.length : bytes.length / 2,
                    codepoints: entry.codepoints,
                });
                expect([...new Uint8Array(memory.buffer, result.ptr, bytes.length)]).toEqual(bytes);
            }
        });

        test.concurrent(`${method} rejects non-strings before allocation`, async () => {
            const s = strings();
            const memory = { buffer: new ArrayBuffer(0) };
            const realloc = () => {
                throw new Error('must not allocate');
            };
            for (const value of [undefined, null, 42, true, {}, Symbol('s')]) {
                const message = `expected a string, received [${typeof value}]`;
                if (async) {
                    await expect(s[`${encoding}EncodeAsync`](value, realloc, memory)).rejects.toThrow(message);
                } else {
                    expect(() => s[`${encoding}Encode`](value, realloc, memory)).toThrow(message);
                }
            }
        });
    }
}

test.concurrent('async encoders await allocation before reading the memory buffer', async () => {
    for (const encoding of ['utf8', 'utf16'] as const) {
        let allocated = false;
        const buffer = new ArrayBuffer(16);
        const memory = {
            get buffer() {
                expect(allocated).toBe(true);
                return buffer;
            },
        };
        const result = await strings()[`${encoding}EncodeAsync`](
            'x',
            async () => {
                await Promise.resolve();
                allocated = true;
                return 8;
            },
            memory,
        );
        expect(result.ptr).toBe(8);
        expect(new Uint8Array(buffer)[8]).toBe(0x78);
    }
});

test.concurrent('allocator failures propagate unchanged', async () => {
    const s = strings();
    const failure = new Error('allocation failed');
    const memory = { buffer: new ArrayBuffer(0) };
    for (const encoding of ['utf8', 'utf16'] as const) {
        expect(() =>
            s[`${encoding}Encode`](
                'x',
                () => {
                    throw failure;
                },
                memory,
            ),
        ).toThrow(failure);
        await expect(s[`${encoding}EncodeAsync`]('x', () => Promise.reject(failure), memory)).rejects.toBe(failure);
    }
});

test.concurrent('codecs preserve BOMs and reject malformed guest encodings', () => {
    const s = strings();
    expect(s.utf8Decoder.decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBe('\ufeffa');
    expect(s.utf16Decoder.decode(new Uint8Array([0xff, 0xfe, 0x61, 0]))).toBe('\ufeffa');
    for (const bytes of [[0xc0, 0x80], [0xed, 0xa0, 0x80], [0xf0, 0x9f], [0xff]]) {
        expect(() => s.utf8Decoder.decode(new Uint8Array(bytes))).toThrow(TypeError);
    }
    for (const bytes of [[0x61], [0, 0xd8], [0, 0xdc], [0, 0xd8, 0x61, 0]]) {
        expect(() => s.utf16Decoder.decode(new Uint8Array(bytes))).toThrow(TypeError);
    }
    expect([...s.utf8Encoder.encode('\ud800')]).toEqual([0xef, 0xbf, 0xbd]);
    const out = new Uint8Array(3);
    expect(s.utf8Encoder.encodeInto('🚀', out)).toEqual({ read: 0, written: 0 });
});

test.concurrent('each store owns its codecs', () => {
    const a = strings();
    const b = strings();
    expect(a.utf8Decoder).not.toBe(b.utf8Decoder);
    expect(a.utf16Decoder).not.toBe(b.utf16Decoder);
    expect(a.utf8Encoder).not.toBe(b.utf8Encoder);
});

test.concurrent.each([
    { units: [], latin1: true },
    { units: [0, 0x61, 0xff], latin1: true },
    { units: [0x100], latin1: false },
    { units: [0xd83d, 0xde80], latin1: false },
])('UTF-16 validating copy reports Latin-1 for $units', ({ units, latin1 }) => {
    const out = new Uint16Array(units.length);
    expect(strings().utf16ValidatingCopy(new Uint16Array(units), out)).toBe(latin1);
    expect([...out]).toEqual(units);
});

test.concurrent.each([[0xd800], [0xdc00], [0xd800, 0x61], [0xd800, 0xd800]])(
    'UTF-16 validating copy rejects unpaired surrogates (%j)',
    (...units) => {
        expect(() => strings().utf16ValidatingCopy(new Uint16Array(units), new Uint16Array(units.length))).toThrow(
            'invalid utf16 encoding',
        );
    },
);

test.concurrent('character validation accepts Unicode scalar values and rejects invalid strings', () => {
    const s = strings();
    expect(s.validateGuestChar(0)).toBe('\0');
    expect(s.validateGuestChar(0x1f680)).toBe('🚀');
    expect(s.validateGuestChar(0x10ffff)).toBe('\u{10ffff}');
    for (const value of [0xd800, 0xdfff, 0x110000]) {
        expect(() => s.validateGuestChar(value)).toThrow('not a valid char');
    }
    for (const value of [-1, 1.5, NaN]) {
        expect(() => s.validateGuestChar(value)).toThrow(RangeError);
    }
    for (const value of ['\0', 'a', 'é', '\u0301', '\ud7ff', '\ue000', '\uffff', '\u{10000}', '🚀', '\u{10ffff}']) {
        expect(s.validateHostChar(value)).toBe(value.codePointAt(0));
    }
    for (const value of [
        '',
        'ab',
        '🚀x',
        'x🚀',
        '🚀🚀',
        'e\u0301',
        '\ud800',
        '\udbff',
        '\udc00',
        '\udfff',
        '\udc00\ud800',
        '\ud800a',
    ]) {
        expect(() => s.validateHostChar(value)).toThrow(new TypeError('not a valid char'));
    }
    expect(() => s.validateHostChar(42)).toThrow('must be a string');
});

test.concurrent('UTF16 encoding honors its explicit endianness capability', () => {
    const memory = { buffer: new ArrayBuffer(8) };
    string.utf16Encode({ littleEndian: false }, 'a', () => 0, memory);
    expect(new Uint16Array(memory.buffer)[0]).toBe(0x6100);
});

test.concurrent('UTF8 allocation calls the supplied encoder with its own receiver', () => {
    const encoder = {
        encodeInto(input: string, destination: Uint8Array) {
            expect(this).toBe(encoder);
            return new TextEncoder().encodeInto(input, destination);
        },
    };
    const memory = { buffer: new ArrayBuffer(8) };
    expect(string.utf8Encode(encoder, 'é', () => 0, memory)).toEqual({ ptr: 0, len: 2, codepoints: 1 });
});

test.concurrent.each(['', 'ascii', '😀𝄞', '\ud800x\udc00', 'a😀\ud800é'.repeat(256)])(
    'UTF-16 encoding counts scalars without changing surrogate repair: %j',
    async (value) => {
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 3 });
        const context = string.initializeUtf16Encoding();
        const realloc = () => {
            memory.grow(1);
            return 65536;
        };
        const encoded = string.utf16Encode(context, value, realloc, memory);
        expect(encoded.codepoints).toBe([...value].length);
        expect(new TextDecoder('utf-16le').decode(new Uint8Array(memory.buffer, encoded.ptr, encoded.len * 2))).toBe(
            value.toWellFormed(),
        );
        const asynchronous = await string.utf16EncodeAsync(context, value, async () => realloc(), memory);
        expect(asynchronous).toEqual(encoded);
    },
);

test.concurrent.each(['ascii', 'é', '😀', '\ud800x\udc00', '\ufeff'])(
    'UTF-8 bytes and scalar counts agree with TextEncoder: %j',
    async (unit) => {
        const value = unit.repeat(1024);
        const encoder = string.initializeUtf8Encoder();
        const expected = new TextEncoder().encode(value);
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 3 });
        const realloc = (_ptr: number, _old: number, align: number, size: number) => {
            expect(align).toBe(1);
            expect(size).toBe(expected.length);
            memory.grow(1);
            return 65536;
        };
        const encoded = string.utf8Encode(encoder, value, realloc, memory);
        expect(encoded.codepoints).toBe([...value].length);
        expect(new Uint8Array(memory.buffer, encoded.ptr, encoded.len)).toEqual(expected);
        let calls = 0;
        const original = encoder.encodeInto.bind(encoder);
        const changed = await string.utf8EncodeAsync(
            encoder,
            value,
            async (...args) => {
                Object.defineProperty(encoder, 'encodeInto', {
                    value: (input: string, output: Uint8Array) => {
                        calls++;
                        return original(input, output);
                    },
                });
                return realloc(...args);
            },
            memory,
        );
        expect(calls).toBe(1);
        expect(changed).toEqual(encoded);
        expect(new Uint8Array(memory.buffer, changed.ptr, changed.len)).toEqual(expected);
    },
);

/** Strings whose exact-size `encodeInto` stops one character early on Node.js 26.13. */
const shortWrites = [
    'aaaa\udfff' + 'a'.repeat(19) + '😀' + 'a'.repeat(13) + '߿',
    '\udfff' + 'a'.repeat(19) + '😀' + 'a'.repeat(13) + '߿',
    'a'.repeat(60) + 'я',
    'a'.repeat(52) + 'Ѐ',
];

/** Byte that surrounds an allocation under test, to show writes stay inside it. */
const GUARD = 0xa5;

/**
 * Lower a string into a guarded allocation of exactly its UTF-8 length.
 *
 * @param encoder - encoder to lower with
 * @param value - string to lower
 * @returns the sizes allocated, the bytes written, and whether the bytes around them are untouched
 */
function lowerGuarded(encoder: Parameters<typeof string.utf8Encode>[0], value: string) {
    const memory = { buffer: new ArrayBuffer(1024) };
    const bytes = new Uint8Array(memory.buffer).fill(GUARD);
    const sizes: number[] = [];
    const { ptr, len } = string.utf8Encode(
        encoder,
        value,
        (_ptr, _oldSize, _alignment, size) => {
            sizes.push(size);
            return 8;
        },
        memory,
    );
    const guarded = bytes.every((byte, i) => (i >= ptr && i < ptr + len) || byte === GUARD);
    return { sizes, written: bytes.slice(ptr, ptr + len), guarded };
}

test.concurrent.each(shortWrites)('UTF-8 encoding fills its exact allocation: %j', async (value) => {
    const expected = new TextEncoder().encode(value);
    const lowered = lowerGuarded(string.initializeUtf8Encoder(), value);
    expect(lowered).toEqual({ sizes: [expected.length], written: expected, guarded: true });

    const memory = { buffer: new ArrayBuffer(1024) };
    const encoded = await string.utf8EncodeAsync(string.initializeUtf8Encoder(), value, async () => 8, memory);
    expect(encoded).toEqual({ ptr: 8, len: expected.length, codepoints: [...value].length });
    expect(new Uint8Array(memory.buffer, encoded.ptr, encoded.len)).toEqual(expected);
});

/**
 * Create a seeded generator of uniform numbers in [0, 1).
 *
 * @param seed - 32-bit state to start from
 * @returns the generator
 */
function random(seed: number): () => number {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
    };
}

/**
 * Build a string of 1 to 200 characters of every UTF-8 length, with lone surrogates.
 *
 * @param next - source of uniform numbers in [0, 1)
 * @returns the string
 */
function randomString(next: () => number): string {
    const between = (low: number, high: number) => low + Math.floor(next() * (high - low));
    const characters = [
        () => String.fromCharCode(between(0x20, 0x7f)),
        () => String.fromCharCode(between(0x80, 0x800)),
        () => String.fromCharCode(between(0x800, 0xd800)),
        () => String.fromCodePoint(between(0x10000, 0x110000)),
        () => String.fromCharCode(between(0xd800, 0xe000)),
    ];

    // Mostly ASCII, as much text is, with every other kind of character equally likely.
    let value = '';
    for (let remaining = between(1, 201); remaining > 0; remaining--) {
        value += characters[next() < 0.6 ? 0 : between(1, characters.length)]();
    }
    return value;
}

test.concurrent('UTF-8 encoding of arbitrary strings agrees with TextEncoder', () => {
    const next = random(0x5eed);
    const reference = new TextEncoder();
    const encoder = string.initializeUtf8Encoder();

    // Stops at an arbitrary scalar boundary, as an encoder short of room would.
    let limit = 0;
    const truncating = {
        encodeInto: (input: string, destination: Uint8Array) =>
            reference.encodeInto(input, destination.subarray(0, limit)),
    };

    // One allocation at 8 holds any generated string, between guard bytes.
    const memory = { buffer: new ArrayBuffer(8 + 200 * 4 + 8) };
    const bytes = new Uint8Array(memory.buffer);
    let expected = new Uint8Array();
    const lowersExactly = (candidate: typeof truncating, value: string) => {
        bytes.fill(GUARD);
        const { ptr, len } = string.utf8Encode(candidate, value, () => 8, memory);
        return (
            ptr === 8 &&
            len === expected.length &&
            expected.every((byte, i) => bytes[ptr + i] === byte) &&
            bytes[ptr - 1] === GUARD &&
            bytes[ptr + len] === GUARD
        );
    };

    const failures: string[] = [];
    for (let i = 0; i < 30_000; i++) {
        const value = randomString(next);
        expected = reference.encode(value);
        limit = Math.floor(next() * (expected.length + 1));
        try {
            if (!lowersExactly(encoder, value) || !lowersExactly(truncating, value)) {
                failures.push(JSON.stringify(value));
            }
        } catch (error) {
            failures.push(`${JSON.stringify(value)}: ${String(error)}`);
        }
    }
    expect(failures.slice(0, 5)).toEqual([]);
});

test.concurrent.each([
    ['half of a surrogate pair read', '😀', { read: 1, written: 0 }],
    ['more read than the string holds', 'é', { read: 2, written: 2 }],
    ['fewer bytes than the characters read', 'éa', { read: 2, written: 2 }],
    ['more bytes than the characters read', 'aé', { read: 1, written: 2 }],
    ['more bytes than the allocation holds', 'é', { read: 1, written: 3 }],
    ['a negative count', 'é', { read: -1, written: 0 }],
    ['a fractional count', 'é', { read: 0, written: 0.5 }],
])('UTF-8 encoding rejects an encoder reporting %s', (_name, value, result) => {
    const memory = { buffer: new ArrayBuffer(16) };
    const bytes = new Uint8Array(memory.buffer).fill(GUARD);
    const { length } = new TextEncoder().encode(value);
    expect(() => string.utf8Encode({ encodeInto: () => result }, value, () => 4, memory)).toThrow(
        'failed to encode whole string',
    );
    expect(bytes.every((byte, i) => (i >= 4 && i < 4 + length) || byte === GUARD)).toBe(true);
});
