import { join, resolve } from 'node:path';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';

import { fileURLToPath, pathToFileURL } from 'node:url';

import { suite, test, assert, expect } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { transpile, writeFiles } from '../src/index.js';

import { getTmpDir, setupAsyncTest } from './helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from './common.js';

suite('Host Import Async (JSPI)', () => {
    test('synchronous host imports work in direct ESM output', async () => {
        if (typeof WebAssembly?.Suspending !== 'function') {
            return;
        }

        const outDir = await getTmpDir();
        try {
            const { files } = await transpile(join(LOCAL_TEST_COMPONENTS_DIR, 'resource-drop-host-import.wasm'), {
                name: 'conditional-host-import',
                asyncMode: 'jspi',
                asyncImports: ['calculate', 'jco:test-components/tick#tick'],
                asyncExports: ['jco:test-components/dropped-resource#call-async'],
                map: { calculate: './host.js#calculate', 'jco:test-components/tick': './host.js#tick' },
            });
            await writeFiles(files, { baseDir: outDir });
            await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
            const modulesDir = join(outDir, 'node_modules', '@bytecodealliance');
            await mkdir(modulesDir, { recursive: true });
            await symlink(
                fileURLToPath(
                    new URL('../../../', import.meta.resolve('@bytecodealliance/preview2-shim/instantiation')),
                ),
                join(modulesDir, 'preview2-shim'),
                'dir',
            );
            await writeFile(
                join(outDir, 'host.js'),
                'export const calculate = () => 42n; export const tick = { tick: () => {} };',
            );
            const instance = await import(pathToFileURL(join(outDir, 'conditional-host-import.js')).href);
            await instance.$init;
            const api = instance['jco:test-components/dropped-resource'];
            assert.strictEqual(api.initialized(), 42n);
            assert.strictEqual(api.callSync(), 42n);
            assert.strictEqual(await api.callAsync(1), 42n);
            api.dropInGuest();
            new api.Thing()[Symbol.dispose]();
        } finally {
            await rm(outDir, { recursive: true, force: true });
        }
    });

    test.concurrent.each([false, true])(
        'host imports bypass JSPI when the caller cannot block (minify=%s)',
        async (minify) => {
            if (typeof WebAssembly?.Suspending !== 'function') {
                return;
            }

            const { esModule, cleanup } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: {
                    path: join(LOCAL_TEST_COMPONENTS_DIR, 'resource-drop-host-import.wasm'),
                    skipInstantiation: true,
                },
                jco: {
                    transpile: {
                        extraArgs: {
                            minify,
                            asyncImports: ['calculate', 'jco:test-components/tick#tick'],
                            asyncExports: ['jco:test-components/dropped-resource#call-async'],
                        },
                    },
                },
            });

            try {
                let ticks = 0;
                let calculateAsync = false;
                let tickAsync = false;
                const imports = {
                    ...new WASIShim().getImportObject(),
                    calculate: {
                        default: (...args) => {
                            assert.deepEqual(args, [1, 2n, 3.5, 4.5]);
                            return calculateAsync ? Promise.resolve(42n) : 42n;
                        },
                    },
                    'jco:test-components/tick': {
                        tick: () => {
                            ticks++;
                            return tickAsync ? Promise.resolve() : undefined;
                        },
                    },
                };

                const instance = await esModule.instantiate(undefined, imports);
                const api = instance['jco:test-components/dropped-resource'];
                assert.strictEqual(api.initialized(), 42n);
                assert.strictEqual(api.callSync(), 42n);
                assert.strictEqual(await api.callAsync(1), 42n);
                calculateAsync = true;
                assert.strictEqual(await api.callAsync(1), 42n);

                api.dropInGuest();
                new api.Thing()[Symbol.dispose]();
                assert.strictEqual(ticks, 2);
                tickAsync = true;
                assert.throws(
                    () => new api.Thing()[Symbol.dispose](),
                    /cannot block a synchronous task before returning/,
                );
                assert.strictEqual(ticks, 3);

                // A promise returned during initialization must still trap, and must
                // not be left as an unhandled rejection.
                for (const calculate of [() => Promise.resolve(42n), () => Promise.reject(new Error('host failure'))]) {
                    await expect(
                        esModule.instantiate(undefined, { ...imports, calculate: { default: calculate } }),
                    ).rejects.toThrow('cannot block a synchronous task before returning');
                }
            } finally {
                await cleanup();
            }
        },
    );

    test('Transpile async', async () => {
        const tmpDir = await getTmpDir();
        const outDir = resolve(tmpDir, 'out-component-dir');
        const outFile = resolve(tmpDir, 'out-component-file');

        const modulesDir = resolve(tmpDir, 'node_modules', '@bytecodealliance');
        await mkdir(modulesDir, { recursive: true });
        await symlink(
            fileURLToPath(new URL('../packages/preview2-shim', import.meta.url)),
            resolve(modulesDir, 'preview2-shim'),
            'dir',
        );

        const name = 'flavorful';
        const { files } = await transpile(
            fileURLToPath(new URL(`./fixtures/components/runtime/${name}.component.wasm`, import.meta.url)),
            { noWasiShim: true, name, outDir },
        );
        const source = Buffer.from(files[`${outDir}/${name}.js`]).toString('utf8');
        assert.include(source, 'export { test');

        try {
            await rm(outDir, { recursive: true });
            await rm(outFile);
        } catch {}
    });

    test.concurrent('Transpile async (NodeJS, JSPI)', async () => {
        if (typeof WebAssembly?.Suspending !== 'function') {
            return;
        }
        const tmpDir = await getTmpDir();
        const outDir = resolve(tmpDir, 'out-component-dir');
        const outFile = resolve(tmpDir, 'out-component-file');

        const modulesDir = resolve(tmpDir, 'node_modules', '@bytecodealliance');
        await mkdir(modulesDir, { recursive: true });
        await symlink(
            fileURLToPath(new URL('../packages/preview2-shim', import.meta.url)),
            resolve(modulesDir, 'preview2-shim'),
            'dir',
        );

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'async_call',
                path: resolve('test/fixtures/components/runtime/async_call.component.wasm'),
                imports: {
                    'something:test/test-interface': {
                        callAsync: async () => 'called async',
                        callSync: () => 'called sync',
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncImports: ['something:test/test-interface#call-async'],
                        asyncExports: ['run-async'],
                    },
                },
            },
        });

        assert.strictEqual(instance.runSync instanceof AsyncFunction, false, 'runSync() should be a sync function');
        assert.strictEqual(instance.runAsync instanceof AsyncFunction, true, 'runAsync() should be an async function');

        assert.strictEqual(instance.runSync(), 'called sync');
        assert.strictEqual(await instance.runAsync(), 'called async');

        await cleanup();

        try {
            await rm(outDir, { recursive: true });
            await rm(outFile);
        } catch {}
    });

    test.concurrent('Transpile async import and export (NodeJS, JSPI)', async () => {
        if (typeof WebAssembly?.Suspending !== 'function') {
            return;
        }

        const tmpDir = await getTmpDir();
        const outputDir = resolve(tmpDir, 'out-component-dir');
        const outFile = resolve(tmpDir, 'out-component-file');
        await mkdir(outputDir, { recursive: true });

        const modulesDir = resolve(tmpDir, 'node_modules', '@bytecodealliance');
        await mkdir(modulesDir, { recursive: true });
        await symlink(
            fileURLToPath(new URL('../packages/preview2-shim', import.meta.url)),
            resolve(modulesDir, 'preview2-shim'),
            'dir',
        );
        const testMessage = 'Hello from Async Function!';
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'async_call',
                outputDir,
                path: resolve('test/fixtures/components/runtime/simple-nested.component.wasm'),
                imports: {
                    'calvinrp:test-async-funcs/hello': {
                        helloWorld: async () => await Promise.resolve(testMessage),
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        // minify: false,
                        asyncImports: ['calvinrp:test-async-funcs/hello#hello-world'],
                        asyncExports: ['hello-world'],
                    },
                },
            },
        });

        assert.strictEqual(
            instance.hello.helloWorld instanceof AsyncFunction,
            true,
            'helloWorld() should be an async function',
        );

        assert.strictEqual(await instance.hello.helloWorld(), testMessage);

        await cleanup();
        try {
            await rm(outputDir, { recursive: true });
            await rm(outFile);
        } catch {}
    });

    // Class constructors cannot be `async`, so an async resource constructor
    // must return a promise of the instance instead.
    test.concurrent('Transpile async resource constructor and static exports (NodeJS, JSPI)', async () => {
        if (typeof WebAssembly?.Suspending !== 'function') {
            return;
        }

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'example_guest_export',
                path: resolve('test/fixtures/components/runtime/example_guest_export.wasm'),
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncExports: [
                            'example:component/backend@0.1.0#[constructor]scalars',
                            'example:component/backend@0.1.0#[static]scalars.get-a',
                        ],
                    },
                },
            },
        });

        try {
            const { Scalars, scalarArg } = instance.backend;
            assert.strictEqual(Scalars.getA instanceof AsyncFunction, true, 'getA() should be an async function');
            assert.strictEqual(
                Scalars.prototype.getB instanceof AsyncFunction,
                false,
                'getB() should be a sync function',
            );

            const pending = new Scalars();
            assert.instanceOf(pending, Promise);
            const scalar = await pending;
            assert.instanceOf(scalar, Scalars);

            assert.strictEqual(await Scalars.getA(), 5);
            assert.strictEqual(scalar.getB(), 2);
            assert.strictEqual(scalarArg(scalar), 7);
        } finally {
            await cleanup();
        }
    });

    // Ensure async imports whose promises settle without ever yielding to
    // the macrotask queue must still resume the suspended guest,
    // on every call (not just the first).
    test.concurrent('Transpile async, import settles without macrotask yield, repeated calls (NodeJS, JSPI)', async () => {
        if (typeof WebAssembly?.Suspending !== 'function') {
            return;
        }
        const tmpDir = await getTmpDir();
        const outDir = resolve(tmpDir, 'out-component-dir');
        const outFile = resolve(tmpDir, 'out-component-file');

        const modulesDir = resolve(tmpDir, 'node_modules', '@bytecodealliance');
        await mkdir(modulesDir, { recursive: true });
        await symlink(
            fileURLToPath(new URL('../packages/preview2-shim', import.meta.url)),
            resolve(modulesDir, 'preview2-shim'),
            'dir',
        );

        let calls = 0;
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'async_call',
                path: resolve('test/fixtures/components/runtime/async_call.component.wasm'),
                imports: {
                    'something:test/test-interface': {
                        // NOTE: intentionally an already-settled promise with no
                        // intervening macrotask hop
                        callAsync: () => {
                            calls += 1;
                            return Promise.resolve(`called async ${calls}`);
                        },
                        callSync: () => 'called sync',
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncImports: ['something:test/test-interface#call-async'],
                        asyncExports: ['run-async'],
                    },
                },
            },
        });

        for (let i = 1; i <= 3; i++) {
            assert.strictEqual(await instance.runAsync(), `called async ${i}`);
        }

        await cleanup();

        try {
            await rm(outDir, { recursive: true });
            await rm(outFile);
        } catch {}
    });

    // A failing JSPI-suspended import must trap the guest and reject the
    // export, rather than leave the guest suspended forever.
    test.concurrent('Transpile async, import rejects (NodeJS, JSPI)', async () => {
        if (typeof WebAssembly?.Suspending !== 'function') {
            return;
        }
        const tmpDir = await getTmpDir();
        const modulesDir = resolve(tmpDir, 'node_modules', '@bytecodealliance');
        await mkdir(modulesDir, { recursive: true });
        await symlink(
            fileURLToPath(new URL('../packages/preview2-shim', import.meta.url)),
            resolve(modulesDir, 'preview2-shim'),
            'dir',
        );

        const inducedError = new Error('induced host rejection');
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'async_call',
                path: resolve('test/fixtures/components/runtime/async_call.component.wasm'),
                imports: {
                    'something:test/test-interface': {
                        callAsync: async () => {
                            throw inducedError;
                        },
                        callSync: () => 'called sync',
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncImports: ['something:test/test-interface#call-async'],
                        asyncExports: ['run-async'],
                    },
                },
            },
        });

        try {
            const exportCall = instance.runAsync();
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('export call timed out')), 5_000),
            );
            await expect(Promise.race([exportCall, timeout])).rejects.toBe(inducedError);
        } finally {
            await cleanup();
        }
    });

    // A resource destructor runs as a synchronous task, which cannot block: a JSPI
    // import called from it must return synchronously when the host does, and trap
    // only when the host returns a promise.
    test.concurrent('Transpile async, import called from resource destructor (NodeJS, JSPI)', async () => {
        if (typeof WebAssembly?.Suspending !== 'function') {
            return;
        }

        let ticks = 0;
        let hostIsAsync = false;
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'resource-drop-host-import.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    calculate: { default: () => 42n },
                    'jco:test-components/tick': {
                        tick: () => {
                            ticks += 1;
                            if (hostIsAsync) {
                                return Promise.resolve();
                            }
                        },
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncImports: ['jco:test-components/tick#tick'],
                    },
                },
            },
        });

        try {
            const { Thing } = instance['jco:test-components/dropped-resource'];

            new Thing()[Symbol.dispose]();
            new Thing()[Symbol.dispose]();
            assert.strictEqual(ticks, 2);

            hostIsAsync = true;
            assert.throws(() => new Thing()[Symbol.dispose](), 'cannot block a synchronous task before returning');
            assert.strictEqual(ticks, 3);
        } finally {
            await cleanup();
        }
    });
});
