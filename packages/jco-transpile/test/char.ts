import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';

import { parse } from '../src/wasm-tools.js';
import { getTmpDir } from './helpers.js';
import { transpileBytes, writeFiles } from './transpilation.js';

interface CharComponent {
    echoChar(value: unknown): string;
    charCode(value: unknown): number;
    calls(): number;
}

const COMPONENT = `(component
  (core module $m
    (global $calls (mut i32) (i32.const 0))
    (func (export "char-code") (param i32) (result i32)
      (global.set $calls (i32.add (global.get $calls) (i32.const 1)))
      local.get 0)
    (func (export "calls") (result i32) global.get $calls))
  (core instance $i (instantiate $m))
  (func (export "echo-char") (param "c" char) (result char)
    (canon lift (core func $i "char-code")))
  (func (export "char-code") (param "c" char) (result u32)
    (canon lift (core func $i "char-code")))
  (func (export "calls") (result u32)
    (canon lift (core func $i "calls"))))`;

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `char lowering validates before entering the guest (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                const { files } = await transpileBytes(await parse(COMPONENT), {
                    name: 'chars',
                    instantiation,
                    minify,
                });
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
