import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';

import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpileBytes, writeFiles } from '../transpilation.js';
import { writeRuntimeProvider } from './helpers.js';

const COMPONENT = `(component
  (import "webidl:js/global@0.0.1" (instance $host
    (export "is-finite" (func (param "value" f64) (result bool)))))
  (alias export $host "is-finite" (func $is-finite))
  (core func $check (canon lower (func $is-finite)))
  (core module $m
    (import "host" "check" (func $check (param f64) (result i32)))
    (func (export "check") (param f64) (result i32) local.get 0 call $check))
  (core instance $i (instantiate $m
    (with "host" (instance (export "check" (func $check))))))
  (func (export "check") (param "value" f64) (result bool) (canon lift (core func $i "check"))))`;

for (const external of [false, true]) {
    for (const instantiation of ['sync', 'async', undefined] as const) {
        test.concurrent.each([false, true])(
            `WebIDL imports (external=${external}, ${instantiation ?? 'direct'}, minify=%s)`,
            async (minify) => {
                const dir = await getTmpDir();
                try {
                    const defaults = new URL('intrinsics/webidl.js', defaultRuntimeUrl).href;
                    await writeRuntimeProvider(
                        dir,
                        'webidl',
                        `
import * as defaults from ${JSON.stringify(defaults)};
export const state = { calls: 0, initializations: 0, contexts: new Set() };
export function initializeWebIdlProxyCache() {
    state.initializations++;
    return defaults.initializeWebIdlProxyCache();
}
export function globalThisIdlProxy(context) {
    if (Object.keys(context).join() !== 'proxy') throw new Error('broad WebIDL cache context');
    state.calls++;
    state.contexts.add(context);
    return defaults.globalThisIdlProxy(context);
}
`,
                    );
                    const { files } = await transpileBytes(await parse(COMPONENT), {
                        name: 'webidl',
                        instantiation,
                        minify,
                        cmRuntimeEsModule: external ? './provider/' : undefined,
                    });
                    await writeFiles(files, { baseDir: dir });
                    const source = new TextDecoder().decode(files['webidl.js']);
                    if (external) {
                        assert.notInclude(source, 'function globalThisIdlProxy');
                        assert.notInclude(source, 'var idlProxy');
                    }
                    const bindings = await import(pathToFileURL(join(dir, 'webidl.js')).href);
                    if (instantiation) {
                        const instance = await bindings.instantiate(
                            (name: string) => new WebAssembly.Module(files[name]),
                            { 'webidl:js/global': { isFinite: () => false } },
                        );
                        assert.strictEqual(instance.check(42), false);
                    } else {
                        assert.strictEqual(bindings.check(42), true);
                        assert.strictEqual(bindings.check(Infinity), false);
                    }
                    if (external) {
                        const { state } = await import(pathToFileURL(join(dir, 'provider/intrinsics/webidl.js')).href);
                        assert.strictEqual(state.calls, instantiation ? 0 : 1);
                        assert.strictEqual(state.initializations, instantiation ? 0 : 1);
                        if (instantiation) {
                            assert.notInclude(source, '_jcoInitializeWebIdlProxyCache');
                        } else {
                            const second = await import(pathToFileURL(join(dir, 'webidl.js')).href + '?second-store');
                            assert.strictEqual(second.check(42), true);
                            assert.strictEqual(second.check(Infinity), false);
                            assert.strictEqual(state.initializations, 2);
                            assert.strictEqual(state.calls, 2);
                            assert.strictEqual(state.contexts.size, 2);
                            const [firstContext, secondContext] = [...state.contexts];
                            assert.notStrictEqual(firstContext.proxy, secondContext.proxy);
                        }
                    }
                } finally {
                    await rm(dir, { recursive: true, force: true });
                }
            },
        );
    }
}
