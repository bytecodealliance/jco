import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';

suite('Error Context (WASI P3)', () => {
    // NOTE: `high-*` components are the same component linked with all of its memory above 2GiB
    test.each(['async-error-context', 'high-async-error-context'])('%s', async (name) => {
        const { esModule, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name,
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncExports: ['local:local/run#run'],
                    },
                },
            },
        });

        const { WASIShim } = await import('@bytecodealliance/preview2-shim/instantiation');
        const instance = await esModule.instantiate(undefined, new WASIShim().getImportObject());

        const runFn = instance['jco:test-components/local-run-async'].run;
        assert.strictEqual(runFn instanceof AsyncFunction, true, 'run function should be async');

        await runFn();

        await cleanup();
    });
});
