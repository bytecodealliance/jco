/** Public invocation tracking works without adding obligations to runtime providers. */
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';
import ts from 'typescript-compiler-api';

import { getTmpDir } from './helpers.js';
import { transpileBytes, writeFiles } from './transpilation.js';
import { parse } from '../src/wasm-tools.js';

const IDENTITY = `(component
    (core module $m (func (export "run") (param i32) (result i32) (local.get 0)))
    (core instance $i (instantiate $m))
    (func (export "run") (param "value" u32) (result u32) (canon lift (core func $i "run"))))`;

/** Compile a consumer to verify opt-in surface, argument inference and outcome narrowing. */
async function checkTypes(dir: string, instantiation: string | undefined, enabled: boolean) {
    const consumer = join(dir, 'consumer.mts');
    await writeFile(
        consumer,
        `import * as component from './component.js';
        declare const getCoreModule: (path: string) => WebAssembly.Module;
        ${instantiation ? 'const instance = await component.instantiate(getCoreModule, {});' : 'const instance = component;'}
        ${
            enabled
                ? `
        const call = instance._util.calls.start(instance.run, 42);
        const value: number = call.result;
        const completion = await call.finished;
        if (completion.status === 'trapped') { const error: Error = completion.error; }
        // @ts-expect-error Arguments match the selected export.
        instance._util.calls.start(instance.run, 'wrong');
        // @ts-expect-error Runtime tasks are private.
        call.task;
        // @ts-expect-error Handles are read-only.
        call.result = 0;
        `
                : `// @ts-expect-error Tracking is absent unless explicitly enabled.
        instance._util.calls;`
        }
        // @ts-expect-error Ambient task-group lookup is not public.
        instance._util.lastTaskGroup();
        // @ts-expect-error Whole-instance waiting takes no selection.
        instance._util.whenIdle([]);
    `,
    );
    const program = ts.createProgram([consumer], {
        noEmit: true,
        strict: true,
        types: [],
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
    });
    assert.deepEqual(
        ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
        [],
    );
}

for (const instantiation of [undefined, 'sync', 'async'] as const) {
    for (const callTracking of [false, true]) {
        test.concurrent(`call tracking surface (${instantiation ?? 'direct'}, enabled=${callTracking})`, async () => {
            const dir = await getTmpDir();
            try {
                const { files } = await transpileBytes(await parse(IDENTITY), {
                    name: 'component',
                    instantiation,
                    callTracking,
                });
                await writeFiles(files, { baseDir: dir });
                await writeFile(join(dir, 'package.json'), '{"type":"module"}');
                const bindings = await import(pathToFileURL(join(dir, 'component.js')).href);
                const instance = instantiation
                    ? await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {})
                    : bindings;
                assert.strictEqual(instance.run(7), 7);
                if (callTracking) {
                    const call = instance._util.calls.start(instance.run, 42);
                    assert.strictEqual(call.result, 42);
                    assert.deepEqual(await call.finished, { status: 'completed' });
                    assert.isTrue(Object.isFrozen(await call.finished));
                    // Canonical lowering fails before entering Wasm, without poisoning the instance.
                    assert.throws(() => instance._util.calls.start(instance.run, Symbol('invalid')), TypeError);
                    const next = instance._util.calls.start(instance.run, 9);
                    assert.strictEqual(next.result, 9);
                    assert.deepEqual(await next.finished, { status: 'completed' });
                } else {
                    assert.notProperty(instance._util, 'calls');
                    assert.notInclude(new TextDecoder().decode(files['component.js']), 'CALL_TRACKING');
                }
                await checkTypes(dir, instantiation, callTracking);
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });
    }
}

test.concurrent('tracked resource constructors and methods preserve their receiver', async () => {
    const dir = await getTmpDir();
    try {
        const component = `(component
            (component $api
            (type $r (resource (rep i32)))
            (core func $new (canon resource.new $r))
            (core module $m
                (import "" "new" (func $new (param i32) (result i32)))
                (func (export "new") (param i32) (result i32) (call $new (local.get 0)))
                (func (export "get") (param i32) (result i32) (local.get 0)))
            (core instance $i (instantiate $m (with "" (instance (export "new" (func $new))))))
            (export $thing "thing" (type $r))
            (func (export "[constructor]thing") (param "value" u32) (result (own $thing))
                (canon lift (core func $i "new")))
            (func (export "[method]thing.get") (param "self" (borrow $thing)) (result u32)
                (canon lift (core func $i "get")))
            )
            (instance $api (instantiate $api))
            (export "api" (instance $api)))`;
        const { files } = await transpileBytes(await parse(component), {
            name: 'component',
            instantiation: 'sync',
            callTracking: true,
            minify: true,
        });
        await writeFiles(files, { baseDir: dir });
        await writeFile(join(dir, 'package.json'), '{"type":"module"}');
        const bindings = await import(pathToFileURL(join(dir, 'component.js')).href);
        const instance = bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
        const constructed = instance._util.calls.start(instance.api.Thing, 42);
        const resource = constructed.result;
        assert.deepEqual(await constructed.finished, { status: 'completed' });
        const call = instance._util.calls.startWithThis(resource, resource.get);
        assert.strictEqual(call.result, 42);
        assert.deepEqual(await call.finished, { status: 'completed' });
        resource[Symbol.dispose]();
        instance._util.stop();
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent('reentrant host calls keep their own invocation handles', async () => {
    const dir = await getTmpDir();
    try {
        const component = `(component
            (import "notify" (func $notify))
            (import "wait" (func $wait async))
            (component $outer
                (import "notify" (func $notify))
                (core func $notify (canon lower (func $notify)))
                (core module $m
                    (import "" "notify" (func $notify))
                    (func (export "run") (result i32) (call $notify) (i32.const 7)))
                (core instance $i (instantiate $m (with "" (instance (export "notify" (func $notify))))))
                (func (export "run") (result u32) (canon lift (core func $i "run"))))
            (component $inner
                (import "wait" (func $wait async))
                (core func $wait (canon lower (func $wait)))
                (core module $m
                    (import "" "wait" (func $wait))
                    (func (export "run") (call $wait)))
                (core instance $i (instantiate $m (with "" (instance (export "wait" (func $wait))))))
                (func (export "run") async (canon lift (core func $i "run"))))
            (instance $outer (instantiate $outer (with "notify" (func $notify))))
            (instance $inner (instantiate $inner (with "wait" (func $wait))))
            (export "outer" (instance $outer))
            (export "inner" (instance $inner)))`;
        const { files } = await transpileBytes(await parse(component), {
            name: 'component',
            instantiation: 'async',
            callTracking: true,
        });
        await writeFiles(files, { baseDir: dir });
        await writeFile(join(dir, 'package.json'), '{"type":"module"}');
        const bindings = await import(pathToFileURL(join(dir, 'component.js')).href);
        let release!: () => void;
        const wait = new Promise<void>((resolve) => {
            release = resolve;
        });
        let child: { result: Promise<void>; finished: Promise<{ status: string }> };
        const instance = await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {
            notify: {
                default() {
                    child = instance._util.calls.start(instance.inner.run);
                },
            },
            wait: {
                default() {
                    return wait;
                },
            },
        });
        try {
            const parent = instance._util.calls.start(instance.outer.run);
            assert.strictEqual(parent.result, 7);
            assert.deepEqual(await parent.finished, { status: 'completed' });
            let childFinished = false;
            child!.finished.then(() => {
                childFinished = true;
            });
            await new Promise((resolve) => setTimeout(resolve, 20));
            assert.isFalse(childFinished);
            release();
            await child!.result;
            assert.deepEqual(await child!.finished, { status: 'completed' });
        } finally {
            release();
            instance._util.stop();
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
