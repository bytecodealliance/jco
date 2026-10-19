import { rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assert, suite, test, vi } from 'vitest';

import { transpileBytes, writeFiles } from '../src/index.js';

import { getTmpDir, readComponentBytes } from './helpers.js';
import { collectUnhandledRejections } from './p3/helpers/disposal.js';

const componentPath = fileURLToPath(
    new URL('./fixtures/components/runtime/waitable-set-wait-unused.component.wat', import.meta.url),
);

async function prepareFixture(name: string, instantiation?: 'async') {
    const { files } = await transpileBytes(await readComponentBytes(componentPath), {
        name,
        instantiation,
        tlaCompat: true,
        base64Cutoff: 0,
        nodejsCompat: false,
        minify: false,
    });
    const corePaths = [`${name}.core.wasm`, `${name}.core2.wasm`];
    assert.deepEqual(
        Object.keys(files)
            .filter((path) => /\.core\d*\.wasm$/.test(path))
            .sort(),
        corePaths,
    );
    const modules = new Map(
        Object.entries(files)
            .filter(([path]) => path.endsWith('.wasm'))
            .map(([path, bytes]) => [path, new WebAssembly.Module(bytes)]),
    );
    const helperPath = [...modules.keys()].find((path) => path.includes('.conditional-suspending-'));
    if (instantiation === 'async') {
        assert.isString(helperPath, 'fixture must emit an external helper');
    }
    const outputDir = await getTmpDir();
    try {
        await writeFiles(files, { baseDir: outputDir });
        await writeFile(join(outputDir, 'package.json'), JSON.stringify({ type: 'module' }));
    } catch (error) {
        await rm(outputDir, { recursive: true, force: true });
        throw error;
    }
    return {
        corePaths,
        helperPath,
        modules,
        import: () => import(pathToFileURL(join(outputDir, `${name}.js`)).href),
        response: (path: string) =>
            new Response(Uint8Array.from(files[path]).buffer, { headers: { 'Content-Type': 'application/wasm' } }),
        cleanup: () => rm(outputDir, { recursive: true, force: true }),
    };
}

type Fixture = Awaited<ReturnType<typeof prepareFixture>>;
type LoadControls = { release(): void; restore?(): void };
type ObserveInitialization = (start: () => unknown) => Promise<unknown>;

// Keep this loader unmocked: Vitest attaches handlers to promises returned by mocks.
function createCoreLoader(fixture: Fixture) {
    const pending = new Map<string, PromiseWithResolvers<WebAssembly.Module>>();
    const requested: string[] = [];

    return {
        requested,
        defer(path: string) {
            assert.isTrue(fixture.modules.has(path));
            const load = Promise.withResolvers<WebAssembly.Module>();
            pending.set(path, load);
            return load;
        },
        getCoreModule(path: string) {
            requested.push(path);
            const module = fixture.modules.get(path);
            if (!module) {
                throw new Error(`Unexpected module request: ${path}`);
            }
            return pending.get(path)?.promise ?? module;
        },
        release() {
            for (const [path, load] of pending) {
                load.resolve(fixture.modules.get(path)!);
            }
        },
    };
}

function createFetchLoader(fixture: Fixture) {
    const [firstCorePath, secondCorePath] = fixture.corePaths;
    const firstFetch = Promise.withResolvers<Response>();
    const secondFetch = Promise.withResolvers<Response>();
    const requested: string[] = [];
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        const path = basename(new URL(String(input)).pathname);
        requested.push(path);
        if (path === firstCorePath) {
            return firstFetch.promise;
        }
        if (path === secondCorePath) {
            return secondFetch.promise;
        }
        throw new Error(`Unexpected module request: ${path}`);
    });

    return {
        firstFetch,
        secondFetch,
        requested,
        release() {
            firstFetch.resolve(fixture.response(firstCorePath));
            secondFetch.resolve(fixture.response(secondCorePath));
        },
        restore() {
            fetch.mockRestore();
        },
    };
}

// Catch only overall initialization; controlled core promises stay unobserved by the test.
async function captureInitializationError(start: () => unknown): Promise<unknown> {
    try {
        await start();
        return undefined;
    } catch (error) {
        return error;
    }
}

async function withLoadingFixture<C extends LoadControls>(
    name: string,
    instantiation: 'async' | undefined,
    createControls: (fixture: Fixture) => C,
    scenario: (fixture: Fixture, controls: C, observe: ObserveInitialization) => Promise<void>,
) {
    const fixture = await prepareFixture(name, instantiation);
    let controls: C | undefined;
    let initialization: Promise<unknown> | undefined;

    const unhandled = await collectUnhandledRejections(async () => {
        try {
            controls = createControls(fixture);
            await scenario(fixture, controls, (start) => {
                initialization = captureInitializationError(start);
                return initialization;
            });
        } finally {
            try {
                controls?.release();
                await initialization;
            } finally {
                try {
                    controls?.restore?.();
                } finally {
                    await fixture.cleanup();
                }
            }
        }
    });

    assert.deepEqual(unhandled, []);
}

// Keep these scenarios sequential: fetch interception and rejection events are process-wide.
suite.skipIf(typeof WebAssembly.Suspending !== 'function')('initialization rejection handling', () => {
    suite('explicit instantiate()', () => {
        test('handles an outstanding core rejection after a later loader throws synchronously', async () => {
            await withLoadingFixture(
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

        test('handles a core rejection while helper loading is pending', async () => {
            await withLoadingFixture(
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

        test('handles an outstanding core rejection after helper loading fails', async () => {
            await withLoadingFixture(
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

    suite('automatic $init', () => {
        test('handles a later core rejection while initialization awaits the first core', async () => {
            await withLoadingFixture(
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
