import { join } from 'node:path';

import { assert, expect, suite, test, vi } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

suite.skipIf(typeof WebAssembly.Suspending !== 'function')('cooperative threading regressions', () => {
    test.each([
        { name: 'return-suspend', behavior: 'publishes a returned result when its thread suspends' },
        { name: 'keeper', behavior: 'lets a worker resolve a task after the implicit thread exits' },
        { name: 'two-waits', behavior: 'lets two threads of the same task wait on events' },
    ])('$behavior', async ({ name }) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'cooperative-threading', `${name}.wat`),
            },
        });
        try {
            assert.strictEqual(await instance.run(), 42);
        } finally {
            await cleanup();
        }
    });

    test.each([
        { name: 'wrong-type', error: /start function type mismatch/ },
        { name: 'wrong-param', error: /start function type mismatch/ },
        { name: 'bad-promote', error: /invalid thread handle/ },
        { name: 'bad-suspend-promote', error: /invalid thread handle/ },
        { name: 'deadlock', error: /deadlock/ },
        { name: 'unresolved-worker', error: /exited without resolution/ },
    ])('$name traps', async ({ name, error }) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'cooperative-threading', `${name}.wat`),
            },
        });
        try {
            await expect(Promise.resolve().then(() => instance.run())).rejects.toThrow(error);
        } finally {
            await cleanup();
        }
    });

    test('a spawned Wasm trap poisons its instance after task.return', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'raw-trap',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'cooperative-threading', 'raw-trap.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.run(), 42);
            // Wait for the detached worker to execute before checking reentry.
            await vi.waitFor(() => {
                assert.throws(() => instance.check(), WebAssembly.RuntimeError, /cannot enter component instance/);
            });
        } finally {
            await cleanup();
        }
    });
});
