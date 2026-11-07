import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, describe, test } from 'vitest';

import { transpileBytes, writeFiles } from './transpilation.js';
import { parse } from '../src/wasm-tools.js';
import { COMPONENT_FIXTURES_DIR } from './common.js';
import { getTmpDir } from './helpers.js';

const FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'escaped-names');

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
