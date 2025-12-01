import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../helpers.js';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';

suite('Async (WASI P3)', () => {
    // see: https://github.com/bytecodealliance/jco/issues/1076
    test('incorrect task return params offloading', async () => {
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
    test('simple string return', async () => {
        const name = 'async-simple-string-return';
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

        assert.typeOf(instance.asyncGetLiteral, 'function');

        const result = await instance.asyncGetLiteral();
        assert.strictEqual(result, "literal");

        await cleanup();
    });
});
