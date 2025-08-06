import { join } from 'node:path';

import { fileURLToPath } from 'url';
import { suite, test, assert } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction } from '../common.js';

const COMPONENT_FIXTURES_DIR = fileURLToPath(
    new URL('../fixtures/components', import.meta.url)
);

suite('Transpile (WASI P3)', () => {
    test('async-error-context', async () => {
        const componentPath = join(
            COMPONENT_FIXTURES_DIR,
            'async-error-context.component.wasm'
        );

        const { esModule, cleanup } = await setupAsyncTest({
            component: {
                name: 'async-error-context',
                path: componentPath,
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

        const { WASIShim } = await import(
            '@bytecodealliance/preview2-shim/instantiation'
        );
        const instance = await esModule.instantiate(
            undefined,
            new WASIShim().getImportObject()
        );

        const runFn = instance['local:local/run'].asyncRun;
        assert.strictEqual(
            runFn instanceof AsyncFunction,
            true,
            'local:local/run should be async'
        );

        await runFn();

        await cleanup();
    });
});
