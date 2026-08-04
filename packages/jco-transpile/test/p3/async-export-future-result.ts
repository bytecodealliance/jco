import { join } from 'node:path';

import { afterAll, assert, beforeAll, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

const EXPORT_NAME = 'jco:test-components/async-export-future-result-api';

suite('manual async export returning a future', () => {
    let instance;
    let cleanup;

    beforeAll(async () => {
        ({ instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-export-future-result.wasm'),
                imports: new WASIShim().getImportObject(),
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                        asyncExports: [`${EXPORT_NAME}#prove-future`, `${EXPORT_NAME}#prove-stream`],
                    },
                },
            },
        }));
    });

    afterAll(async () => {
        await cleanup?.();
    });

    test('sync func returning future has one public awaitable layer', async () => {
        const result = instance[EXPORT_NAME].proveFuture(40);
        assert.strictEqual(typeof result.then, 'function');
        assert.strictEqual(await result, 42);
    });

    test('native async func returning a scalar remains unchanged', async () => {
        assert.strictEqual(await instance[EXPORT_NAME].proveAsyncFunc(41), 42);
    });

    test('manual async func returning a stream remains unchanged', async () => {
        const stream = await instance[EXPORT_NAME].proveStream('test');
        assert.strictEqual(typeof stream[Symbol.asyncIterator], 'function');

        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(...chunk);
        }
        assert.deepStrictEqual(chunks, []);
    });
});
