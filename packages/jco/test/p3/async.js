import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../helpers.js';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';

suite('Async (WASI P3)', () => {
    // see: https://github.com/bytecodealliance/jco/issues/1076
    test('incorrect task return params offloading', async () => {
        const componentPath = join(
            P3_COMPONENT_FIXTURES_DIR,
            'async-flat-param-adder.wasm'
        );

        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'async-flat-param-adder',
                path: componentPath,
                imports: new WASIShim().getImportObject(),
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                    }
                }
            }
        });

        assert(instance.test3);
        assert.typeOf(instance.test3.asyncTest4, 'function');

        const result = await instance.test3.asyncTest4(2,2);
        assert.strictEqual(result, 4);

        await cleanup();
    });
});
