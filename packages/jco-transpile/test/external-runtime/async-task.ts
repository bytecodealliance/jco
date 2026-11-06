import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assert, expect, test } from 'vitest';
import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, transpileBytes, writeFiles } from '../transpilation.js';

const fixture = fileURLToPath(new URL('../fixtures/components/p3/context-resource-drop.wat', import.meta.url));
const taskUrl = new URL('intrinsics/async-task.js', defaultRuntimeUrl).href;
const execAsync = promisify(execFile);

test.concurrent.each([false, true])('symmetric entry preserves its callback receiver (jspi=%s)', async (jspi) => {
    const dir = await getTmpDir();
    try {
        await writeProvider(
            dir,
            `import * as defaults from ${JSON.stringify(taskUrl)};
export * from ${JSON.stringify(taskUrl)};
export function symmetricSyncGuestCallEnter(context, ...args) {
 if (args[0] === -99) {
  if (this !== ${jspi ? 'null' : 'undefined'}) throw new Error('lost symmetric entry callback receiver');
  return 42;
 }
 return defaults.symmetricSyncGuestCallEnter(context, ...args);
}`,
        );
        const { files } = await transpile(
            fileURLToPath(new URL('../fixtures/components/p3/context-fused.wat', import.meta.url)),
            {
                name: 'receiver',
                instantiation: 'sync',
                asyncMode: jspi ? 'jspi' : undefined,
                asyncImports: jspi ? ['pause'] : [],
                asyncExports: jspi ? ['run'] : [],
                cmRuntimeEsModule: './provider/',
            },
        );
        const source = new TextDecoder().decode(files['receiver.js']);
        // Exercise the actual emitted partial application. The slow wrapper
        // invokes its callback with apply(null, args); the plain core import
        // binds the direct-call receiver. Neither path may lose its context.
        const callback = source.match(/_symmetricSyncGuestCallEnter\.bind\([^)]*\)/)?.[0];
        assert.isString(callback);
        const exports = 'return { postCount, run,  };';
        assert.include(source, exports);
        files['receiver.js'] = new TextEncoder().encode(
            source.replace(exports, `return { testCallback: () => (${callback}).apply(null, [-99, false, 0]) };`),
        );
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'receiver.js')).href);
        const instance = await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {
            pause: { default() {} },
        });
        assert.strictEqual(instance.testCallback(), 42);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

async function writeProvider(dir: string, source: string) {
    await writeFile(join(dir, 'package.json'), '{"type":"module"}');
    await mkdir(join(dir, 'provider/intrinsics'), { recursive: true });
    await writeFile(join(dir, 'provider/runtime.js'), 'export const CM_RUNTIME_API_VERSION = 1;');
    for (const suffix of [
        'conversion',
        'js-helper',
        'string',
        'webidl',
        'resource',
        'core',
        'component',
        'waitable',
        'error-context',
        'host',
    ]) {
        await writeFile(
            join(dir, 'provider/intrinsics/' + suffix + '.js'),
            'export * from ' + JSON.stringify(new URL('intrinsics/' + suffix + '.js', defaultRuntimeUrl).href) + ';',
        );
    }
    await writeFile(join(dir, 'provider/intrinsics/async-task.js'), source);
}

function providerSource() {
    return `import * as defaults from ${JSON.stringify(taskUrl)};
export * from ${JSON.stringify(taskUrl)};
export const calls = [], classes = [], subclasses = [], maps = [], ids = [], components = [], contexts = [], initialIDs = [];
export let futureReads = 0;
export function initializeTasksByComponent() { const owner = defaults.initializeTasksByComponent(); maps.push(owner); return owner; }
export function initializeCurrentTaskIds() { const owner = defaults.initializeCurrentTaskIds(); ids.push(owner); return owner; }
export function initializeCurrentComponentIdxs() { const owner = defaults.initializeCurrentComponentIdxs(); components.push(owner); return owner; }
export function initializeAsyncSubtaskClass(context) {
 if (this !== undefined || Object.keys(context).sort().join() !== 'RuntimeError,disposeSymbol,lookup,memories') throw new Error('invalid subtask class capabilities');
 const constructor = defaults.initializeAsyncSubtaskClass(context); subclasses.push(constructor); return constructor;
}
export function initializeAsyncTaskClass(context) {
 if (this !== undefined || Object.keys(context).sort().join() !== 'AsyncSubtask,RuntimeError,Waitable,clearing,determinism,events,isFutureValue,lookup,postReturn,registers,scopeCounter,scopeTasks,traps') throw new Error('invalid task class capabilities');
 if (!subclasses.includes(context.AsyncSubtask) || !maps.includes(context.clearing.tasks) || !ids.includes(context.clearing.taskIds) || !components.includes(context.clearing.componentIdxs)) throw new Error('detached task owners');
 contexts.push(context);
 const constructor = defaults.initializeAsyncTaskClass({ ...context, isFutureValue(value) { futureReads++; return context.isFutureValue(value); } });
 initialIDs.push(constructor._ID); classes.push(constructor); return constructor;
}
function checkLookup(context) {
 if (!maps.includes(context.tasks) || !contexts.some(selected => selected.registers === context.registers)) throw new Error('detached task lookup');
}
export function createNewCurrentImplicitThread(context, options) {
 if (this !== undefined || Object.keys(context).sort().join() !== 'AsyncTask,AsyncThread,componentIdxs,taskIds,tasks' || !classes.includes(context.AsyncTask)) throw new Error('invalid task creation');
 calls.push('create'); return defaults.createNewCurrentImplicitThread(context, options);
}
export function clearCurrentThread(context, ...args) {
 if (this !== undefined || Object.keys(context).sort().join() !== 'componentIdxs,taskIds,tasks') throw new Error('invalid task clearing');
 calls.push('clear'); return defaults.clearCurrentThread(context, ...args);
}
export function contextGet(context, options) {
 if (this !== null || Object.keys(context).sort().join() !== 'lookup,registers') throw new Error('lost context.get receiver/capabilities');
 if (!contexts.some(selected => selected.lookup === context.lookup && selected.registers === context.registers)) throw new Error('detached thread lookup'); calls.push('get'); return defaults.contextGet(context, options);
}
export function contextSet(context, options, value) {
 if (this !== null || Object.keys(context).sort().join() !== 'lookup,registers') throw new Error('lost context.set receiver/capabilities');
 if (!contexts.some(selected => selected.lookup === context.lookup && selected.registers === context.registers)) throw new Error('detached thread lookup'); calls.push('set'); return defaults.contextSet(context, options, value);
}
// Defaults compose their own state-based dependency; a sibling override must
// not implicitly intercept context.get/set or resource destructor operations.
export function getCurrentTask() { throw new Error('unexpected sibling lookup override'); }
`;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `named task provider (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeProvider(dir, providerSource());
                const { files } = await transpile(fixture, {
                    name: 'tasks',
                    instantiation,
                    minify,
                    cmRuntimeEsModule: './provider/',
                });
                const source = new TextDecoder().decode(files['tasks.js']);
                if (!minify) {
                    for (const omitted of [
                        'class AsyncTask',
                        'class AsyncSubtask',
                        'function createNewCurrentImplicitThread(',
                        'function getCurrentTask(',
                        'getTask: (componentIdx, taskID) =>',
                        'createTask: args =>',
                    ]) {
                        assert.notInclude(source, omitted);
                    }
                    assert.include(source, 'value => value instanceof FutureValue');
                    assert.include(source, 'scopeCounter: _jcoResourceScopeCounterContext');
                }
                await writeFiles(files, { baseDir: dir });
                const bindings = await import(pathToFileURL(join(dir, 'tasks.js')).href);
                const provider = await import(pathToFileURL(join(dir, 'provider/intrinsics/async-task.js')).href);
                const instantiate = () =>
                    bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                const instances = instantiation ? [await instantiate(), await instantiate()] : [bindings];
                assert.lengthOf(provider.classes, instances.length);
                assert.lengthOf(provider.subclasses, instances.length);
                assert.deepEqual(
                    provider.initialIDs,
                    instances.map(() => 0n),
                );
                assert.strictEqual(provider.futureReads, 0);
                for (const [index, instance] of instances.entries()) {
                    const context = provider.contexts[index];
                    const initialScopes = [...context.scopeTasks.keys()];
                    context.scopeCounter.value = 100;
                    for (let round = 1; round <= 3; round++) {
                        instance.run();
                        assert.strictEqual(instance.drops(), round);
                        assert.isAbove(context.scopeCounter.value, 100);
                        assert.deepEqual([...context.scopeTasks.keys()], initialScopes);
                        assert.strictEqual(provider.ids[index].length, 0);
                        assert.strictEqual(provider.components[index].length, 0);
                        assert.strictEqual([...provider.maps[index].values()].flat().length, 0);
                    }
                }
                assert.includeMembers(provider.calls, ['create', 'get', 'set']);
                if (instances.length === 2) {
                    assert.notStrictEqual(provider.classes[0], provider.classes[1]);
                    assert.notStrictEqual(provider.subclasses[0], provider.subclasses[1]);
                    assert.notStrictEqual(provider.maps[0], provider.maps[1]);
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}

test.concurrent.each([
    'initializeAsyncTaskClass',
    'initializeAsyncSubtaskClass',
    'initializeTasksByComponent',
    'contextGet',
])('native ESM rejects a missing task export: %s', async (missing) => {
    const dir = await getTmpDir();
    try {
        const defaults = await import(taskUrl);
        const names = Object.keys(defaults).filter((name) => name !== missing);
        await writeProvider(dir, `export { ${names.join(', ')} } from ${JSON.stringify(taskUrl)};`);
        const { files } = await transpile(fixture, {
            name: 'missing',
            instantiation: 'sync',
            cmRuntimeEsModule: './provider/',
        });
        await writeFiles(files, { baseDir: dir });
        await expect(execAsync(process.execPath, [join(dir, 'missing.js')])).rejects.toThrow(missing);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent.each([false, true])(
    'initialization imports retire their task with named owners (external=%s)',
    async (external) => {
        const dir = await getTmpDir();
        try {
            const component = `(component
 (import "host" (instance $host (export "echo" (func (param "value" u32) (result u32)))))
 (core func $echo (canon lower (func $host "echo")))
 (core module $m
  (import "" "echo" (func $echo (param i32) (result i32)))
  (func (export "echo") (param i32) (result i32) (call $echo (local.get 0))))
 (core instance $m (instantiate $m (with "" (instance (export "echo" (func $echo))))))
 (func (export "echo") (param "value" u32) (result u32) (canon lift (core func $m "echo")))
)`;
            const { files } = await transpileBytes(await parse(component), {
                name: 'init',
                map: { host: './host.js' },
                cmRuntimeEsModule: external ? defaultRuntimeUrl.href : undefined,
            });
            const context = external ? '_jcoTaskCompatImportContext, ' : '';
            files['init.js'] = new TextEncoder().encode(
                new TextDecoder().decode(files['init.js']) +
                    `
export function testInitialization() {
 INSTANCE_FLAGS.set(99, { value: 1 });
 const result = _lowerImportBackwardsCompat(${context}{
  componentIdx: 99, isAsync: false, funcTypeIsAsync: false, getMemoryFn: () => undefined,
  importFn(value) {
   ASYNC_TASKS_BY_COMPONENT_IDX.get(99).at(-1).task.currentSubtask().onResolve(value);
   return value;
  }
 }, 23);
 if (ASYNC_TASKS_BY_COMPONENT_IDX.get(99).length !== 0) throw new Error('initialization task was not retired');
 return result;
}
`,
            );
            await writeFile(join(dir, 'package.json'), '{"type":"module"}');
            await writeFile(join(dir, 'host.js'), 'export const echo = value => value;\n');
            await writeFiles(files, { baseDir: dir });
            const bindings = await import(pathToFileURL(join(dir, 'init.js')).href);
            assert.strictEqual(bindings.testInitialization(), 23);
            assert.strictEqual(bindings.echo(42), 42);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);
