import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';

suite('Async (WASI P3)', () => {
    // see: https://github.com/bytecodealliance/jco/issues/1076
    test('incorrect task return params offloading', async () => {
        const name = 'async-flat-param-adder';
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(
                    LOCAL_TEST_COMPONENTS_DIR,
                    `${name}.wasm`,
                ),
                imports: new WASIShim().getImportObject(),
            },
            // jco: {
            //     transpile: {
            //         extraArgs: {
            //             minify: false,
            //         },
            //     },
            // },
        });

        assert(instance.asyncAddS32);
        assert.instanceOf(instance.asyncAddS32.add, AsyncFunction);
        const result = await instance.asyncAddS32.add(2,2);
        assert.strictEqual(result, 4);

        // TODO(fix): this line should throw the value, not return a result object,
        // this behavior does not match the default for non-erroring call
        const res = await instance.asyncAddS32.add(1,2147483647);
        assert.deepStrictEqual(res, {tag: 'error', val: 'overflow'});

        await cleanup();
    });

    // https://bytecodealliance.zulipchat.com/#narrow/channel/206238-general/topic/Should.20StringLift.20be.20emitted.20for.20async.20return.20values.3F/with/561133720
    test('simple async returns', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(
                    LOCAL_TEST_COMPONENTS_DIR,
                    'async-simple-return.wasm',
                ),
                imports: new WASIShim().getImportObject(),
            },
        });

        assert.instanceOf(instance.getString, AsyncFunction);
        assert.strictEqual("Hello World!", await instance.getString());

        assert.instanceOf(instance.getU32, AsyncFunction);
        assert.strictEqual(42, await instance.getU32());

        await cleanup();
    });

    // https://github.com/bytecodealliance/jco/issues/1150
    test('simple bare async host imports', async () => {
        const hostStr = "loaded-from-host";
        const hostU32 = 43;

        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(
                    LOCAL_TEST_COMPONENTS_DIR,
                    'async-simple-import.wasm',
                ),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'load-string': { default: async () => hostStr },
                    'load-u32': { default: async () => hostU32 },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        // minify: false,
                        asyncMode: 'jspi',
                        asyncImports: [
                            'load-string',
                            'load-u32',
                        ],
                        asyncExports: [
                            'get-string',
                            'get-u32',
                        ],
                    }
                }
            }
        });

        assert.typeOf(instance.getString, 'function');
        assert.strictEqual(hostStr, await instance.getString());

        assert.typeOf(instance.getU32, 'function');
        assert.strictEqual(hostU32, await instance.getU32());

        await cleanup();
    });
});
