import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

/**
 * Settle with the error a call failed with, or its result.
 *
 * @param call - the call
 * @returns the error, or the call's result
 */
async function settled(call: () => Promise<unknown>): Promise<unknown> {
    try {
        return await call();
    } catch (err) {
        return err;
    }
}

// Canonical ABI `canon_task_return`: `task.return` traps unless it names the
// memory of the lift it returns from, compared as a memory instance.
// A `task.return` naming no memory is accepted, as the component-model tests
// (`async/big-interleaving-test.wast`) expect.
suite('task.return memory', () => {
    test.concurrent.each([
        { fn: 'alias', traps: false },
        { fn: 'lowerThenReturn', traps: false },
        { fn: 'omittedMemory', traps: false },
        { fn: 'unliftedMemory', traps: true },
        { fn: 'callAlias', traps: false },
        { fn: 'callLowerThenReturn', traps: false },
        { fn: 'callOmittedMemory', traps: false },
        { fn: 'callUnliftedMemory', traps: true },
    ])('$fn', async ({ fn, traps }) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: `task-return-memory-${fn}`,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'task-return-memory.wat'),
                imports: { ping: { default: () => {} } },
            },
        });
        try {
            const result = await settled(() => (instance[fn] as () => Promise<number>)());
            if (traps) {
                assert.instanceOf(result, WebAssembly.RuntimeError);
                assert.match((result as Error).message, /task\.return memory does not match the lift/);
            } else {
                assert.strictEqual(result, 42);
            }
        } finally {
            await cleanup();
        }
    });
});
