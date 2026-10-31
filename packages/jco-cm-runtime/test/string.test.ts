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

test.concurrent('character validation preserves inline coercion and errors', () => {
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
    expect(s.validateHostChar('🚀x')).toBe(0x1f680);
    expect(s.validateHostChar('\ud800')).toBe(0xd800);
    expect(s.validateHostChar('')).toBeUndefined();
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
