import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, describe, expect, test } from 'vitest';

import { transpileBytes, writeFiles } from './transpilation.js';
import type { TranspilationOptions } from '../src/transpile.js';
import { parse } from '../src/wasm-tools.js';
import { COMPONENT_FIXTURES_DIR } from './common.js';
import { getTmpDir } from './helpers.js';

type Mode = 'sync' | 'jspi' | 'wit-async';
const FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'post-return-traps');

async function withFixture(fixture: string, mode: Mode, options: Partial<TranspilationOptions>, check) {
    const outDir = await getTmpDir();
    try {
        const { files } = await transpileBytes(await parse(await readFile(join(FIXTURES_DIR, fixture), 'utf8')), {
            name: 'post-return',
            instantiation: 'async',
            asyncMode: mode === 'sync' ? 'sync' : 'jspi',
            asyncExports: mode === 'jspi' ? ['run'] : [],
            minify: true,
            ...options,
        });
        await writeFiles(files, { baseDir: outDir });
        await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
        const { instantiate } = await import(pathToFileURL(join(outDir, 'post-return.js')).href);
        await check(await instantiate(undefined, {}));
    } finally {
        await rm(outDir, { recursive: true, force: true });
    }
}

async function cleanupFailure(instance, mode: Mode, value = 1): Promise<Error> {
    let error;
    try {
        const result = instance.run(value);
        if (mode !== 'sync') {
            assert.instanceOf(result, Promise);
            await result;
        }
    } catch (err) {
        error = err;
    }
    assert.instanceOf(error, WebAssembly.RuntimeError);
    return error;
}

for (const mode of ['sync', 'jspi', 'wit-async'] as const) {
    describe.skipIf(mode !== 'sync' && typeof WebAssembly.Suspending !== 'function')(`post-return (${mode})`, () => {
        test.concurrent.each(['stack', 'exception'] as const)('locks down after %s in cleanup', async (failure) => {
            await withFixture(
                `${failure}-${mode === 'wit-async' ? 'async' : 'sync'}.wat`,
                mode,
                { bindgenEnableWasmExnref: failure === 'exception' },
                async (instance) => {
                    const result = instance.run(0);
                    if (mode === 'sync') {
                        assert.strictEqual(result, 0);
                    } else {
                        await expect(result).resolves.toBe(0);
                    }
                    assert.strictEqual(instance.ok(), 42);
                    const error = await cleanupFailure(instance, mode);
                    assert.instanceOf(error.cause, failure === 'stack' ? RangeError : WebAssembly.Exception);
                    assert.throws(() => instance.ok(), WebAssembly.RuntimeError, /cannot enter component instance/);
                },
            );
        });

        test.concurrent.each(['unreachable', 'stack'] as const)(
            'locks down a composed callee after %s',
            async (failure) => {
                await withFixture(
                    `composed-${mode === 'wit-async' ? 'async' : 'sync'}.wat`,
                    mode,
                    {},
                    async (instance) => {
                        assert.strictEqual(await instance.run(0), 0);
                        assert.strictEqual(instance.calleeOk(), 42);
                        assert.strictEqual(instance.callerOk(), 43);
                        await cleanupFailure(instance, mode, failure === 'stack' ? 2 : 1);
                        for (const fn of [instance.calleeOk, instance.callerOk]) {
                            assert.throws(fn, WebAssembly.RuntimeError, /cannot enter component instance/);
                        }
                        assert.strictEqual(instance.healthyOk(), 42);
                    },
                );
            },
        );
    });
}

describe.skipIf(typeof WebAssembly.Suspending !== 'function')('async post-return completion', () => {
    test.concurrent('rejects cleanup failures from an async-lowered composed call', async () => {
        await withFixture('async-lowered.wat', 'wit-async', {}, async (instance) => {
            await expect(instance.run(0)).resolves.toBe(0);
            const error = await cleanupFailure(instance, 'wit-async');
            assert.match(error.message, /unreachable/);
            assert.throws(() => instance.ok(), WebAssembly.RuntimeError, /cannot enter component instance/);
        });
    });

    test.concurrent.each([false, true])('preserves result errors (raw payload: %s)', async (rawPayload) => {
        await withFixture(
            'result-async.wat',
            'wit-async',
            { noComponentErrorWrapping: rawPayload },
            async (instance) => {
                await expect(instance.run(0, 0)).resolves.toBe(42);
                const failure = instance.run(1, 0);
                if (rawPayload) {
                    await expect(failure).rejects.toBe(42);
                } else {
                    await expect(failure).rejects.toMatchObject({ payload: 42 });
                }
                assert.strictEqual(instance.ok(), 42);
                await expect(instance.run(1, 1)).rejects.toThrow(/unreachable/);
                assert.throws(() => instance.ok(), WebAssembly.RuntimeError, /cannot enter component instance/);
            },
        );
    });
});
