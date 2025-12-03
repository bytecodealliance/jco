import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../helpers.js';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';

suite('Async (WASI P3)', () => {
    // see: https://github.com/bytecodealliance/jco/issues/1076
    test.skip('incorrect task return params offloading', async () => {
        const name = 'async-flat-param-adder';
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(
                    P3_COMPONENT_FIXTURES_DIR,
                    `${name}.wasm`,
                ),
                imports: new WASIShim().getImportObject(),
            },
        });

        assert(instance.test3);
        assert.typeOf(instance.test3.asyncTest4, 'function');

        const result = await instance.test3.asyncTest4(2,2);
        assert.strictEqual(result, 4);

        await cleanup();
    });

    // https://bytecodealliance.zulipchat.com/#narrow/channel/206238-general/topic/Should.20StringLift.20be.20emitted.20for.20async.20return.20values.3F/with/561133720
    test.skip('simple async returns', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(
                    P3_COMPONENT_FIXTURES_DIR,
                    'async-simple-return.wasm',
                ),
                imports: new WASIShim().getImportObject(),
            },
        });

        assert.typeOf(instance.asyncGetString, 'function');
        assert.strictEqual("literal", await instance.asyncGetString());

        assert.typeOf(instance.asyncGetU32, 'function');
        assert.strictEqual(42, await instance.asyncGetU32());

        await cleanup();
    });

    // https://github.com/bytecodealliance/jco/issues/1150
    test('simple async imports', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(
                    P3_COMPONENT_FIXTURES_DIR,
                    'async-simple-import.wasm',
                ),
                imports: {
                    ...new WASIShim().getImportObject(),
                    loadString: async () => "loaded",
                    loadU32: async () => 43,
                },
            },
        });

        assert.typeOf(instance.asyncGetString, 'function');
        assert.strictEqual("loaded", await instance.asyncGetString());

        assert.typeOf(instance.asyncGetU32, 'function');
        assert.strictEqual(43, await instance.asyncGetU32());

        await cleanup();
    });
});
