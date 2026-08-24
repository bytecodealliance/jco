import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { transpileBytes } from '../src/index.js';
import { componentEmbed, componentNew } from '../src/wasm-tools.js';
import { setupAsyncTest } from './helpers.js';
import { LOCAL_TEST_COMPONENTS_DIR } from './common.js';

suite('resources', () => {
    // Ensure trampoline code is called on external object with relevant `this`.
    // see: https://github.com/bytecodealliance/jco/issues/1313
    test('simple imported resource call', async () => {
        const disposeSymbol = Symbol.dispose || Symbol.for('dispose');
        let disposed = 0;

        class IncrementingExampleResource {
            private id: number;

            constructor(id: number) {
                this.id = id;
            }

            getId() {
                this.id += 1;
                return this.id;
            }

            [disposeSymbol]() {
                disposed += 1;
            }
        }

        const name = 'resource-incrementing-id';
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/resources': { ExampleResource: IncrementingExampleResource },
                },
            },
            // jco: {
            //     transpile: {
            //         extraArgs: {
            //             minify: false,
            //         },
            //     },
            // },
        });

        instance['jco:test-components/local-run'].run();
        assert.strictEqual(disposed, 1, 'dropping the guest-owned import should dispose the host resource once');

        await cleanup();
    });

    test('component-defined resource disposal uses the removed handle representation', async () => {
        const fixture = fileURLToPath(
            new URL('./fixtures/components/runtime/resources.2.component.wat', import.meta.url),
        );
        const { files } = await transpileBytes(await readFile(fixture), {
            name: 'resource-disposal',
            minify: false,
        });
        const source = new TextDecoder().decode(files['resource-disposal.js']);

        assert.match(
            source,
            /const handleEntry = rscTableRemove\(handleTable\d+, handle\d+\);[\s\S]{0,300}?\['0'\]\(handleEntry\.rep\);/,
            'explicit disposal should call the destructor with the representation returned while removing the handle',
        );
        assert.notMatch(
            source,
            /rscTableRemove\(handleTable\d+, handle\d+\);[\s\S]{0,300}?handleTable\d+\[\(handle\d+ << 1\) \+ 1\]/,
            'explicit disposal must not read a representation from a removed handle-table entry',
        );
        assert.notMatch(
            source,
            /callResourceDestructor/,
            'a component without context intrinsics should retain lightweight destructor calls',
        );
    });

    test('component-defined resource without a destructor still releases its handle', async () => {
        const component = await componentNew(
            await componentEmbed({
                dummy: true,
                witSource: `
                    package test:resource-disposal;

                    interface resources {
                        resource no-destructor {
                            constructor();
                        }
                    }

                    world test {
                        export resources;
                    }
                `,
            }),
        );
        const { files } = await transpileBytes(component, {
            name: 'resource-without-destructor',
            minify: false,
        });
        const source = new TextDecoder().decode(files['resource-without-destructor.js']);

        assert.match(
            source,
            /Object\.defineProperty\(rsc\d+, symbolDispose,[\s\S]*?const handleEntry = rscTableRemove\(handleTable\d+, handle\d+\);[\s\S]*?symbolRscHandle\] = undefined;/,
            'explicit disposal should release and invalidate an owned handle even without a guest destructor',
        );
    });
});
