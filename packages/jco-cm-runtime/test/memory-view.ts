import { expect, test } from 'vitest';
import { liftFlatS32 } from '../src/intrinsics/lift.js';
import { lowerFlatS32 } from '../src/intrinsics/lower.js';
import type { TaskLiftContext, TaskLowerContext } from '../src/runtime.js';

test.concurrent.each([false, true])('scalar views follow growing and replaced memory (shared=%s)', (shared) => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 3, shared });
    const read: TaskLiftContext = { componentIdx: 0, params: [], memory, storagePtr: 0 };
    const write: TaskLowerContext = { componentIdx: 0, vals: [17], memory, storagePtr: 0 };
    lowerFlatS32({ strict: false }, write);
    expect(liftFlatS32(read)[0]).toBe(17);
    memory.grow(1);
    read.storagePtr = write.storagePtr = 65536;
    write.vals[0] = 42;
    lowerFlatS32({ strict: false }, write);
    expect(liftFlatS32(read)[0]).toBe(42);
    read.memory = write.memory = new WebAssembly.Memory({ initial: 1 });
    read.storagePtr = write.storagePtr = 0;
    write.vals[0] = -7;
    lowerFlatS32({ strict: false }, write);
    expect(liftFlatS32(read)[0]).toBe(-7);
    expect(new DataView(memory.buffer).getInt32(65536, true)).toBe(42);
    read.storagePtr = read.memory.buffer.byteLength;
    expect(() => liftFlatS32(read)).toThrow(RangeError);
});
