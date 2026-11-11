/** Public invocation tracking works without adding obligations to runtime providers. */
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

import { assert, test } from 'vitest';

import { getTmpDir, typeCheck } from './helpers.js';
import { transpile, writeFiles } from './transpilation.js';
import { COMPONENT_FIXTURES_DIR, hasJspi } from './common.js';

const FIXTURES_DIR = join(COMPONENT_FIXTURES_DIR, 'call-tracking');

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
    assert.deepEqual(typeCheck([consumer]), []);
}

for (const instantiation of [undefined, 'sync', 'async'] as const) {
    for (const callTracking of [false, true]) {
        test.concurrent(`call tracking surface (${instantiation ?? 'direct'}, enabled=${callTracking})`, async () => {
            const dir = await getTmpDir();
            try {
                const { files } = await transpile(join(FIXTURES_DIR, 'identity.wat'), {
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
        const { files } = await transpile(join(FIXTURES_DIR, 'resources.wat'), {
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

test.skipIf(!hasJspi).concurrent('reentrant host calls keep their own invocation handles', async () => {
    const dir = await getTmpDir();
    try {
        const { files } = await transpile(join(FIXTURES_DIR, 'reentrant.wat'), {
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
            await setTimeout(20);
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
