import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

import { assert, suite, test } from 'vitest';

import { transpile, writeFiles } from '../../src/index.js';

import {
    resetRuntimeCreateCallCount,
    resetTableGetCallCount,
    runtimeCreateCallCount,
    tableGetCallCount,
} from '../fixtures/custom-runtime-provider.js';
import { getTmpDir, nodeExec } from '../helpers.js';

suite('External Component Model runtime', () => {
    const fixture = fileURLToPath(new URL('../fixtures/components/runtime/resources.2.component.wat', import.meta.url));
    const resourceFixture = fileURLToPath(
        new URL('../fixtures/components/runtime/external-runtime-resource.component.wat', import.meta.url),
    );
    const defaultCmRuntimeEsModule = new URL('../../../jco-cm-runtime/dist/index.js', import.meta.url).href;

    for (const instantiation of ['sync', 'async'] as const) {
        test.each([false, true])(
            `uses the selected WebAssembly realm without a platform global (${instantiation}, minify=%s)`,
            async (minify) => {
                const outDir = await getTmpDir();
                const name = 'external-runtime-platform';
                try {
                    const { files } = await transpile(resourceFixture, {
                        name,
                        instantiation,
                        minify,
                        cmRuntimeEsModule: defaultCmRuntimeEsModule,
                    });
                    await writeFiles(files, { baseDir: outDir });
                    await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
                    await nodeExec(
                        fileURLToPath(new URL('../fixtures/external-runtime/override-platform.mjs', import.meta.url)),
                        join(outDir, `${name}.js`),
                    );
                } finally {
                    await rm(outDir, { recursive: true, force: true });
                }
            },
        );
    }

    for (const instantiation of ['sync', 'async', undefined] as const) {
        test.each([false, true])(
            `preserves the intrinsic receiver (${instantiation ?? 'direct'}, minify=%s)`,
            async (minify) => {
                const outDir = await getTmpDir();
                const name = 'external-runtime-receiver';
                const cmRuntimeEsModule = new URL('../fixtures/custom-runtime-provider.js', import.meta.url).href;
                resetTableGetCallCount();
                try {
                    const { files } = await transpile(resourceFixture, {
                        name,
                        instantiation,
                        minify,
                        cmRuntimeEsModule,
                    });
                    await writeFiles(files, { baseDir: outDir });
                    await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
                    const bindings = await import(pathToFileURL(join(outDir, `${name}.js`)).href);
                    const instance = instantiation
                        ? await bindings.instantiate(
                              (moduleName: string) => new WebAssembly.Module(files[moduleName]),
                              {},
                          )
                        : bindings;

                    assert.strictEqual(instance.run(42), 42);
                    assert.strictEqual(instance.run(24), 24);
                    assert.strictEqual(tableGetCallCount, 2);
                    assert.throws(() => instance.invalid(0), WebAssembly.RuntimeError, 'unknown handle index 0');
                    assert.throws(() => instance.run(42), WebAssembly.RuntimeError, 'cannot enter component instance');
                } finally {
                    await rm(outDir, { recursive: true, force: true });
                }
            },
        );
    }

    test.each([
        {
            name: 'a missing factory',
            provider: '{ apiVersion: 1 }',
            error: 'runtime provider must define create(options)',
        },
        {
            name: 'an incompatible provider API before calling its factory',
            provider: '{ apiVersion: 2, create() { throw new Error("factory must not run"); } }',
            error: 'runtime API: requested 1, supported 2',
        },
        {
            name: 'an incompatible instance API',
            provider: '{ apiVersion: 1, create() { return { apiVersion: 2 }; } }',
            error: 'runtime API instance: requested 1, received 2',
        },
        {
            name: 'a non-function intrinsic',
            provider:
                '{ apiVersion: 1, create() { return { apiVersion: 1, intrinsics: { resource: { tableGet: 0 } } }; } }',
            error: 'runtime intrinsic resource.tableGet must be a function',
        },
        {
            name: 'a missing resource namespace',
            provider: '{ apiVersion: 1, create() { return { apiVersion: 1, intrinsics: {} }; } }',
            error: 'runtime intrinsic resource.tableGet must be a function',
        },
        {
            name: 'missing intrinsics',
            provider: '{ apiVersion: 1, create() { return { apiVersion: 1 }; } }',
            error: 'runtime intrinsic resource.tableGet must be a function',
        },
    ])('rejects $name during instantiation', async ({ provider, error }) => {
        const outDir = await getTmpDir();
        const name = 'external-runtime-invalid-provider';
        try {
            const { files } = await transpile(resourceFixture, {
                name,
                instantiation: 'sync',
                cmRuntimeEsModule: './provider.js',
            });
            await writeFiles(files, { baseDir: outDir });
            await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
            await writeFile(join(outDir, 'provider.js'), `export const runtime = ${provider};`);
            const bindings = await import(pathToFileURL(join(outDir, `${name}.js`)).href);
            assert.throws(
                () => bindings.instantiate((moduleName: string) => new WebAssembly.Module(files[moduleName]), {}),
                error,
            );
        } finally {
            await rm(outDir, { recursive: true, force: true });
        }
    });

    test('does not depend on the optional runtime package', async () => {
        const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
        assert.notProperty(manifest.dependencies, '@bytecodealliance/jco-cm-runtime');
    });

    test('keeps canon resource.rep self-contained by default', async () => {
        const { files, imports } = await transpile(fixture, { name: 'external-runtime-resource' });
        const source = new TextDecoder().decode(files['external-runtime-resource.js']);

        assert.notInclude(source, '_jcoRuntimeProvider');
        assert.include(source, 'function rscTableGet(table, handle)');
        assert.include(source, 'rscTableGet(');
        assert.notInclude(imports, '@bytecodealliance/jco-cm-runtime');
    });

    test('places custom runtime creation inside each instantiation', async () => {
        const cmRuntimeEsModule = './test-runtime-provider.js';
        const { files, imports } = await transpile(fixture, {
            name: 'external-runtime-instantiation',
            instantiation: 'sync',
            cmRuntimeEsModule,
        });
        const source = new TextDecoder().decode(files['external-runtime-instantiation.js']);
        const importPosition = source.indexOf(
            'import { runtime as _jcoRuntimeProvider } from "./test-runtime-provider.js";',
        );
        const instantiatePosition = source.indexOf('export function instantiate(');
        const createPosition = source.indexOf('_jcoRuntimeProvider.create(');

        assert.isAtLeast(importPosition, 0);
        assert.isAbove(instantiatePosition, importPosition);
        assert.isAbove(createPosition, instantiatePosition);
        assert.lengthOf(source.match(/_jcoRuntimeProvider\.create\(/g) ?? [], 1);
        assert.notInclude(imports, cmRuntimeEsModule);
    });

    test('loads a bare runtime module installed only with the generated component', async () => {
        const outDir = await getTmpDir();
        const name = 'external-runtime-local-package';
        const cmRuntimeEsModule = 'test-runtime-provider';
        const packageDir = join(outDir, 'node_modules', cmRuntimeEsModule);

        try {
            await mkdir(packageDir, { recursive: true });
            await writeFile(
                join(packageDir, 'package.json'),
                JSON.stringify({ name: cmRuntimeEsModule, type: 'module' }),
            );
            await copyFile(
                new URL('../fixtures/custom-runtime-provider.js', import.meta.url),
                join(packageDir, 'index.js'),
            );
            const provider = await import(pathToFileURL(join(packageDir, 'index.js')).href);
            provider.resetRuntimeCreateCallCount();

            const { files } = await transpile(fixture, { name, instantiation: 'sync', cmRuntimeEsModule });
            await writeFiles(files, { baseDir: outDir });
            const source = new TextDecoder().decode(files[`${name}.js`]);
            assert.include(source, `from "${cmRuntimeEsModule}"`);

            const bindings = await import(pathToFileURL(join(outDir, `${name}.js`)).href);
            bindings.instantiate((moduleName: string) => new WebAssembly.Module(files[moduleName]), {});
            assert.strictEqual(provider.runtimeCreateCallCount, 1);
        } finally {
            await rm(outDir, { recursive: true, force: true });
        }
    });

    test('creates a fresh runtime instance for each generated store', async () => {
        const outDir = await getTmpDir();
        const name = 'external-runtime-two-stores';
        const cmRuntimeEsModule = new URL('../fixtures/custom-runtime-provider.js', import.meta.url).href;
        resetRuntimeCreateCallCount();

        try {
            const { files } = await transpile(fixture, {
                name,
                instantiation: 'sync',
                cmRuntimeEsModule,
            });
            await writeFiles(files, { baseDir: outDir });
            const bindings = await import(pathToFileURL(join(outDir, `${name}.js`)).href);
            const getCoreModule = (moduleName: string) => new WebAssembly.Module(files[moduleName]);

            bindings.instantiate(getCoreModule, {});
            bindings.instantiate(getCoreModule, {});

            assert.strictEqual(runtimeCreateCallCount, 2);
        } finally {
            await rm(outDir, { recursive: true, force: true });
        }
    });
});
