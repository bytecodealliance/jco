import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, describe, test } from 'vitest';

import { transpileBytes, writeFiles } from '../src/index.js';
import { parse } from '../src/wasm-tools.js';
import { getTmpDir } from './helpers.js';

describe.each([false, true])('asm.js core exports (minify: %s)', (minify) => {
    test.concurrent.each([
        '$value',
        '0',
        'return',
        'quoted"slash\\line\n',
        '\u00e9',
        'caf\u00e9',
        '\u6f22\u5b57',
        '\ud83d\ude00run',
        'run\ud83d\ude00',
        'line\u2028\u2029',
    ])('preserves the core export name %j', async (name) => {
        const outDir = await getTmpDir();
        try {
            // WAT byte escapes preserve the exact UTF-8 name, including quotes and controls.
            const quoted = `"${Array.from(Buffer.from(name), (byte) => `\\${byte.toString(16).padStart(2, '0')}`).join('')}"`;
            const component = await parse(`(component
                (core module $m (func (export ${quoted}) (result i32) i32.const 42))
                (core instance $i (instantiate $m))
                (func (export "run") (result u32) (canon lift (core func $i ${quoted}))))`);
            const { files } = await transpileBytes(component, {
                name: 'asm-export-name',
                js: true,
                instantiation: 'sync',
                minify,
            });
            await writeFiles(files, { baseDir: outDir });
            await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
            const { instantiate } = await import(pathToFileURL(join(outDir, 'asm-export-name.js')).href);
            assert.strictEqual(instantiate({}).run(), 42);
        } finally {
            await rm(outDir, { recursive: true, force: true });
        }
    });
});
