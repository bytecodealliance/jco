import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';

import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpileBytes, writeFiles } from '../transpilation.js';

function echo(encoding: 'utf8' | 'utf16') {
    return `(component
      (core module $m
        (memory (export "memory") 1)
        (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 1024)
        (func (export "echo") (param i32 i32) (result i32)
          (i32.store (i32.const 0) (local.get 0))
          (i32.store (i32.const 4) (local.get 1))
          i32.const 0)
        (func (export "char") (param i32) (result i32) local.get 0))
      (core instance $i (instantiate $m))
      (alias core export $i "memory" (core memory $mem))
      (alias core export $i "realloc" (core func $realloc))
      (func (export "echo") (param "s" string) (result string)
        (canon lift (core func $i "echo") string-encoding=${encoding}
          (memory $mem) (realloc (core func $realloc))))
      (func (export "char") (param "c" char) (result char)
        (canon lift (core func $i "char"))))`;
}

function providerSource() {
    const defaults = new URL('intrinsics/string.js', defaultRuntimeUrl).href;
    return `export * from ${JSON.stringify(defaults)};
import * as defaults from ${JSON.stringify(defaults)};
export const calls = [];
export const codecs = new Map();
function wrap(kind, codec, methods) {
 const selected = { marker: kind };
 for (const method of methods) selected[method] = function(...args) {
   if (this !== selected) throw new Error('lost codec object receiver');
   calls.push(kind + '.' + method);
   return codec[method](...args);
 };
 codecs.set(selected, kind);
 return selected;
}
export function initializeUtf8Decoder() { return wrap('utf8Decoder', defaults.initializeUtf8Decoder(), ['decode']); }
export function initializeUtf16Decoder() { return wrap('utf16Decoder', defaults.initializeUtf16Decoder(), ['decode']); }
export function initializeUtf8Encoder() { return wrap('utf8Encoder', defaults.initializeUtf8Encoder(), ['encode', 'encodeInto']); }
export function utf8Encode(encoder, ...args) { calls.push('utf8Encode'); return defaults.utf8Encode(encoder, ...args); }
export function utf8EncodeAsync(encoder, ...args) { calls.push('utf8EncodeAsync'); return defaults.utf8EncodeAsync(encoder, ...args); }
export function utf16Encode(context, ...args) { calls.push('utf16Encode'); return defaults.utf16Encode(context, ...args); }
export function utf16EncodeAsync(context, ...args) { calls.push('utf16EncodeAsync'); return defaults.utf16EncodeAsync(context, ...args); }
export function validateHostChar(...args) { calls.push('validateHostChar'); return defaults.validateHostChar(...args); }
export function validateGuestChar(...args) { calls.push('validateGuestChar'); return defaults.validateGuestChar(...args); }
`;
}

async function writeProvider(dir: string) {
    await mkdir(join(dir, 'provider/intrinsics'), { recursive: true });
    await writeFile(join(dir, 'provider/runtime.js'), 'export const CM_RUNTIME_API_VERSION = 1;');
    await writeFile(
        join(dir, 'provider/intrinsics/component.js'),
        'export * from ' + JSON.stringify(new URL('intrinsics/component.js', defaultRuntimeUrl).href) + ';',
    );
    await writeFile(
        join(dir, 'provider/intrinsics/error-context.js'),
        'export * from ' + JSON.stringify(new URL('intrinsics/error-context.js', defaultRuntimeUrl).href) + ';',
    );
    await writeFile(
        join(dir, 'provider/intrinsics/async-task.js'),
        'export * from ' + JSON.stringify(new URL('intrinsics/async-task.js', defaultRuntimeUrl).href) + ';',
    );
    await writeFile(
        join(dir, 'provider/intrinsics/host.js'),
        'export * from ' + JSON.stringify(new URL('intrinsics/host.js', defaultRuntimeUrl).href) + ';',
    );
    await writeFile(
        join(dir, 'provider/intrinsics/waitable.js'),
        'export * from ' + JSON.stringify(new URL('intrinsics/waitable.js', defaultRuntimeUrl).href) + ';',
    );
    await writeFile(
        join(dir, 'provider/intrinsics/core.js'),
        'export * from ' + JSON.stringify(new URL('intrinsics/core.js', defaultRuntimeUrl).href) + ';',
    );
    for (const suffix of ['conversion', 'js-helper', 'resource']) {
        await writeFile(
            join(dir, 'provider/intrinsics/' + suffix + '.js'),
            'export * from ' + JSON.stringify(new URL('intrinsics/' + suffix + '.js', defaultRuntimeUrl).href) + ';',
        );
    }
    await writeFile(join(dir, 'provider/intrinsics/string.js'), providerSource());
}

for (const encoding of ['utf8', 'utf16'] as const) {
    for (const instantiation of ['sync', 'async', undefined] as const) {
        test.concurrent.each([false, true])(
            `string provider (${encoding}, ${instantiation ?? 'direct'}, minify=%s)`,
            async (minify) => {
                const dir = await getTmpDir();
                try {
                    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                    await writeProvider(dir);
                    const { files } = await transpileBytes(await parse(echo(encoding)), {
                        name: 'strings',
                        instantiation,
                        minify,
                        cmRuntimeEsModule: './provider/',
                    });
                    await writeFiles(files, { baseDir: dir });
                    const source = new TextDecoder().decode(files['strings.js']);
                    assert.notInclude(source, 'new TextDecoder(');
                    assert.notInclude(source, 'new TextEncoder(');
                    assert.notInclude(source, 'function _utf8AllocateAndEncode(');
                    assert.notInclude(source, 'function _utf16AllocateAndEncode(');
                    const bindings = await import(pathToFileURL(join(dir, 'strings.js')).href);
                    const instance = instantiation
                        ? await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {})
                        : bindings;
                    const provider = await import(pathToFileURL(join(dir, 'provider/intrinsics/string.js')).href);
                    for (const s of ['', 'café 中文 🚀', '\ufeffbom', '\ud800x\udc00']) {
                        assert.strictEqual(instance.echo(s), s.toWellFormed());
                    }
                    assert.strictEqual(instance.char('🚀'), '🚀');
                    assert.include(provider.calls, `${encoding}Encode`);
                    assert.include(provider.calls, `${encoding}Decoder.decode`);
                    assert.include(provider.calls, 'validateHostChar');
                    assert.include(provider.calls, 'validateGuestChar');
                    assert.strictEqual(
                        [...provider.codecs.values()].filter((kind) => kind === encoding + 'Decoder').length,
                        1,
                    );
                    if (encoding === 'utf8') {
                        assert.include(provider.calls, 'utf8Encoder.encodeInto');
                    } else {
                        assert.notInclude([...provider.codecs.values()], 'utf8Encoder');
                    }
                    if (instantiation) {
                        const second = await bindings.instantiate(
                            (name: string) => new WebAssembly.Module(files[name]),
                            {},
                        );
                        assert.strictEqual(second.echo('second'), 'second');
                        assert.strictEqual(
                            [...provider.codecs.values()].filter((kind) => kind === encoding + 'Decoder').length,
                            2,
                        );
                        assert.strictEqual(instance.echo('first'), 'first');
                    }
                } finally {
                    await rm(dir, { recursive: true, force: true });
                }
            },
        );
    }
}

test.concurrent('transcoding calls custom UTF-8 encoder objects', async () => {
    const dir = await getTmpDir();
    try {
        await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeProvider(dir);
        const component = await readFile(
            new URL('../fixtures/components/runtime/string-transcoding.component.wat', import.meta.url),
            'utf8',
        );
        const { files } = await transpileBytes(await parse(component), {
            name: 'transcoding',
            instantiation: 'sync',
            cmRuntimeEsModule: './provider/',
        });
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'transcoding.js')).href);
        const instance = bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
        const provider = await import(pathToFileURL(join(dir, 'provider/intrinsics/string.js')).href);
        assert.strictEqual(instance.utf16ViaUtf8.echo('café 🚀'), 'café 🚀');
        assert.include(provider.calls, 'utf8Encoder.encodeInto');
        assert.include(provider.calls, 'utf16Decoder.decode');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
