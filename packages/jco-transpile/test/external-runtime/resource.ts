import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';

import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';

const fixture = fileURLToPath(new URL('../fixtures/components/p3/context-resource-drop.wat', import.meta.url));

function providerSource() {
    const url = new URL('intrinsics/resource.js', defaultRuntimeUrl).href;
    return `import * as defaults from ${JSON.stringify(url)};
export * from ${JSON.stringify(url)};
export const counters = [], scopeMaps = [], tables = [], calls = [];
export function initializeResourceScopeCounter() { const state = defaults.initializeResourceScopeCounter(); counters.push(state); return state; }
export function initializeResourceScopeTasks() { const state = defaults.initializeResourceScopeTasks(); scopeMaps.push(state); return state; }
export function initializeHandleTables() { const state = defaults.initializeHandleTables(); tables.push(state); return state; }
export function callDestructor(context, args) {
  if (Object.keys(context).sort().join() !== 'creation,registers') throw new Error('broad destructor context');
  if (Object.keys(context.creation).sort().join() !== 'AsyncTask,AsyncThread,componentIdxs,taskIds,tasks' || typeof context.creation.AsyncTask !== 'function') throw new Error('detached task creation owners');
  calls.push('callDestructor'); return defaults.callDestructor(context, args);
}
export function tableRemove(context, table, handle) {
  if (Object.keys(context).sort().join() !== 'RuntimeError,indexSpaces,scopeTasks') throw new Error('broad removal context');
  calls.push('tableRemove'); return defaults.tableRemove(context, table, handle);
}`;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `resource provider shares task state (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                await mkdir(join(dir, 'provider/intrinsics'), { recursive: true });
                await writeFile(join(dir, 'provider/runtime.js'), 'export const CM_RUNTIME_API_VERSION = 1;');
                await writeFile(
                    join(dir, 'provider/intrinsics/component.js'),
                    'export * from ' + JSON.stringify(new URL('intrinsics/component.js', defaultRuntimeUrl).href) + ';',
                );
                await writeFile(
                    join(dir, 'provider/intrinsics/error-context.js'),
                    'export * from ' +
                        JSON.stringify(new URL('intrinsics/error-context.js', defaultRuntimeUrl).href) +
                        ';',
                );
                await writeFile(
                    join(dir, 'provider/intrinsics/async-task.js'),
                    'export * from ' +
                        JSON.stringify(new URL('intrinsics/async-task.js', defaultRuntimeUrl).href) +
                        ';',
                );
                await writeFile(
                    join(dir, 'provider/intrinsics/waitable.js'),
                    'export * from ' + JSON.stringify(new URL('intrinsics/waitable.js', defaultRuntimeUrl).href) + ';',
                );
                await writeFile(
                    join(dir, 'provider/intrinsics/core.js'),
                    'export * from ' + JSON.stringify(new URL('intrinsics/core.js', defaultRuntimeUrl).href) + ';',
                );
                for (const suffix of ['conversion', 'js-helper', 'string', 'webidl']) {
                    await writeFile(
                        join(dir, 'provider/intrinsics/' + suffix + '.js'),
                        'export * from ' +
                            JSON.stringify(new URL('intrinsics/' + suffix + '.js', defaultRuntimeUrl).href) +
                            ';',
                    );
                }
                await writeFile(join(dir, 'provider/intrinsics/resource.js'), providerSource());
                const { files } = await transpile(fixture, {
                    name: 'resources',
                    instantiation,
                    minify,
                    cmRuntimeEsModule: './provider/',
                });
                await writeFiles(files, { baseDir: dir });
                if (!minify) {
                    const source = new TextDecoder().decode(files['resources.js']);
                    assert.notInclude(source, 'function rscTableRemove(');
                    assert.notInclude(source, 'function callResourceDestructor(');
                    assert.include(source, 'const HANDLE_TABLES = _jcoInitializeHandleTables();');
                    assert.notInclude(source, 'let RESOURCE_SCOPE_ID =');
                    assert.include(source, 'scopeCounter: _jcoResourceScopeCounterContext');
                    assert.notInclude(source, 'class AsyncTask');
                }
                const bindings = await import(pathToFileURL(join(dir, 'resources.js')).href);
                const provider = await import(pathToFileURL(join(dir, 'provider/intrinsics/resource.js')).href);
                const instantiate = () =>
                    bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                const instances = instantiation ? [await instantiate(), await instantiate()] : [bindings];
                assert.lengthOf(provider.counters, instances.length);
                for (const [index, instance] of instances.entries()) {
                    const counter = provider.counters[index];
                    const scopeTasks = provider.scopeMaps[index];
                    const initialScopes = [...scopeTasks.keys()];
                    counter.value = 100;
                    for (let round = 1; round <= 3; round++) {
                        // The guest traps if its destructor inherits the caller's context
                        // or fails to restore that context after it returns.
                        instance.run();
                        assert.strictEqual(instance.drops(), round * 2 - 1);
                        const resource: Disposable = instance.api.make();
                        resource[Symbol.dispose]();
                        resource[Symbol.dispose]();
                        assert.strictEqual(instance.drops(), round * 2);
                    }
                    assert.isAbove(counter.value, 100);
                    assert.deepEqual([...scopeTasks.keys()], initialScopes);
                }
                assert.include(provider.calls, 'callDestructor');
                assert.include(provider.calls, 'tableRemove');
                if (instances.length === 2) {
                    assert.notStrictEqual(provider.counters[0], provider.counters[1]);
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}
