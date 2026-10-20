import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';

import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpileBytes, writeFiles } from '../transpilation.js';

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
            `conversion provider (${instantiation ?? 'direct'}, minify=${minify}, strict=%s)`,
            async (strict) => {
                const dir = await getTmpDir();
                try {
                    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                    await writeFile(
                        join(dir, 'provider.js'),
                        `import { runtime as defaultRuntime } from ${JSON.stringify(defaultRuntimeUrl.href)};
export const calls = [];
export const runtime = {
  apiVersion: 1,
  create(options) {
    const instance = defaultRuntime.create(options);
    const conversion = instance.intrinsics.conversion;
    return {
      ...instance,
      intrinsics: {
        ...instance.intrinsics,
        conversion: {
          ...conversion,
          marker: 42,
          toUint32(value) {
            if (this.marker !== 42) throw new Error('lost conversion receiver');
            calls.push(value);
            return conversion.toUint32(value);
          }
        }
      }
    };
  }
};`,
                    );
                    const { files } = await transpileBytes(await parse(ADDER), {
                        name: 'adder',
                        instantiation,
                        minify,
                        strict,
                        cmRuntimeEsModule: './provider.js',
                    });
                    await writeFiles(files, { baseDir: dir });
                    const source = await readFile(join(dir, 'adder.js'), 'utf8');
                    assert.notInclude(source, 'function toUint32(');
                    const bindings = await import(pathToFileURL(join(dir, 'adder.js')).href);
                    const instance = instantiation
                        ? await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {})
                        : bindings;
                    const provider = await import(pathToFileURL(join(dir, 'provider.js')).href);
                    assert.strictEqual(instance.add(1, 2), 3);
                    assert.deepEqual(provider.calls, [1, 2]);
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
