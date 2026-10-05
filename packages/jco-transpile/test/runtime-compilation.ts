import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';

import { setupAsyncTest } from './helpers.js';

const componentPath = fileURLToPath(
    new URL('./fixtures/components/runtime/waitable-set-wait-unused.component.wat', import.meta.url),
);

/** Run `fn` with Wasm compilation from bytes disabled, as on Cloudflare Workers */
async function withoutRuntimeCompilation<T>(fn: () => Promise<T>): Promise<T> {
    const { Module, compile, compileStreaming, instantiate } = WebAssembly;
    const forbid = (what: string) => () => {
        throw new WebAssembly.CompileError(`Wasm code generation disallowed by embedder (${what})`);
    };
    const wasm = WebAssembly as unknown as Record<string, unknown>;
    wasm.Module = new Proxy(Module, { construct: forbid('new WebAssembly.Module') });
    wasm.compile = forbid('WebAssembly.compile');
    wasm.compileStreaming = forbid('WebAssembly.compileStreaming');
    wasm.instantiate = (source: unknown, imports?: WebAssembly.Imports) =>
        source instanceof Module ? instantiate(source, imports) : forbid('WebAssembly.instantiate with bytes')();
    try {
        return await fn();
    } finally {
        Object.assign(wasm, { Module, compile, compileStreaming, instantiate });
    }
}

// NOTE: these tests are not concurrent, as they patch the global `WebAssembly` object
suite.skipIf(typeof WebAssembly.Suspending !== 'function')('runtime compilation', () => {
    for (const instantiation of ['async', 'sync'] as const) {
        test(`--instantiation ${instantiation} compiles no Wasm at runtime`, async () => {
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
                const instance = await withoutRuntimeCompilation(() =>
                    esModule.instantiate((name: string) => {
                        requested.push(name);
                        const module = modules.get(name);
                        assert.ok(module, `getCoreModule('${name}') names an emitted file`);
                        return module;
                    }, {}),
                );
                assert.strictEqual(instance.run(), 42);
                assert.deepStrictEqual(
                    requested.toSorted(),
                    [...modules.keys()].toSorted(),
                    'every emitted core module, the trampoline Wasm included, is loaded through getCoreModule',
                );
                assert.strictEqual(modules.size, 3);
            } finally {
                await cleanup();
            }
        });
    }

    test('a getCoreModule that does not know the trampoline Wasm still instantiates', async () => {
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
