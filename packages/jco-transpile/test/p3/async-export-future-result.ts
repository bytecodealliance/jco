/** Check future result layering and lazy consumption with the shared Rust export fixture. */
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { afterAll, assert, beforeAll, suite, test } from 'vitest';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

const EXPORT_NAME = 'jco:test-components/async-export-future-result-api';

suite('manual async export returning a future', () => {
    let esModule;
    let cleanup;

    beforeAll(async () => {
        ({ esModule, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-export-future-result.wasm'),
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                        callTracking: true,
                        asyncExports: [`${EXPORT_NAME}#prove-future`, `${EXPORT_NAME}#prove-stream`],
                    },
                },
            },
        }));
    });

    afterAll(async () => {
        await cleanup?.();
    });

    test.concurrent('sync func returning future has one public awaitable layer', async () => {
        const instance = await esModule.instantiate(undefined, new WASIShim().getImportObject());
        const result = instance[EXPORT_NAME].proveFuture(40);
        assert.strictEqual(typeof result.then, 'function');
        assert.strictEqual(await result, 42);
    });

    test.concurrent('native async func returning a scalar remains unchanged', async () => {
        const instance = await esModule.instantiate(undefined, new WASIShim().getImportObject());
        assert.strictEqual(await instance[EXPORT_NAME].proveAsyncFunc(41), 42);
    });

    test.concurrent('manual async func returning a stream remains unchanged', async () => {
        const instance = await esModule.instantiate(undefined, new WASIShim().getImportObject());
        const stream = await instance[EXPORT_NAME].proveStream('test');
        assert.strictEqual(typeof stream[Symbol.asyncIterator], 'function');

        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(...chunk);
        }
        assert.deepStrictEqual(chunks, []);
    });
});

suite('native exports leave returned futures unread', () => {
    let esModule;
    let cleanup;

    beforeAll(async () => {
        ({ esModule, cleanup } = await setupAsyncTest({
            jco: { transpile: { extraArgs: { callTracking: true } } },
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-export-future-result.wasm'),
                skipInstantiation: true,
            },
        }));
    });

    afterAll(async () => {
        await cleanup?.();
    });

    test.concurrent('tracking starts an async invocation without reading its future result', async () => {
        const instance = await esModule.instantiate(undefined, new WASIShim().getImportObject());
        try {
            const api = instance[EXPORT_NAME];
            const call = instance._util.calls.start(api.proveFutureAsync, 40);
            let finished = false;
            call.finished.then(() => {
                finished = true;
            });
            await setTimeout(20);
            assert.strictEqual(api.completedFutureWrites(), 0);
            assert.isFalse(finished);
            const future = await call.result;
            assert.strictEqual(api.completedFutureWrites(), 0);
            assert.strictEqual(await future, 42);
            assert.deepEqual(await call.finished, { status: 'completed' });
        } finally {
            instance._util.stop();
        }
    });

    test.concurrent.for(['sync', 'async'])(
        '%s export keeps its writer pending until a read',
        async (mode, { expect }) => {
            // Each test owns its guest task and write counter.
            const instance = await esModule.instantiate(undefined, new WASIShim().getImportObject());
            const api = instance[EXPORT_NAME];
            let future;
            if (mode === 'sync') {
                await api.prepareFuture(40);
                future = api.takeFuture();
            } else {
                future = await api.proveFutureAsync(40);
            }

            // Allow export completion handlers to run without requesting the future's value.
            await setTimeout(20);
            assert.strictEqual(api.completedFutureWrites(), 0);

            // Reading completes the rendezvous and preserves the exported value.
            assert.strictEqual(await future, 42);
            await expect.poll(() => api.completedFutureWrites()).toBe(1);
        },
    );
});
