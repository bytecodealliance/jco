import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

/**
 * Settle with `value`, or with `'timed out'` if that takes longer than `ms`.
 *
 * @param value - the promise to wait for
 * @param ms - how long to wait
 * @returns the outcome
 */
function within<T>(value: Promise<T>, ms: number): Promise<T | 'timed out'> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timed out'>((resolve) => {
        timer = setTimeout(() => resolve('timed out'), ms);
    });
    return Promise.race([value, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Describe how a call ended.
 *
 * @param call - the call
 * @returns `'returned'`, or the error it failed with
 */
async function outcome(call: () => unknown): Promise<unknown> {
    try {
        await call();
        return 'returned';
    } catch (err) {
        return err;
    }
}

suite('sync start lowering trap', () => {
    test.concurrent('a trap while lowering the arguments releases what the entered callee took', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'sync-start-lowering-trap',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'sync-start-lowering-trap.wat'),
            },
        });
        try {
            const run = await within(
                outcome(() => instance.run()),
                2_000,
            );
            assert.instanceOf(run, WebAssembly.RuntimeError);
            assert.match((run as Error).message, /unreachable/);
            // (whether `ping` then runs or traps, it does not wait for a lock nobody holds)
            assert.notStrictEqual(
                await within(
                    outcome(() => instance.ping()),
                    2_000,
                ),
                'timed out',
            );
        } finally {
            await cleanup();
        }
    });
});
