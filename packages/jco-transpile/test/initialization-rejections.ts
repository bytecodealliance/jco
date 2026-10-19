import { setImmediate as nextTurn } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';

import { createCoreLoader, createFetchLoader, withLoadingFixture } from './helpers.js';

const componentPath = fileURLToPath(
    new URL('./fixtures/components/runtime/waitable-set-wait-unused.component.wat', import.meta.url),
);

suite.skipIf(typeof WebAssembly.Suspending !== 'function')('initialization rejection handling', () => {
    suite('explicit instantiate()', () => {
        test.concurrent('handles an outstanding core rejection after a later loader throws synchronously', async () => {
            await withLoadingFixture(
                componentPath,
                'later-loader-throw',
                'async',
                createCoreLoader,
                async (fixture, loader, observe) => {
                    const [firstCorePath, secondCorePath] = fixture.corePaths;
                    const component = await fixture.import();
                    const firstCoreLoad = loader.defer(firstCorePath);
                    const loaderError = new Error('Second core loader threw synchronously');
                    const coreError = new Error('First core rejected after the loader threw');
                    const getCoreModule = (path: string) => {
                        const module = loader.getCoreModule(path);
                        if (path === secondCorePath) {
                            throw loaderError;
                        }
                        return module;
                    };

                    const initializationError = observe(() => component.instantiate(getCoreModule, {}));
                    assert.strictEqual(await initializationError, loaderError);
                    assert.deepEqual(loader.requested, fixture.corePaths);

                    firstCoreLoad.reject(coreError);
                    await nextTurn();
                },
            );
        });

        test.concurrent('handles a core rejection while helper loading is pending', async () => {
            await withLoadingFixture(
                componentPath,
                'core-while-helper-pending',
                'async',
                createCoreLoader,
                async (fixture, loader, observe) => {
                    const [firstCorePath] = fixture.corePaths;
                    const component = await fixture.import();
                    const coreLoad = loader.defer(firstCorePath);
                    const helperPath = fixture.helperPath!;
                    const helperLoad = loader.defer(helperPath);
                    const coreError = new Error('Core loading failed while helper loading was pending');

                    const initializationError = observe(() => component.instantiate(loader.getCoreModule, {}));
                    assert.include(loader.requested, firstCorePath);
                    assert.include(loader.requested, helperPath);
                    coreLoad.reject(coreError);

                    // Keep the helper pending through the runtime's rejection checkpoint.
                    await nextTurn();

                    helperLoad.resolve(fixture.modules.get(helperPath)!);
                    assert.strictEqual(await initializationError, coreError);
                },
            );
        });

        test.concurrent('handles an outstanding core rejection after helper loading fails', async () => {
            await withLoadingFixture(
                componentPath,
                'core-after-helper-failure',
                'async',
                createCoreLoader,
                async (fixture, loader, observe) => {
                    const [firstCorePath] = fixture.corePaths;
                    const component = await fixture.import();
                    const coreLoad = loader.defer(firstCorePath);
                    const helperPath = fixture.helperPath!;
                    const helperLoad = loader.defer(helperPath);
                    const helperError = new Error('Helper loading failed');
                    const coreError = new Error('Core loading failed after helper initialization failed');

                    const initializationError = observe(() => component.instantiate(loader.getCoreModule, {}));
                    assert.include(loader.requested, firstCorePath);
                    assert.include(loader.requested, helperPath);
                    helperLoad.reject(helperError);
                    assert.strictEqual(await initializationError, helperError);

                    // Initialization has stopped; an already-started core can still reject.
                    coreLoad.reject(coreError);
                    await nextTurn();
                },
            );
        });
    });

    // These tests replace globalThis.fetch, so they must run sequentially.
    suite.sequential('automatic $init', () => {
        test('handles a later core rejection while initialization awaits the first core', async () => {
            await withLoadingFixture(
                componentPath,
                'default-first-pending',
                undefined,
                createFetchLoader,
                async (fixture, loader, observe) => {
                    const [firstCorePath] = fixture.corePaths;
                    const component = await fixture.import();
                    const initializationError = observe(() => component.$init);
                    const secondError = new Error('Second core fetch failed');
                    assert.deepEqual(loader.requested, fixture.corePaths);

                    loader.secondFetch.reject(secondError);
                    // Keep the first core pending through the runtime's rejection checkpoint.
                    await nextTurn();

                    loader.firstFetch.resolve(fixture.response(firstCorePath));
                    assert.strictEqual(await initializationError, secondError);
                },
            );
        });

        test('handles a later core rejection after initialization fails', async () => {
            await withLoadingFixture(
                componentPath,
                'default-first-fails',
                undefined,
                createFetchLoader,
                async (fixture, loader, observe) => {
                    const component = await fixture.import();
                    const initializationError = observe(() => component.$init);
                    const firstError = new Error('First core fetch failed');
                    const secondError = new Error('Second core fetch failed');
                    assert.deepEqual(loader.requested, fixture.corePaths);

                    loader.firstFetch.reject(firstError);
                    assert.strictEqual(await initializationError, firstError);

                    loader.secondFetch.reject(secondError);
                    await nextTurn();
                },
            );
        });
    });
});
