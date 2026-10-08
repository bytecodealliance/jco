import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, suite, test, vi } from 'vitest';

import { nodeExec, setupAsyncTest } from './helpers.js';

const componentPath = fileURLToPath(
    new URL('./fixtures/components/runtime/waitable-set-wait-unused.component.wat', import.meta.url),
);
const customWebAssemblyScript = fileURLToPath(
    new URL('./fixtures/runtime-compilation/custom-webassembly.mjs', import.meta.url),
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

                // Omitting options or its nested overrides, or passing null at any
                // level, uses the platform defaults.
                for (const options of [
                    undefined,
                    null,
                    {},
                    { shim: {} },
                    { shim: null },
                    { shim: { globals: {} } },
                    { shim: { globals: null } },
                    { shim: { globals: { WebAssembly: undefined } } },
                    { shim: { globals: { WebAssembly: null } } },
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
                    // The script runs in a separate process so that it can remove the
                    // platform global without interfering with other tests or with the
                    // transpiler itself.
                    await nodeExec(
                        customWebAssemblyScript,
                        join(esModuleOutputDir, 'custom-webassembly.js'),
                        instantiation,
                    );
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
