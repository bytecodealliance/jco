import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, test } from 'vitest';
import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpileBytes, writeFiles } from '../transpilation.js';
import { writeRuntimeProvider } from './helpers.js';

const ADDER = `(component
  (core module $m
    (func (export "add") (param i32 i32) (result i32)
      local.get 0 local.get 1 i32.add))
  (core instance $i (instantiate $m))
  (func (export "add") (param "a" u32) (param "b" u32) (result u32)
    (canon lift (core func $i "add"))))`;

for (const instantiation of ['sync', 'async', undefined] as const) {
    for (const minify of [false, true]) {
        test.concurrent.each([false, true])(
            `named conversions (${instantiation ?? 'direct'}, minify=${minify}, strict=%s)`,
            async (strict) => {
                const dir = await getTmpDir();
                try {
                    const defaults = new URL('intrinsics/conversion.js', defaultRuntimeUrl).href;
                    await writeRuntimeProvider(
                        dir,
                        'conversion',
                        `
export * from ${JSON.stringify(defaults)};
import { toUint32 as defaultToUint32 } from ${JSON.stringify(defaults)};
export const calls = [];
export const contexts = new Set();
export const validations = [];
export function requireValidNumericPrimitive(type, value) {
    validations.push([type, value]);
    throw new Error('a sibling override must not intercept a default function static dependency');
}
export function toUint32(context, value) {
    if (Object.keys(context).join() !== 'strict') throw new Error('broad conversion context');
    contexts.add(context);
    calls.push(value);
    return defaultToUint32(context, value);
}`,
                    );
                    const { files } = await transpileBytes(await parse(ADDER), {
                        name: 'adder',
                        instantiation,
                        minify,
                        strict,
                        cmRuntimeEsModule: './provider/',
                    });
                    await writeFiles(files, { baseDir: dir });
                    const source = await readFile(join(dir, 'adder.js'), 'utf8');
                    assert.notInclude(source, 'function toUint32(');
                    assert.notInclude(source, 'initializeBitcast');
                    assert.notInclude(source, '_jcoRuntimeProvider');
                    const bindings = await import(pathToFileURL(join(dir, 'adder.js')).href);
                    const instantiate = () =>
                        bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                    const instance = instantiation ? await instantiate() : bindings;
                    const selected = await import(pathToFileURL(join(dir, 'provider/intrinsics/conversion.js')).href);
                    assert.strictEqual(instance.add(1, 2), 3);
                    assert.deepEqual(selected.calls, [1, 2]);
                    assert.strictEqual(selected.contexts.size, 1);
                    const [context] = selected.contexts;
                    assert.deepEqual(context, { strict });
                    if (instantiation) {
                        const second = await instantiate();
                        assert.strictEqual(second.add(3, 4), 7);
                        assert.strictEqual(instance.add(5, 6), 11);
                        assert.strictEqual(selected.contexts.size, 2);
                    }
                    assert.deepEqual(selected.validations, []);
                    if (strict) {
                        assert.throws(() => instance.add(-1, 0), TypeError, 'invalid u32');
                    } else {
                        assert.strictEqual(instance.add(-1, 0), 0xffffffff);
                        assert.strictEqual(instance.add('2', 3), 5);
                    }
                } finally {
                    await rm(dir, { recursive: true, force: true });
                }
            },
        );
    }
}
