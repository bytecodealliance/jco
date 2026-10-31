import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assert, expect, test } from 'vitest';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';

const hostUrl = new URL('intrinsics/host.js', defaultRuntimeUrl).href;
const execAsync = promisify(execFile);
function fixture(name: string) {
    return fileURLToPath(new URL(`../fixtures/components/p3/${name}.wat`, import.meta.url));
}
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
        'async-task',
        'lift',
        'lower',
        'future',
        'stream',
    ]) {
        await writeFile(
            join(dir, 'provider/intrinsics/' + suffix + '.js'),
            'export * from ' + JSON.stringify(new URL('intrinsics/' + suffix + '.js', defaultRuntimeUrl).href) + ';',
        );
    }
    await writeFile(join(dir, 'provider/intrinsics/host.js'), source);
}
function providerSource() {
    return `import * as defaults from ${JSON.stringify(hostUrl)};
export * from ${JSON.stringify(hostUrl)};
export const calls = [], prepared = [], contexts = [];
const owners = new WeakMap();
function observe(key, context, keys, receiver) {
 if (receiver !== null) throw new Error('lost host callback receiver');
 if (Object.keys(context).sort().join() !== keys) throw new Error('invalid ' + key + ' capabilities');
 let views = owners.get(context.tasks);
 if (!views) owners.set(context.tasks, views = {});
 if (views[key] && views[key] !== context) throw new Error('host context changed within store');
 views[key] = context;
 if (views.prepareCall && views.prepareCall.registers !== context.registers) throw new Error('detached task register owner');
 if (context.driver && context.driver.lookup !== context.lookup) throw new Error('detached driver component lookup');
 calls.push(key); contexts.push(context);
}
export function prepareCall(context, ...args) {
 observe('prepareCall', context, 'RuntimeError,creation,mayBlock,registers,tasks', this);
 if (context.creation.tasks !== context.tasks) throw new Error('detached task creation owner');
 const result = defaults.prepareCall(context, ...args);
 const task = context.tasks.get(args[5]).at(-1).task;
 if (!(task instanceof context.creation.AsyncTask)) throw new Error('detached task constructor');
 if (task.getReturnMemory() !== args[1]()) throw new Error('prepared memory was not captured');
 if (context.registers[args[5]].taskID !== task.id()) throw new Error('prepared register does not identify child');
 prepared.push(task.subtaskMeta.stringEncoding);
 return result;
}
export function asyncStartCall(context, ...args) {
 observe('asyncStartCall', context, 'blockingDepth,componentIdxs,driver,events,lookup,memories,platform,registers,tasks', this);
 return defaults.asyncStartCall(context, ...args);
}
export function syncStartCall(context, ...args) {
 observe('syncStartCall', context, 'componentIdxs,driver,lookup,platform,registers,tasks', this);
 return defaults.syncStartCall(context, ...args);
}
export function storeEventInComponentMemory() {
 calls.push('storeEventInComponentMemory');
 throw new Error('sibling writer override must not intercept default waitables');
}`;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `host named provider (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeProvider(dir, providerSource());
                const provider = await import(pathToFileURL(join(dir, 'provider/intrinsics/host.js')).href);
                for (const [name, method] of [
                    ['sync-lowered-async-callee', 'syncStartCall'],
                    ['deferred-subtask-start', 'asyncStartCall'],
                    ['waitable-set-poll-non-set', 'storeEventInComponentMemory'],
                ]) {
                    const { files } = await transpile(fixture(name), {
                        name,
                        instantiation,
                        minify,
                        asyncMode: 'jspi',
                        cmRuntimeEsModule: './provider/',
                    });
                    await writeFiles(files, { baseDir: dir });
                    if (!minify) {
                        const source = new TextDecoder().decode(files[`${name}.js`]);
                        for (const helper of [
                            '_prepareCall',
                            '_asyncStartCall',
                            '_syncStartCall',
                            '_storeEventInComponentMemory',
                        ]) {
                            assert.notInclude(source, `function ${helper}(`);
                        }
                        if (method === 'storeEventInComponentMemory') {
                            assert.notInclude(source, './provider/intrinsics/host.js');
                            assert.notInclude(source, 'storeEventInComponentMemory: args =>');
                        } else {
                            assert.include(source, './provider/intrinsics/host.js');
                            assert.include(
                                source,
                                method === 'syncStartCall' ? '_jcoHostSyncStartContext' : '_jcoHostAsyncStartContext',
                            );
                        }
                    }
                    const bindings = await import(pathToFileURL(join(dir, `${name}.js`)).href);
                    const instantiate = () =>
                        bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                    const instances = instantiation ? [await instantiate(), await instantiate()] : [bindings];
                    for (const instance of instances) {
                        if (method === 'asyncStartCall') {
                            const packed = await instance.run();
                            assert.deepEqual([(packed >>> 8) & 15, packed & 15], [1, 0]);
                            for (let i = 0; i < 50 && instance.completed() !== 2; i++) {
                                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                            }
                            assert.strictEqual(instance.completed(), 2);
                        } else {
                            assert.strictEqual(
                                await (method === 'storeEventInComponentMemory'
                                    ? instance.pollEmptySet()
                                    : instance.run()),
                                method === 'storeEventInComponentMemory' ? 0 : 42,
                            );
                        }
                    }
                    if (method !== 'storeEventInComponentMemory') {
                        assert.include(provider.calls, method);
                    }
                }
                assert.include(provider.calls, 'prepareCall');
                assert.notInclude(provider.calls, 'storeEventInComponentMemory');
                assert.isNotEmpty(provider.prepared);
                assert.isTrue(
                    provider.prepared.every((encoding: string) =>
                        ['utf8', 'utf16', 'compact-utf16'].includes(encoding),
                    ),
                );
                const taskOwners = new Set(provider.contexts.map((context: { tasks: unknown }) => context.tasks));
                assert.strictEqual(taskOwners.size, instantiation ? 4 : 2);
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}

test.concurrent.each([
    ['prepareCall', 'sync-lowered-async-callee'],
    ['syncStartCall', 'sync-lowered-async-callee'],
    ['asyncStartCall', 'deferred-subtask-start'],
])('native ESM rejects a missing selected host export: %s', async (missing, name) => {
    const dir = await getTmpDir();
    try {
        const names = Object.keys(await import(hostUrl)).filter((name) => name !== missing);
        await writeProvider(dir, `export { ${names.join(', ')} } from ${JSON.stringify(hostUrl)};`);
        const { files } = await transpile(fixture(name), {
            name,
            instantiation: 'sync',
            asyncMode: 'jspi',
            cmRuntimeEsModule: './provider/',
        });
        await writeFiles(files, { baseDir: dir });
        // The native loader enforces named exports; Vitest emulates them.
        await expect(execAsync(process.execPath, [join(dir, `${name}.js`)])).rejects.toThrow(missing);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent('host uses the selected JSPI namespace lazily with its actual receiver', async () => {
    const dir = await getTmpDir();
    try {
        const { files } = await transpile(fixture('sync-lowered-async-callee'), {
            name: 'selected-host',
            instantiation: 'sync',
            asyncMode: 'jspi',
            cmRuntimeEsModule: defaultRuntimeUrl.href,
        });
        await writeFile(join(dir, 'package.json'), '{"type":"module"}');
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'selected-host.js')).href);
        let reads = 0,
            calls = 0;
        const selected = Object.create(WebAssembly);
        Object.defineProperty(selected, 'promising', {
            get() {
                reads++;
                return function (this: unknown, fn: WebAssembly.ExportedFunction) {
                    assert.strictEqual(this, selected);
                    calls++;
                    return WebAssembly.promising(fn);
                };
            },
        });
        const instance = bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}, undefined, {
            shim: { globals: { WebAssembly: selected } },
        });
        // Export/callback JSPI wrappers are selected during instantiation too.
        // The host callee needs its own wrapper only when the call starts.
        const initializationReads = reads;
        assert.strictEqual(await instance.run(), 42);
        assert.isAbove(reads, initializationReads);
        assert.isAbove(calls, 0);
        const first = { reads, calls };
        assert.strictEqual(await instance.run(), 42);
        assert.deepEqual({ reads, calls }, first);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
import { execFile } from 'node:child_process';
