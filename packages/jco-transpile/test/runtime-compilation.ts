import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, suite, test, vi } from 'vitest';

import { nodeExec, setupAsyncTest } from './helpers.js';

const componentPath = fileURLToPath(
    new URL('./fixtures/components/runtime/waitable-set-wait-unused.component.wat', import.meta.url),
);

/** A WebAssembly implementation that forbids compilation from bytes, as on Cloudflare Workers. */
function withoutRuntimeCompilation(): typeof WebAssembly {
    const { Module, instantiate } = WebAssembly;
    const forbid = (what: string) => () => {
        throw new WebAssembly.CompileError(`Wasm code generation disallowed by embedder (${what})`);
    };
    return Object.assign(Object.create(WebAssembly), {
        Module: new Proxy(Module, { construct: forbid('new WebAssembly.Module') }),
        compile: forbid('WebAssembly.compile'),
        compileStreaming: forbid('WebAssembly.compileStreaming'),
        instantiate: (source: unknown, imports?: WebAssembly.Imports) =>
            source instanceof Module ? instantiate(source, imports) : forbid('WebAssembly.instantiate with bytes')(),
    });
}

suite.skipIf(typeof WebAssembly.Suspending !== 'function')('runtime compilation', () => {
    for (const instantiation of ['async', 'sync'] as const) {
        test.concurrent(`--instantiation ${instantiation} compiles no Wasm at runtime`, async () => {
            const { esModule, esModuleOutputDir, cleanup } = await setupAsyncTest({
                component: {
                    name: `runtime-compilation-${instantiation}`,
                    path: componentPath,
                    skipInstantiation: true,
                },
                jco: { transpile: { extraArgs: { instantiation } } },
            });

            try {
                const modules = new Map<string, WebAssembly.Module>();
                for (const file of await readdir(esModuleOutputDir)) {
                    if (file.endsWith('.wasm')) {
                        modules.set(file, new WebAssembly.Module(await readFile(join(esModuleOutputDir, file))));
                    }
                }
                const requested: string[] = [];
                const wasm = withoutRuntimeCompilation();
                const instantiate = vi.spyOn(wasm, 'instantiate');
                const construct = vi.fn((target, args) => Reflect.construct(target, args));
                wasm.Instance = new Proxy(WebAssembly.Instance, { construct });
                const instance = await esModule.instantiate(
                    (name: string) => {
                        requested.push(name);
                        const module = modules.get(name);
                        assert.ok(module, `getCoreModule('${name}') names an emitted file`);
                        return module;
                    },
                    {},
                    undefined,
                    { shim: { globals: { WebAssembly: wasm } } },
                );
                assert.strictEqual(instance.run(), 42);
                assert.strictEqual(instantiate.mock.calls.length, instantiation === 'async' ? 2 : 0);
                // The conditional-suspending trampoline uses Instance in both modes.
                assert.strictEqual(construct.mock.calls.length, instantiation === 'sync' ? 3 : 1);
                assert.deepStrictEqual(
                    requested.toSorted(),
                    [...modules.keys()].toSorted(),
                    'every emitted core module, the trampoline Wasm included, is loaded through getCoreModule',
                );
                assert.strictEqual(modules.size, 3);

                // Omitting either options or its nested overrides uses the platform defaults.
                for (const options of [
                    undefined,
                    {},
                    { shim: {} },
                    { shim: { globals: {} } },
                    { shim: { globals: { WebAssembly: undefined } } },
                ]) {
                    const defaultInstance = await esModule.instantiate(
                        (name: string) => modules.get(name),
                        {},
                        undefined,
                        options,
                    );
                    assert.strictEqual(defaultInstance.run(), 42);
                }
            } finally {
                await cleanup();
            }
        });

        for (const minify of [false, true]) {
            test.concurrent(`--instantiation ${instantiation} without global WebAssembly (minify: ${minify})`, async () => {
                const { esModuleOutputDir, cleanup } = await setupAsyncTest({
                    component: {
                        name: 'custom-webassembly',
                        path: componentPath,
                        skipInstantiation: true,
                    },
                    jco: { transpile: { extraArgs: { instantiation, minify } } },
                });

                try {
                    // A separate process lets this test remove the platform global without
                    // interfering with other tests or with the transpiler itself.
                    const script = join(esModuleOutputDir, 'test.mjs');
                    await writeFile(
                        script,
                        `
                        import assert from 'node:assert/strict';
                        import { readFileSync } from 'node:fs';

                        const native = globalThis.WebAssembly;
                        delete globalThis.WebAssembly;
                        const { instantiate } = await import('./custom-webassembly.js');
                        const used = new Set();
                        const wasm = new Proxy(native, {
                            get(target, key) {
                                used.add(key);
                                return target[key];
                            },
                        });
                        const load = name => name.includes('.conditional-suspending-')
                            ? undefined
                            : new native.Module(readFileSync(new URL(name, import.meta.url)));

                        const result = instantiate(load, {}, undefined, { shim: { globals: { WebAssembly: wasm } } });
                        if ('${instantiation}' === 'sync') assert.ok(!(result instanceof Promise));
                        const instance = await result;
                        assert.equal(instance.run(), 42);
                        for (const key of ['Module', 'Instance', 'Global', 'Suspending']) {
                            assert.ok(used.has(key), key + ' must use the injected implementation');
                        }
                        assert.equal(used.has('instantiate'), '${instantiation}' === 'async');

                        // An explicit core instantiator still takes precedence over the default.
                        used.clear();
                        let calls = 0;
                        const custom = await instantiate(load, {}, (module, imports) => {
                            calls++;
                            return new native.Instance(module, imports);
                        }, { shim: { globals: { WebAssembly: wasm } } });
                        assert.equal(custom.run(), 42);
                        assert.equal(calls, 2);
                        assert.ok(!used.has('instantiate'));

                        // The default async loader must also compile through the override.
                        if ('${instantiation}' === 'async') {
                            used.clear();
                            const loaded = await instantiate(undefined, {}, undefined, { shim: { globals: { WebAssembly: wasm } } });
                            assert.equal(loaded.run(), 42);
                            assert.ok(used.has('compile'));
                        }
                        assert.equal(globalThis.WebAssembly, undefined);

                        // Even feature detection must use the injected object.
                        Object.defineProperty(globalThis, 'WebAssembly', {
                            get() { throw new Error('accessed the platform WebAssembly'); },
                        });
                        const isolated = await instantiate(load, {}, undefined, { shim: { globals: { WebAssembly: wasm } } });
                        assert.equal(isolated.run(), 42);
                        `,
                    );
                    await nodeExec(script);
                } finally {
                    await cleanup();
                }
            });
        }
    }

    test.concurrent('a getCoreModule that does not know the trampoline Wasm still instantiates', async () => {
        const { esModule, esModuleOutputDir, cleanup } = await setupAsyncTest({
            component: {
                name: 'runtime-compilation-fallback',
                path: componentPath,
                skipInstantiation: true,
            },
        });

        try {
            const known = ['runtime-compilation-fallback.core.wasm', 'runtime-compilation-fallback.core2.wasm'];
            const instance = await esModule.instantiate(async (name: string) => {
                if (!known.includes(name)) {
                    return undefined;
                }
                return WebAssembly.compile(await readFile(join(esModuleOutputDir, name)));
            }, {});
            assert.strictEqual(instance.run(), 42);
        } finally {
            await cleanup();
        }
    });
});
