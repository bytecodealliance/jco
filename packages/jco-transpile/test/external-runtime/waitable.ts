import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { assert, expect, test } from 'vitest';

import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';

const fixture = fileURLToPath(new URL('../fixtures/components/p3/waitable-set-poll-non-set.wat', import.meta.url));
const waitableUrl = new URL('intrinsics/waitable.js', defaultRuntimeUrl).href;
const execAsync = promisify(execFile);

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
        'error-context',
    ]) {
        await writeFile(
            join(dir, 'provider/intrinsics/' + suffix + '.js'),
            'export * from ' + JSON.stringify(new URL('intrinsics/' + suffix + '.js', defaultRuntimeUrl).href) + ';',
        );
    }
    await writeFile(join(dir, 'provider/intrinsics/waitable.js'), source);
}
function providerSource() {
    return `import * as defaults from ${JSON.stringify(waitableUrl)};
export * from ${JSON.stringify(waitableUrl)};
export const constructors = [], setConstructors = [], contexts = [], calls = [];
export function initializeWaitableClass(...args) {
 if (args.length) throw new Error('context-free constructor received context');
 const constructor = defaults.initializeWaitableClass(); constructors.push(constructor); return constructor;
}
export function initializeWaitableSetClass(events) {
 const constructor = defaults.initializeWaitableSetClass(events); setConstructors.push(constructor); return constructor;
}
export function waitableSetNew(context, componentIdx) {
 if (this !== null || Object.keys(context).sort().join() !== 'WaitableSet,lookup') throw new Error('invalid new context/receiver');
 if (!setConstructors.includes(context.WaitableSet)) throw new Error('detached set constructor');
 calls.push('new'); contexts.push(context); return defaults.waitableSetNew(context, componentIdx);
}
export function waitableSetPoll(context, memory, rep, ptr) {
 if (this !== null || Object.keys(context).sort().join() !== 'RuntimeError,WaitableSet,events,getCurrentTask,lookup,storeEventInComponentMemory') throw new Error('invalid poll context/receiver');
 calls.push('poll'); return defaults.waitableSetPoll(context, memory, rep, ptr);
}
export function waitableSetDrop(context, componentIdx, rep) {
 if (this !== null || Object.keys(context).sort().join() !== 'RuntimeError,WaitableSet,getCurrentTask,lookup') throw new Error('invalid drop context/receiver');
 calls.push('drop'); return defaults.waitableSetDrop(context, componentIdx, rep);
}`;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `waitable named provider (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeProvider(dir, providerSource());
                const { files } = await transpile(fixture, {
                    name: 'waitable',
                    instantiation,
                    minify,
                    cmRuntimeEsModule: './provider/',
                });
                await writeFiles(files, { baseDir: dir });
                if (!minify) {
                    const source = new TextDecoder().decode(files['waitable.js']);
                    assert.notInclude(source, 'class Waitable');
                    assert.notInclude(source, 'function waitableSet');
                    assert.notInclude(source, 'createWaitable: args =>');
                    assert.include(source, 'getCurrentTask: componentIdx => getCurrentTask(componentIdx)');
                    assert.include(source, 'storeEventInComponentMemory: args =>');
                }
                const bindings = await import(pathToFileURL(join(dir, 'waitable.js')).href);
                const provider = await import(pathToFileURL(join(dir, 'provider/intrinsics/waitable.js')).href);
                const instantiate = () =>
                    bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                const first = instantiation ? await instantiate() : bindings;
                assert.strictEqual(await first.pollEmptySet(), 0);
                assert.includeMembers(provider.calls, ['new', 'poll', 'drop']);
                const state = provider.contexts[0].lookup.asyncState.get(0);
                assert.instanceOf(state.createWaitable(), provider.constructors[0]);
                await expect(first.pollFutureEnd()).rejects.toThrow('unknown handle index');
                if (instantiation) {
                    const second = await instantiate();
                    assert.strictEqual(await second.pollEmptySet(), 0);
                    assert.lengthOf(provider.constructors, 2);
                    assert.lengthOf(provider.setConstructors, 2);
                    assert.notStrictEqual(provider.constructors[0], provider.constructors[1]);
                    assert.notStrictEqual(provider.setConstructors[0], provider.setConstructors[1]);
                    assert.notStrictEqual(
                        provider.contexts[0].lookup.asyncState,
                        provider.contexts[1].lookup.asyncState,
                    );
                } else {
                    assert.lengthOf(provider.constructors, 1);
                    assert.lengthOf(provider.setConstructors, 1);
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}

test.concurrent.each(['initializeWaitableClass', 'waitableSetPoll'])(
    'native ESM rejects a missing waitable export: %s',
    async (missing) => {
        const dir = await getTmpDir();
        try {
            const names = [
                'initializeWaitableClass',
                'initializeWaitableSetClass',
                'waitableSetNew',
                'waitableSetPoll',
                'waitableSetDrop',
            ].filter((name) => name !== missing);
            await writeProvider(dir, `export { ${names.join(', ')} } from ${JSON.stringify(waitableUrl)};`);
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
    },
);

test.concurrent.each([false, true])('generated waitable mismatch diagnostics (external=%s)', async (external) => {
    const dir = await getTmpDir();
    try {
        const { files } = await transpile(fixture, {
            name: 'diagnostic',
            cmRuntimeEsModule: external ? defaultRuntimeUrl.href : undefined,
        });
        const context = external ? '_jcoWaitableSetPollContext, ' : '';
        files['diagnostic.js'] = new TextEncoder().encode(
            new TextDecoder().decode(files['diagnostic.js']) +
                `
export function testPollMismatch() {
 const previous = getCurrentTask;
 getCurrentTask = () => ({ componentIdx: 77 });
 try { return waitableSetPoll(${context}{ componentIdx: 0 }, 1, 0); }
 finally { getCurrentTask = previous; }
}
`,
        );
        await writeFile(join(dir, 'package.json'), '{"type":"module"}');
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'diagnostic.js')).href);
        assert.throws(bindings.testPollMismatch, 'task component idx [77] != component instance ID [0]');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
