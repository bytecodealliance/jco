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
    { value: '', utf8: [], utf16: [] },
    { value: 'aé中', utf8: [0x61, 0xc3, 0xa9, 0xe4, 0xb8, 0xad], utf16: [0x61, 0, 0xe9, 0, 0x2d, 0x4e] },
    { value: '🚀', utf8: [0xf0, 0x9f, 0x9a, 0x80], utf16: [0x3d, 0xd8, 0x80, 0xde] },
    { value: '\ufeff', utf8: [0xef, 0xbb, 0xbf], utf16: [0xff, 0xfe] },
    {
        value: '\ud800x\udc00',
        utf8: [0xef, 0xbf, 0xbd, 0x78, 0xef, 0xbf, 0xbd],
        utf16: [0xfd, 0xff, 0x78, 0, 0xfd, 0xff],
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
    expect(string.utf8Encode(encoder, 'é', () => 0, memory)).toEqual({ ptr: 0, len: 2 });
});

test.concurrent.each(['', 'ascii', '😀𝄞', '\ud800x\udc00', 'a😀\ud800é'.repeat(256)])(
    'UTF-16 encoding repairs surrogates and returns only where it wrote: %j',
    async (value) => {
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 3 });
        const context = string.initializeUtf16Encoding();
        const realloc = () => {
            memory.grow(1);
            return 65536;
        };
        const encoded = string.utf16Encode(context, value, realloc, memory);
        expect(encoded).toEqual({ ptr: 65536, len: value.length });
        expect(new TextDecoder('utf-16le').decode(new Uint8Array(memory.buffer, encoded.ptr, encoded.len * 2))).toBe(
            value.toWellFormed(),
        );
        const asynchronous = await string.utf16EncodeAsync(context, value, async () => realloc(), memory);
        expect(asynchronous).toEqual(encoded);
    },
);

test.concurrent.each(['ascii', 'é', '😀', '\ud800x\udc00', '\ufeff'])(
    'optimized UTF-8 agrees with the portable codec: %j',
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
        expect(encoded).toEqual({ ptr: 65536, len: expected.length });
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

// Lengths on both sides of where sizing and writing switch to Node's primitives.
const UTF8_LENGTHS = [1, 2, 31, 32, 33, 255, 256, 257, 1024];

test.concurrent.each(UTF8_LENGTHS)('UTF-8 sizes ASCII of %i code units as it is', (length) => {
    const value = 'abcdefghij'.repeat(Math.ceil(length / 10)).slice(0, length);
    const memory = { buffer: new ArrayBuffer(2048) };
    const calls: number[][] = [];
    const encoded = string.utf8Encode(
        string.initializeUtf8Encoder(),
        value,
        (...args) => {
            calls.push(args);
            return 16;
        },
        memory,
    );
    expect(calls).toEqual([[0, 0, 1, length]]);
    expect(encoded).toEqual({ ptr: 16, len: length });
    expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 16, length))).toBe(value);
});

test.concurrent.each(['é', '中', '😀', '\ud800', '\udc00', '\udc00\ud800', '\ud83d'])(
    'UTF-8 sizes %j anywhere in ASCII as the portable codec encodes it',
    (unit) => {
        const encoder = string.initializeUtf8Encoder();
        for (const length of UTF8_LENGTHS) {
            // At the start, in the middle, and at the end, where a high surrogate has
            // nothing to pair with.
            const indices = [0, 1, 31, length >> 1, length - unit.length].filter(
                (index) => index >= 0 && index + unit.length <= length,
            );
            for (const index of new Set(indices)) {
                const value = 'a'.repeat(index) + unit + 'a'.repeat(length - index - unit.length);
                const expected = new TextEncoder().encode(value);
                const memory = { buffer: new ArrayBuffer(expected.length + 16) };
                const calls: number[][] = [];
                const encoded = string.utf8Encode(
                    encoder,
                    value,
                    (...args) => {
                        calls.push(args);
                        return 16;
                    },
                    memory,
                );
                expect(calls).toEqual([[0, 0, 1, expected.length]]);
                expect(encoded).toEqual({ ptr: 16, len: expected.length });
                expect(new Uint8Array(memory.buffer, 16, expected.length)).toEqual(expected);
            }
        }
    },
);

/**
 * Run a function while counting the calls to `Buffer.byteLength`, which may be replaced.
 *
 * @param run - Receives a function that returns the number of calls so far.
 * @param replacement - What `Buffer.byteLength` returns instead of its own result.
 */
function withCountedByteLength(run: (calls: () => number) => void, replacement?: (size: number) => number): void {
    const original = Buffer.byteLength;
    let calls = 0;
    Buffer.byteLength = ((...args: Parameters<typeof original>) => {
        calls++;
        const size = original(...args);
        return replacement ? replacement(size) : size;
    }) as typeof original;
    try {
        run(() => calls);
    } finally {
        Buffer.byteLength = original;
    }
}

test('UTF-8 sizing asks Node only for the unmodified default encoder', () => {
    const value = 'a'.repeat(64);
    const memory = { buffer: new ArrayBuffer(80) };
    withCountedByteLength((calls) => {
        const encoder = string.initializeUtf8Encoder();
        const initial = calls();
        expect(string.utf8Encode(encoder, value, () => 0, memory).len).toBe(64);
        expect(calls()).toBe(initial + 1);

        // Any long string is sized by the native call, and no short one.
        expect(string.utf8Encode(encoder, '中é'.repeat(16), () => 0, memory).len).toBe(80);
        expect(calls()).toBe(initial + 2);
        expect(string.utf8Encode(encoder, 'a'.repeat(31), () => 0, memory).len).toBe(31);
        expect(calls()).toBe(initial + 2);

        const encodeInto = encoder.encodeInto.bind(encoder);
        Object.defineProperty(encoder, 'encodeInto', {
            value: (input: string, output: Uint8Array) => encodeInto(input.toUpperCase(), output),
        });
        expect(string.utf8Encode(encoder, value, () => 0, memory).len).toBe(64);
        expect(calls()).toBe(initial + 2);
        expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 0, 64))).toBe(value.toUpperCase());

        string.utf8Encode(new TextEncoder(), value, () => 0, memory);
        expect(calls()).toBe(initial + 2);
    });
});

test('UTF-8 sizing does not ask a host that sizes unpaired surrogates differently', () => {
    const value = 'a\ud800'.repeat(32);
    const expected = new TextEncoder().encode(value);
    const memory = { buffer: new ArrayBuffer(expected.length) };
    withCountedByteLength(
        (calls) => {
            const encoder = string.initializeUtf8Encoder();
            const initial = calls();
            expect(string.utf8Encode(encoder, value, () => 0, memory)).toEqual({ ptr: 0, len: expected.length });
            expect(calls()).toBe(initial);
            expect(new Uint8Array(memory.buffer)).toEqual(expected);
        },
        (size) => size - 1,
    );
});

/**
 * A generator of pseudorandom numbers in [0, 1) that is the same on every run.
 *
 * @param seed - Nonzero 32-bit state to start from.
 */
function xorshift(seed: number): () => number {
    return () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        seed >>>= 0;
        return seed / 0x100000000;
    };
}

test('UTF-8 encoding of random strings is what TextEncoder produces', () => {
    const random = xorshift(0x9e3779b9);
    const int = (bound: number) => Math.floor(random() * bound);
    // ASCII, two and three byte characters, pairs, and either half of a pair alone.
    const units = [
        () => String.fromCharCode(0x20 + int(0x5f)),
        () => String.fromCharCode(0x80 + int(0x780)),
        () => String.fromCharCode(0x800 + int(0xd000)),
        () => String.fromCodePoint(0x10000 + int(0x100000)),
        () => String.fromCharCode(0xd800 + int(0x400)),
        () => String.fromCharCode(0xdc00 + int(0x400)),
    ];
    const mixes = [[0], [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5], [0, 3, 4, 5]];
    const reference = new TextEncoder();
    const encoder = string.initializeUtf8Encoder();
    const memory = { buffer: new ArrayBuffer(4096) };
    const bytes = new Uint8Array(memory.buffer);
    const wrong: string[] = [];
    let unpaired = 0;

    for (let round = 0; round < 20000; round++) {
        // Lengths lie around where sizing and writing change, or anywhere below 600.
        const length = [int(80), 28 + int(9), 252 + int(9), int(600)][int(4)];
        const mix = mixes[int(mixes.length)];
        let value = '';
        while (value.length < length) {
            value += units[mix[int(mix.length)]]();
        }
        // A cut may split a pair, which leaves half of it at the end.
        value = value.slice(0, length);
        if (value.length === 0) {
            continue;
        }
        unpaired += Number(!value.isWellFormed());

        const expected = reference.encode(value);
        const sizes: number[] = [];
        const realloc = (_ptr: number, _oldSize: number, _align: number, size: number) => {
            sizes.push(size);
            return 16;
        };
        bytes.fill(0xaa, 0, expected.length + 32);

        // `encodeInto` itself stops short of some strings that hold an unpaired surrogate
        // when its destination has exactly their size, and only those fail to encode.
        const whole = reference.encodeInto(value, new Uint8Array(expected.length)).read === value.length;
        let correct: boolean;
        try {
            const encoded = string.utf8Encode(encoder, value, realloc, memory);
            correct =
                whole &&
                encoded.ptr === 16 &&
                encoded.len === expected.length &&
                bytes.subarray(16, 16 + expected.length).every((byte, index) => byte === expected[index]) &&
                bytes[15] === 0xaa &&
                bytes[16 + expected.length] === 0xaa;
        } catch (error) {
            correct = !whole && !value.isWellFormed() && (error as Error).message === 'failed to encode whole string';
        }
        if (!correct || sizes.length !== 1 || sizes[0] !== expected.length) {
            wrong.push(JSON.stringify(value));
        }
    }
    expect(wrong).toEqual([]);
    expect(unpaired).toBeGreaterThan(5000);
});
