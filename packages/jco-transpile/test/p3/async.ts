import { join } from 'node:path';

import { suite, test, assert, expect } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR, createReadableStreamFromValues, timeoutMs } from '../common.js';

suite('Async (WASI P3)', () => {
    // see: https://github.com/bytecodealliance/jco/issues/1076
    test.concurrent('incorrect task return params offloading', async () => {
        const name = 'async-flat-param-adder';
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
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
        const result = await instance.asyncAddS32.add(2, 2);
        assert.strictEqual(result, 4);

        await expect(() => instance.asyncAddS32.add(1, 2147483647)).rejects.toThrowError(/overflow/);

        await cleanup();
    });

    test.concurrent('lowered imports use trailing result pointer', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-lower-result-pointer.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/async-lower-result-pointer-host': {
                        addFive: async (a, b, c, d, e) => a + b + c + d + e,
                        getFlags: async () => ({ first: true, thirdFlag: true }),
                        getOutcome: async () => ({ tag: 'denied' }),
                    },
                    'jco:test-components/sync-lower-result-pointer-host': {
                        addPair: (a, b, c, d, e) => [a + b + c + d + e, a * b * c * d * e],
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            },
        });

        try {
            await instance['jco:test-components/local-run-async'].run();
        } finally {
            await cleanup();
        }
    });

    // https://github.com/bytecodealliance/jco/issues/1859
    test.concurrent('rejected async imports are not lowered as successful results', async () => {
        const inducedError = new Error('induced host rejection');
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-lower-result-pointer.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/async-lower-result-pointer-host': {
                        addFive: async () => 0,
                        getFlags: async () => ({}),
                        getOutcome: async () => {
                            throw inducedError;
                        },
                    },
                    'jco:test-components/sync-lower-result-pointer-host': {
                        addPair: () => [0, 0],
                    },
                },
            },
        });

        try {
            await expect(instance['jco:test-components/async-import-rejection-test'].run()).rejects.toBe(inducedError);
        } finally {
            await cleanup();
        }
    });

    // https://github.com/bytecodealliance/jco/issues/1860
    test.concurrent('async import result lowering errors reject the export', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-lower-result-pointer.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/async-lower-result-pointer-host': {
                        addFive: async () => 0,
                        getFlags: async () => ({}),
                        getOutcome: async () => ({ tag: 'invalid-outcome' }),
                    },
                    'jco:test-components/sync-lower-result-pointer-host': {
                        addPair: () => [0, 0],
                    },
                },
            },
        });

        try {
            const exportCall = instance['jco:test-components/async-import-rejection-test'].run();
            await expect(Promise.race([exportCall, timeoutMs(5_000, 'export call timed out')])).rejects.toThrow(
                /invalid-outcome/,
            );
        } finally {
            await cleanup();
        }
    });

    // https://bytecodealliance.zulipchat.com/#narrow/channel/206238-general/topic/Should.20StringLift.20be.20emitted.20for.20async.20return.20values.3F/with/561133720
    test.concurrent('simple async returns', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-simple-return.wasm'),
                imports: new WASIShim().getImportObject(),
            },
            // jco: {
            //     extraArgs: {
            //         minify: false
            //     }
            // }
        });

        assert.instanceOf(instance.getString, AsyncFunction);
        assert.strictEqual('Hello World!', await instance.getString());

        assert.instanceOf(instance.getU32, AsyncFunction);
        assert.strictEqual(42, await instance.getU32());

        assert.instanceOf(instance.getLayoutVariantAndU32, AsyncFunction);
        assert.deepEqual(await instance.getLayoutVariantAndU32(), [{ tag: 'empty' }, 42]);

        await cleanup();
    });

    // https://github.com/bytecodealliance/jco/issues/1150
    test.concurrent('simple bare async host imports', async () => {
        const hostStr = 'loaded-from-host';
        const hostU32 = 43;

        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-simple-import.wasm'),
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
                        asyncImports: ['load-string', 'load-u32'],
                        asyncExports: ['get-string', 'get-u32'],
                    },
                },
            },
        });

        assert.typeOf(instance.getString, 'function');
        assert.strictEqual(hostStr, await instance.getString());

        assert.typeOf(instance.getU32, 'function');
        assert.strictEqual(hostU32, await instance.getU32());

        await cleanup();
    });

    test.concurrent('async return of imported owned resource', async () => {
        class ExampleResource {
            constructor(id) {
                this.id = id;
            }
            getId() {
                return this.id;
            }
        }

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-return-imported-resource.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/resources': { ExampleResource },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncExports: ['jco:test-components/return-imported-resource-fns#get-resource-result'],
                    },
                },
            },
        });

        const exported = instance['jco:test-components/return-imported-resource-fns'];
        assert.instanceOf(exported.getResourceResult, AsyncFunction);

        const resource = await exported.getResourceResult(42);
        assert.instanceOf(resource, ExampleResource);
        assert.strictEqual(resource.getId(), 42);

        await cleanup();
    });

    test.concurrent('stream-taking method on imported host resource', async () => {
        class StreamSummer {
            async sumStream(rx) {
                let sum = 0;
                for await (const chunk of rx) {
                    for (const c of Array.isArray(chunk) ? chunk : [chunk]) {
                        for await (const value of c.data) {
                            if (typeof value === 'number') {
                                sum += value;
                            } else {
                                for (const b of value) {
                                    sum += b;
                                }
                            }
                        }
                    }
                }
                return sum;
            }
        }

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-resource-method.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/stream-resources': { StreamSummer },
                },
            },
        });

        const exported = instance['jco:test-components/stream-resource-method-fns'];
        assert.instanceOf(exported.sumViaResource, AsyncFunction);

        const sum = await exported.sumViaResource(
            createReadableStreamFromValues([
                { data: createReadableStreamFromValues(new Uint8Array([1, 2])) },
                { data: createReadableStreamFromValues(new Uint8Array([3, 4])) },
            ]),
        );
        assert.strictEqual(sum, 10);

        await cleanup();
    });

    test.concurrent('async return of bare imported owned resource', async () => {
        class ExampleResource {
            constructor(id) {
                this.id = id;
            }
            getId() {
                return this.id;
            }
        }

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-return-imported-resource.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/resources': { ExampleResource },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncExports: ['jco:test-components/return-imported-resource-fns#get-resource'],
                    },
                },
            },
        });

        const exported = instance['jco:test-components/return-imported-resource-fns'];
        assert.instanceOf(exported.getResource, AsyncFunction);

        const resource = await exported.getResource(7);
        assert.instanceOf(resource, ExampleResource);
        assert.strictEqual(resource.getId(), 7);

        await cleanup();
    });

    // https://github.com/bytecodealliance/jco/issues/1601
    test.concurrent('import of future-accepting host fn', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'pass-back-host-resolved-future.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    send: {
                        default: async (f) => {
                            const res = await f;
                            if (typeof res !== 'number') {
                                throw new Error('unexpected value in future, should be number');
                            }
                            return res;
                        },
                    },
                },
                jco: {
                    transpile: {
                        extraArgs: {
                            // minify: false,
                            asyncMode: 'jspi',
                            asyncImports: ['send'],
                        },
                    },
                },
            },
        });

        assert.instanceOf(instance['jco:test-components/local-run-async'].run, AsyncFunction);
        await instance['jco:test-components/local-run-async'].run();

        await cleanup();
    });
});
