import { expect, test } from 'vitest';
import { encodeSyncUtf8 } from '../src/intrinsics/sync-utf8.js';
import type { StringEncodeInto } from '../src/runtime.js';

const codec = new TextEncoder();
const context = (encoder: StringEncodeInto = codec): Parameters<typeof encodeSyncUtf8>[0] => ({ encoder, busy: false });

test.each([
    'x'.repeat(255),
    'x'.repeat(256),
    'x'.repeat(262144),
    'x'.repeat(262145),
    'é漢😀'.repeat(2048),
    '\ud800x\udc00'.repeat(512),
    '漢'.repeat(100000),
])('copies the complete UTF-8 result into one exact allocation (%#)', (input) => {
    const state = context();
    const expected = codec.encode(input);
    const memory = new WebAssembly.Memory({ initial: 1 });
    const sizes: number[] = [];
    const result = encodeSyncUtf8(
        state,
        input,
        (old, oldSize, align, size) => {
            expect([old, oldSize, align]).toEqual([0, 0, 1]);
            sizes.push(size);
            memory.grow(Math.ceil(size / 65536));
            return 65536;
        },
        memory,
    );
    expect(sizes).toEqual([expected.length]);
    expect(result.len).toBe(expected.length);
    expect(Buffer.from(memory.buffer, result.ptr, result.len).equals(expected)).toBe(true);
    expect(state.bytes?.length ?? 0).toBeLessThanOrEqual(262144);
});

test('keeps outer bytes intact during nested allocation and releases the buffer after errors', () => {
    const state = context();
    const memory = new WebAssembly.Memory({ initial: 1 });
    const outer = 'a😀'.repeat(400);
    const inner = '漢b'.repeat(400);
    const nested = () => encodeSyncUtf8(state, inner, () => 4096, memory);
    const result = encodeSyncUtf8(
        state,
        outer,
        () => {
            const inside = nested();
            expect(Buffer.from(memory.buffer, inside.ptr, inside.len).equals(codec.encode(inner))).toBe(true);
            return 0;
        },
        memory,
    );
    expect(Buffer.from(memory.buffer, result.ptr, result.len).equals(codec.encode(outer))).toBe(true);
    expect(() =>
        encodeSyncUtf8(
            state,
            outer,
            () => {
                throw Error('allocation failed');
            },
            memory,
        ),
    ).toThrow('allocation failed');
    expect(state.busy).toBe(false);
    expect(nested().len).toBe(codec.encode(inner).length);
});

test('completes an encoder short write and allocates guest memory once', () => {
    const state = context({
        encodeInto(input, bytes) {
            return codec.encodeInto(input.slice(0, 20), bytes);
        },
    });
    const memory = new WebAssembly.Memory({ initial: 1 });
    const input = 'a'.repeat(300) + 'é';
    const sizes: number[] = [];
    const result = encodeSyncUtf8(
        state,
        input,
        (_old, _size, _align, bytes) => {
            sizes.push(bytes);
            return 8;
        },
        memory,
    );
    expect(sizes).toEqual([codec.encode(input).length]);
    expect(Buffer.from(memory.buffer, result.ptr, result.len).equals(codec.encode(input))).toBe(true);
});
