import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';

import { parse } from '../src/wasm-tools.js';
import { COMPONENT_FIXTURES_DIR } from './common.js';
import { getTmpDir } from './helpers.js';
import { transpileBytes, writeFiles } from './transpilation.js';

interface CharComponent {
    echoChar(value: unknown): string;
    charCode(value: unknown): number;
    calls(): number;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `char lowering validates before entering the guest (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                const { files } = await transpileBytes(
                    await parse(await readFile(join(COMPONENT_FIXTURES_DIR, 'char-validation.wat'), 'utf8')),
                    {
                        name: 'chars',
                        instantiation,
                        minify,
                    },
                );
                await writeFiles(files, { baseDir: dir });
                const bindings = await import(pathToFileURL(join(dir, 'chars.js')).href);
                const instance: CharComponent = instantiation
                    ? await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {})
                    : bindings;

                for (const value of [
                    '',
                    'ab',
                    '🚀x',
                    'x🚀',
                    '🚀🚀',
                    'e\u0301',
                    '\ud800',
                    '\udbff',
                    '\udc00',
                    '\udfff',
                    '\udc00\ud800',
                    '\ud800a',
                ]) {
                    assert.throws(() => instance.charCode(value), TypeError, 'not a valid char');
                    assert.throws(() => instance.echoChar(value), TypeError, 'not a valid char');
                }
                for (const value of [undefined, null, 42, {}, new String('a')]) {
                    assert.throws(() => instance.charCode(value), TypeError, 'must be a string');
                }
                assert.strictEqual(instance.calls(), 0);

                const valid = ['\0', 'a', 'é', '\u0301', '\ud7ff', '\ue000', '\uffff', '\u{10000}', '🚀', '\u{10ffff}'];
                for (const value of valid) {
                    assert.strictEqual(instance.charCode(value), value.codePointAt(0));
                    assert.strictEqual(instance.echoChar(value), value);
                }
                assert.strictEqual(instance.calls(), valid.length * 2);
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}
