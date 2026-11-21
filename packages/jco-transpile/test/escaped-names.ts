import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, describe, test } from 'vitest';

import { transpileBytes, writeFiles } from './transpilation.js';
import { parse } from '../src/wasm-tools.js';
import { COMPONENT_FIXTURES_DIR } from './common.js';
import { getTmpDir } from './helpers.js';

const FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'escaped-names');

test.concurrent.each(['sync', 'async'] as const)('core imports have null prototypes (%s)', async (instantiation) => {
    const component = await parse(`(component
        (core module $provider
            (func $init) (start $init)
            (func (export "answer") (result i32) i32.const 42))
        (core instance $p (instantiate $provider))
        (core module $consumer
            (import "__proto__" "__proto__" (func $answer (result i32)))
            (func (export "run") (result i32) call $answer))
        (core instance $c (instantiate $consumer
            (with "__proto__" (instance (export "__proto__" (func $p "answer"))))))
        (func (export "run") (result u32) (canon lift (core func $c "run"))))`);
    const { files } = await transpileBytes(component, { name: 'core-imports', instantiation, base64Cutoff: 0 });
    const outDir = await getTmpDir();
    try {
        await writeFiles(files, { baseDir: outDir });
        await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
        const { instantiate } = await import(pathToFileURL(join(outDir, 'core-imports.js')).href);
        const instance = await instantiate(
            (path: string) => new WebAssembly.Module(files[path]),
            {},
            (module: WebAssembly.Module, imports?: WebAssembly.Imports) => {
                if (imports) {
                    assert.isNull(Object.getPrototypeOf(imports));
                    for (const namespace of Object.values(imports)) {
                        assert.isNull(Object.getPrototypeOf(namespace));
                    }
                }
                return new WebAssembly.Instance(module, imports);
            },
        );
        assert.strictEqual(instance.run(), 42);
    } finally {
        await rm(outDir, { recursive: true, force: true });
    }
});

test.concurrent.each([
    ['core-export-numeric.wat', '0'],
    ['core-export-numeric.wat', '-1'],
    ['core-export-numeric.wat', '10000000'],
    ['core-export-quoted.wat', undefined],
] as const)('asm.js preserves escaped core export names (%s, %s)', async (fixture, numericName) => {
    const outDir = await getTmpDir();
    try {
        let source = await readFile(join(FIXTURES_DIR, fixture), 'utf8');
        if (numericName !== undefined) {
            source = source.replaceAll('"0"', JSON.stringify(numericName));
        }
        const component = await parse(source);
        const { files } = await transpileBytes(component, { name: 'escaped-asm', js: true, instantiation: 'sync' });
        await writeFiles(files, { baseDir: outDir });
        await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
        const { instantiate } = await import(pathToFileURL(join(outDir, 'escaped-asm.js')).href);
        assert.strictEqual(instantiate({}).run(), 42);
    } finally {
        await rm(outDir, { recursive: true, force: true });
    }
});

describe.skipIf(typeof WebAssembly.Suspending !== 'function')('escaped callback names with JSPI', () => {
    test.concurrent.each(['callback.wat', 'callback-suspending.wat'])(
        'escapes callback diagnostic names (%s)',
        async (fixture) => {
            const outDir = await getTmpDir();
            try {
                const component = await parse(await readFile(join(FIXTURES_DIR, fixture), 'utf8'));
                const { files } = await transpileBytes(component, {
                    name: 'escaped-callback',
                    instantiation: 'async',
                    asyncMode: 'jspi',
                    base64Cutoff: 0,
                });
                await writeFiles(files, { baseDir: outDir });
                await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
                const { instantiate } = await import(pathToFileURL(join(outDir, 'escaped-callback.js')).href);
                const instance = await instantiate(undefined, {});
                assert.strictEqual(await instance.run(), 42);
            } finally {
                await rm(outDir, { recursive: true, force: true });
            }
        },
    );
});
