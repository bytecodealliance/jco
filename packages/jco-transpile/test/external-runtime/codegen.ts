import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assert, expect, suite, test } from 'vitest';

import { transpile, writeFiles } from '../transpilation.js';
import { getTmpDir, nodeExec } from '../helpers.js';

const resourceFixture = fileURLToPath(
    new URL('../fixtures/components/runtime/external-runtime-resource.component.wat', import.meta.url),
);
const defaultBase = new URL('../../../jco-cm-runtime/dist/', import.meta.url).href;
const customBase = new URL('../fixtures/custom-runtime/', import.meta.url);

suite('external runtime codegen', () => {
    for (const instantiation of ['sync', 'async'] as const) {
        test.concurrent.each([false, true])(
            `uses the selected realm without a platform global (${instantiation}, minify=%s)`,
            async (minify) => {
                const outDir = await getTmpDir();
                try {
                    const { files } = await transpile(resourceFixture, {
                        name: 'component',
                        instantiation,
                        minify,
                        cmRuntimeEsModule: defaultBase,
                    });
                    await writeFiles(files, { baseDir: outDir });
                    await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
                    await nodeExec(
                        fileURLToPath(new URL('../fixtures/external-runtime/override-platform.mjs', import.meta.url)),
                        join(outDir, 'component.js'),
                    );
                } finally {
                    await rm(outDir, { recursive: true, force: true });
                }
            },
        );
    }

    for (const instantiation of ['sync', 'async', undefined] as const) {
        test.concurrent.each([false, true])(
            `uses narrow stable contexts with independent stores (${instantiation ?? 'direct'}, minify=%s)`,
            async (minify) => {
                const outDir = await getTmpDir();
                try {
                    await cp(customBase, join(outDir, 'runtime'), { recursive: true });
                    await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
                    const { files } = await transpile(resourceFixture, {
                        name: 'component',
                        instantiation,
                        minify,
                        cmRuntimeEsModule: './runtime/',
                    });
                    await writeFiles(files, { baseDir: outDir });
                    const runtime = await import(pathToFileURL(join(outDir, 'runtime/intrinsics/resource.js')).href);
                    const bindings = await import(pathToFileURL(join(outDir, 'component.js')).href);
                    const load = (name: string) => new WebAssembly.Module(files[name]);
                    const first = instantiation ? await bindings.instantiate(load, {}) : bindings;
                    assert.strictEqual(first.run(42), 42);
                    assert.strictEqual(first.run(24), 24);
                    assert.strictEqual(first.run(0), 0);
                    assert.strictEqual(runtime.tableGetCallCount, 3);
                    assert.strictEqual(runtime.contexts.size, 1);
                    const [context] = runtime.contexts;
                    assert.strictEqual(context.RuntimeError, WebAssembly.RuntimeError);
                    if (instantiation) {
                        const [second, third] = await Promise.all([
                            bindings.instantiate(load, {}),
                            bindings.instantiate(load, {}),
                        ]);
                        assert.strictEqual(second.run(7), 7);
                        assert.strictEqual(third.run(8), 8);
                        assert.strictEqual(first.run(9), 9);
                        assert.strictEqual(runtime.contexts.size, 3);
                        const tables = [...runtime.tables.values()].map((value: Set<unknown>) => [...value][0]);
                        assert.strictEqual(new Set(tables).size, 3);
                        assert.throws(() => first.invalid(0), WebAssembly.RuntimeError, 'unknown handle index 0');
                        assert.strictEqual(second.run(10), 10);
                    } else {
                        assert.throws(() => first.invalid(0), WebAssembly.RuntimeError, 'unknown handle index 0');
                    }
                    assert.throws(() => first.run(42), WebAssembly.RuntimeError, 'cannot enter component instance');
                } finally {
                    await rm(outDir, { recursive: true, force: true });
                }
            },
        );
    }

    test.concurrent.each(['independent', 'reexport'] as const)(
        'loads a %s package installed only beside generated bindings',
        async (implementation) => {
            const outDir = await getTmpDir();
            const packageDir = join(outDir, 'node_modules/test-runtime-provider');
            try {
                await cp(customBase, packageDir, { recursive: true });
                if (implementation === 'reexport') {
                    await writeFile(
                        join(packageDir, 'intrinsics/resource.js'),
                        `export { tableGet } from ${JSON.stringify(defaultBase + 'intrinsics/resource.js')};`,
                    );
                }
                await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
                const { files } = await transpile(resourceFixture, {
                    name: 'component',
                    instantiation: 'sync',
                    cmRuntimeEsModule: 'test-runtime-provider',
                });
                await writeFiles(files, { baseDir: outDir });
                const bindings = await import(pathToFileURL(join(outDir, 'component.js')).href);
                const instance = bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                assert.strictEqual(instance.run(42), 42);
                assert.throws(() => instance.invalid(0), WebAssembly.RuntimeError, 'unknown handle index 0');
            } finally {
                await rm(outDir, { recursive: true, force: true });
            }
        },
    );

    test.concurrent.each(['sync', 'async', undefined] as const)(
        'rejects unsupported API metadata (%s)',
        async (instantiation) => {
            const outDir = await getTmpDir();
            try {
                await cp(customBase, join(outDir, 'runtime'), { recursive: true });
                await writeFile(join(outDir, 'runtime/runtime.js'), 'export const CM_RUNTIME_API_VERSION = 2;');
                await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
                const { files } = await transpile(resourceFixture, {
                    name: 'component',
                    instantiation,
                    cmRuntimeEsModule: './runtime',
                });
                await writeFiles(files, { baseDir: outDir });
                await expect(
                    (async () => {
                        const bindings = await import(pathToFileURL(join(outDir, 'component.js')).href);
                        if (instantiation) {
                            await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                        }
                    })(),
                ).rejects.toThrow('runtime API: requested 1, supported 2');
            } finally {
                await rm(outDir, { recursive: true, force: true });
            }
        },
    );

    test.concurrent.each(['export', 'subpath'] as const)('native ESM rejects a missing %s', async (missing) => {
        const outDir = await getTmpDir();
        const packageDir = join(outDir, 'node_modules/test-runtime-provider');
        try {
            await cp(customBase, packageDir, { recursive: true });
            if (missing === 'export') {
                await writeFile(join(packageDir, 'intrinsics/resource.js'), 'export {};');
            } else {
                await writeFile(
                    join(packageDir, 'package.json'),
                    JSON.stringify({ type: 'module', exports: { './runtime': './runtime.js' } }),
                );
            }
            await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
            const { files } = await transpile(resourceFixture, {
                name: 'component',
                instantiation: 'sync',
                cmRuntimeEsModule: 'test-runtime-provider',
            });
            await writeFiles(files, { baseDir: outDir });
            await writeFile(join(outDir, 'load.mjs'), "import './component.js';");
            await expect(nodeExec(join(outDir, 'load.mjs'))).rejects.toThrow(
                missing === 'export' ? 'tableGet' : 'exports',
            );
        } finally {
            await rm(outDir, { recursive: true, force: true });
        }
    });

    test.concurrent('keeps inline output self-contained and transpilation independent of runtime installation', async () => {
        const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
        assert.notProperty(manifest.dependencies, '@bytecodealliance/jco-cm-runtime');
        const { files } = await transpile(resourceFixture, { name: 'component', cmRuntimeEsModule: undefined });
        const source = new TextDecoder().decode(files['component.js']);
        assert.include(source, 'function rscTableGet(table, handle)');
        assert.notInclude(source, '_jcoRuntime');
        const external = await transpile(resourceFixture, {
            name: 'component',
            instantiation: 'sync',
            cmRuntimeEsModule: 'not-installed-runtime',
        });
        const named = new TextDecoder().decode(external.files['component.js']);
        assert.include(named, 'from "not-installed-runtime/intrinsics/resource"');
        assert.include(named, 'from "not-installed-runtime/runtime"');
        assert.notInclude(named, '_jcoRuntimeProvider');
        assert.notInclude(named, '.bind(receiver)');
        assert.lengthOf(named.match(/tableGet as rscTableGet/g) ?? [], 1);
        assert.isAbove(
            named.indexOf('const _jcoResourceTableGetContext'),
            named.indexOf('const WebAssembly = options?'),
        );
        assert.notInclude(external.imports, 'not-installed-runtime');
    });

    test.concurrent('reserves the named intrinsic alias against component exports', async () => {
        const outDir = await getTmpDir();
        try {
            const wat = (await readFile(resourceFixture, 'utf8')).replace(
                '(func (export "run") (param "value"',
                '(func (export "rsc-table-get") (param "value"',
            );
            const component = join(outDir, 'collision.wat');
            await writeFile(component, wat);
            const { files } = await transpile(component, {
                name: 'component',
                instantiation: 'sync',
                cmRuntimeEsModule: defaultBase,
            });
            await writeFiles(files, { baseDir: outDir });
            const bindings = await import(pathToFileURL(join(outDir, 'component.js')).href);
            const instance = bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
            assert.strictEqual(instance.rscTableGet(42), 42);
        } finally {
            await rm(outDir, { recursive: true, force: true });
        }
    });

    test.concurrent.each(['relative', 'file-url'] as const)(
        'loads a %s directory base with spaces and quotes',
        async (kind) => {
            const outDir = await getTmpDir();
            const directory = "runtime with 'quotes'";
            try {
                await cp(customBase, join(outDir, directory), { recursive: true });
                const cmRuntimeEsModule =
                    kind === 'relative' ? `./${directory}/` : pathToFileURL(join(outDir, directory)).href;
                const { files } = await transpile(resourceFixture, {
                    name: 'component',
                    instantiation: 'sync',
                    cmRuntimeEsModule,
                });
                await writeFiles(files, { baseDir: outDir });
                const bindings = await import(pathToFileURL(join(outDir, 'component.js')).href);
                const instance = bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                assert.strictEqual(instance.run(42), 42);
            } finally {
                await rm(outDir, { recursive: true, force: true });
            }
        },
    );

    test.concurrent.each([
        ['', 'non-empty base'],
        ['runtime\nmodule', 'control characters'],
        ['data:text/javascript,', 'unsupported URL scheme'],
        ['./runtime?version=2', 'query or fragment'],
        ['file:///runtime#version', 'query or fragment'],
        ['./provider.js', 'directory base'],
    ])('rejects invalid base %j through the transpiler API', async (cmRuntimeEsModule, message) => {
        await expect(transpile(resourceFixture, { name: 'component', cmRuntimeEsModule })).rejects.toThrow(message);
    });
});
