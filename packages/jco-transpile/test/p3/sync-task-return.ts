import { join } from 'node:path';

import { assert, expect, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

suite('task.return requires an asynchronous canonical lift', () => {
    test.concurrent.each([false, true])('sync lift traps before continuing (JSPI wrapper: %s)', async (jspi) => {
        let continued = false;
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: jspi ? 'jspi' : undefined,
            component: {
                name: `sync-task-return-${jspi}`,
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'sync-task-return.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    continued: {
                        default: () => {
                            continued = true;
                        },
                    },
                },
            },
            jco: { transpile: { extraArgs: { asyncExports: jspi ? ['invalid-run', 'valid-run'] : [] } } },
        });
        try {
            const validResult = instance.validRun();
            assert.strictEqual(validResult instanceof Promise, jspi);
            assert.strictEqual(await validResult, 42);
            assert.strictEqual(await instance.asyncRun(), 42);
            await expect(Promise.resolve().then(() => instance.invalidRun())).rejects.toBeInstanceOf(
                WebAssembly.RuntimeError,
            );
            assert.isFalse(continued, 'guest must not continue after an invalid task.return');
        } finally {
            await cleanup();
        }
    });
});
