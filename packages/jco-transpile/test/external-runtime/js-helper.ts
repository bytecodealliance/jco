import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, test } from 'vitest';
import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpileBytes, writeFiles } from '../transpilation.js';

const PAIR = `(component
  (core module $m
    (memory (export "memory") 1)
    (func (export "echo") (param $a i32) (param $b i32) (result i32)
      local.get $a i32.eqz if i32.const 1 memory.grow drop end
      i32.const 0 local.get $a i32.store
      i32.const 4 local.get $b i32.store
      i32.const 0))
  (core instance $i (instantiate $m))
  (func (export "echo") (param "a" u32) (param "b" u32) (result (tuple u32 u32))
    (canon lift (core func $i "echo") (memory (core memory $i "memory")))))`;

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `selected live DataView cache (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await mkdir(join(dir, 'runtime/intrinsics'), { recursive: true });
                await writeFile(join(dir, 'package.json'), '{"type":"module"}');
                await writeFile(join(dir, 'runtime/runtime.js'), 'export const CM_RUNTIME_API_VERSION = 1;');
                await writeFile(
                    join(dir, 'runtime/intrinsics/component.js'),
                    'export * from ' + JSON.stringify(new URL('intrinsics/component.js', defaultRuntimeUrl).href) + ';',
                );
                await writeFile(
                    join(dir, 'runtime/intrinsics/error-context.js'),
                    'export * from ' +
                        JSON.stringify(new URL('intrinsics/error-context.js', defaultRuntimeUrl).href) +
                        ';',
                );
                await writeFile(
                    join(dir, 'runtime/intrinsics/waitable.js'),
                    'export * from ' + JSON.stringify(new URL('intrinsics/waitable.js', defaultRuntimeUrl).href) + ';',
                );
                await writeFile(
                    join(dir, 'runtime/intrinsics/core.js'),
                    'export * from ' + JSON.stringify(new URL('intrinsics/core.js', defaultRuntimeUrl).href) + ';',
                );
                await writeFile(
                    join(dir, 'runtime/intrinsics/resource.js'),
                    'export * from ' + JSON.stringify(new URL('intrinsics/resource.js', defaultRuntimeUrl).href) + ';',
                );
                await writeFile(
                    join(dir, 'runtime/intrinsics/conversion.js'),
                    `export * from ${JSON.stringify(new URL('intrinsics/conversion.js', defaultRuntimeUrl).href)};`,
                );
                const defaults = new URL('intrinsics/js-helper.js', defaultRuntimeUrl).href;
                await writeFile(
                    join(dir, 'runtime/intrinsics/js-helper.js'),
                    `
export * from ${JSON.stringify(defaults)};
import { dataView as defaultView, initializeDataViewCache as defaultCache } from ${JSON.stringify(defaults)};
export let initializations = 0;
export const contexts = new Map();
export function initializeDataViewCache() { initializations++; return defaultCache(); }
export function dataView(context, memory) {
    if (Object.keys(context).join() !== 'view') throw new Error('broad cache context');
    const view = defaultView(context, memory);
    if (!contexts.has(context)) contexts.set(context, new Set());
    contexts.get(context).add(view);
    return view;
}`,
                );
                const { files } = await transpileBytes(await parse(PAIR), {
                    name: 'pair',
                    instantiation,
                    minify,
                    cmRuntimeEsModule: './runtime/',
                });
                await writeFiles(files, { baseDir: dir });
                const binding = await import(pathToFileURL(join(dir, 'pair.js')).href);
                const load = (name: string) => new WebAssembly.Module(files[name]);
                const first = instantiation ? await binding.instantiate(load, {}) : binding;
                const selected = await import(pathToFileURL(join(dir, 'runtime/intrinsics/js-helper.js')).href);
                assert.deepEqual(first.echo(42, 7), [42, 7]);
                const [context] = selected.contexts.keys();
                const before = context.view;
                assert.deepEqual(first.echo(0, 24), [0, 24]);
                assert.notStrictEqual(context.view, before);
                assert.strictEqual(selected.contexts.size, 1);
                assert.strictEqual(selected.contexts.get(context).size, 2);
                if (instantiation) {
                    const second = await binding.instantiate(load, {});
                    assert.deepEqual(second.echo(12, 34), [12, 34]);
                    assert.strictEqual(selected.contexts.size, 2);
                    assert.strictEqual(selected.initializations, 2);
                    assert.deepEqual(first.echo(1, 2), [1, 2]);
                } else {
                    assert.strictEqual(selected.initializations, 1);
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}
