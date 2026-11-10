import { execFile } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { assert, expect, test } from 'vitest';

import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';
import { writeRuntimeProvider } from './helpers.js';

const fixture = fileURLToPath(new URL('../fixtures/components/p3/context-resource-drop.wat', import.meta.url));
const backpressure = fileURLToPath(
    new URL('../fixtures/components/p3/backpressure-sync/component.wat', import.meta.url),
);
const componentUrl = new URL('intrinsics/component.js', defaultRuntimeUrl).href;
const execAsync = promisify(execFile);

function providerSource() {
    return `import * as defaults from ${JSON.stringify(componentUrl)};
export * from ${JSON.stringify(componentUrl)};
export const flags = [], traps = [], stores = [], states = [], constructors = [], contexts = [], calls = [];
export function initializeInstanceFlags() { const owner = defaults.initializeInstanceFlags(); flags.push(owner); return owner; }
export function initializeStoreTrap(onTrap) { const owner = defaults.initializeStoreTrap(onTrap); traps.push(owner); return owner; }
export function initializeStoreAsyncState() { const owner = defaults.initializeStoreAsyncState(); stores.push(owner); return owner; }
export function initializeComponentAsyncStates() { const owner = defaults.initializeComponentAsyncStates(); states.push(owner); return owner; }
export function initializeComponentAsyncStateClass(context) {
 if (Object.keys(context).sort().join() !== 'RepTable,RuntimeError,Waitable,cannotEnter,checkIdle,deadlock,indexSpaces,instanceFlags,normalization,reportTrap,storeTrap') throw new Error('broad component constructor context');
 if (typeof context.reportTrap !== 'function') throw new Error('missing component trap reporter');
 if (typeof context.checkIdle !== 'function') throw new Error('missing component idle checker');
 if (!flags.includes(context.instanceFlags) || !traps.includes(context.storeTrap) || !states.includes(context.deadlock.asyncState)) throw new Error('detached component owner');
 const constructor = defaults.initializeComponentAsyncStateClass(context); constructors.push(constructor); contexts.push(context); return constructor;
}
export function getOrCreateAsyncState(context, idx) {
 if (this !== undefined || Object.keys(context).sort().join() !== 'ComponentAsyncState,asyncState') throw new Error('invalid lookup call');
 if (!states.includes(context.asyncState) || !constructors.includes(context.ComponentAsyncState)) throw new Error('detached state lookup');
 calls.push('getOrCreateAsyncState'); return defaults.getOrCreateAsyncState(context, idx);
}
export function backpressureInc(context, idx) {
 if (this !== null) throw new Error('lost bound callback receiver');
 calls.push('backpressureInc'); return defaults.backpressureInc(context, idx);
}
export function backpressureDec(context, idx) {
 if (this !== null) throw new Error('lost bound callback receiver');
 calls.push('backpressureDec'); return defaults.backpressureDec(context, idx);
}`;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(
        `component provider (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeRuntimeProvider(dir, 'component', providerSource());
                const { files } = await transpile(fixture, {
                    name: 'component',
                    callTracking: true,
                    instantiation,
                    minify,
                    cmRuntimeEsModule: './provider/',
                });
                await writeFiles(files, { baseDir: dir });
                if (!minify) {
                    const source = new TextDecoder().decode(files['component.js']);
                    assert.notInclude(source, 'class ComponentAsyncState');
                    assert.notInclude(source, 'const INSTANCE_FLAGS = new Map()');
                    assert.notInclude(source, 'function _recordTrap(');
                    assert.include(source, 'initializeComponentAsyncStateClass');
                    assert.notInclude(source, 'createWaitable: args =>');
                    assert.include(source, 'initializeWaitableClass');
                    assert.notInclude(source, 'checkMayLeave: componentIdx =>');
                    assert.notInclude(source, 'throwIfInterrupted: componentIdx =>');
                }
                const bindings = await import(pathToFileURL(join(dir, 'component.js')).href);
                const provider = await import(pathToFileURL(join(dir, 'provider/intrinsics/component.js')).href);
                const onTrap = () => assert.fail('unexpected trap');
                const instantiate = () =>
                    bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}, undefined, {
                        onTrap,
                    });
                const instances = instantiation ? [await instantiate(), await instantiate()] : [bindings];
                assert.lengthOf(provider.constructors, instances.length);
                for (const [index, instance] of instances.entries()) {
                    const tracked = instance._util.calls.start(instance.run);
                    assert.deepEqual(await tracked.finished, { status: 'completed' });
                    assert.notProperty(provider.stores[index], 'taskGroups');
                    assert.notProperty(provider.stores[index], 'lastTask');
                    const resource: Disposable = instance.api.make();
                    resource[Symbol.dispose]();
                    assert.strictEqual(instance.drops(), 2);
                    assert.isAbove(provider.flags[index].size, 0);
                    assert.isAbove(provider.states[index].size, 0);
                    assert.isNull(provider.traps[index].error);
                    assert.strictEqual(provider.traps[index].onTrap, instantiation ? onTrap : null);
                    assert.strictEqual(provider.stores[index].pendingHostOperations, 0);
                    // The provider callback must settle waiters on this instance's selected scheduler.
                    let idle = false;
                    provider.stores[index].idleWaiters.add(() => {
                        idle = true;
                    });
                    provider.contexts[index].checkIdle();
                    assert.isTrue(idle);
                    assert.strictEqual(provider.stores[index].idleWaiters.size, 0);
                    for (const state of provider.states[index].values()) {
                        assert.instanceOf(state, provider.constructors[index]);
                    }
                }
                assert.include(provider.calls, 'getOrCreateAsyncState');
                if (instantiation) {
                    assert.notStrictEqual(provider.stores[0].idleWaiters, provider.stores[1].idleWaiters);
                    for (const owners of [
                        provider.flags,
                        provider.states,
                        provider.stores,
                        provider.traps,
                        provider.constructors,
                    ]) {
                        assert.notStrictEqual(owners[0], owners[1]);
                    }
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );

    test.concurrent.each([false, true])(
        `bound backpressure callbacks (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeRuntimeProvider(dir, 'component', providerSource());
                const { files } = await transpile(backpressure, {
                    name: 'backpressure',
                    instantiation,
                    minify,
                    cmRuntimeEsModule: './provider/',
                });
                await writeFiles(files, { baseDir: dir });
                const bindings = await import(pathToFileURL(join(dir, 'backpressure.js')).href);
                const provider = await import(pathToFileURL(join(dir, 'provider/intrinsics/component.js')).href);
                const instance = instantiation
                    ? await bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {})
                    : bindings;
                instance.incBackpressure();
                assert.isTrue(
                    [...provider.states[0].values()].some(
                        (state: { getBackpressure(): number }) => state.getBackpressure() === 1,
                    ),
                );
                instance.decBackpressure();
                assert.isTrue(
                    [...provider.states[0].values()].every(
                        (state: { getBackpressure(): number }) => state.getBackpressure() === 0,
                    ),
                );
                assert.include(provider.calls, 'backpressureInc');
                assert.include(provider.calls, 'backpressureDec');
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}

test.concurrent.each(['initializeComponentAsyncStateClass', 'getOrCreateAsyncState'])(
    'native ESM rejects a missing component export: %s',
    async (missing) => {
        const dir = await getTmpDir();
        try {
            const exports = Object.keys(await import(componentUrl)).filter((name) => name !== missing);
            await writeRuntimeProvider(
                dir,
                'component',
                `export { ${exports.join(', ')} } from ${JSON.stringify(componentUrl)};`,
            );
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
test.concurrent.each([false, true])(
    'generated backpressure waiters wake only at zero (external=%s)',
    async (external) => {
        const dir = await getTmpDir();
        try {
            const { files } = await transpile(fixture, {
                name: 'component',
                cmRuntimeEsModule: external ? defaultRuntimeUrl.href : undefined,
            });
            // Expose the generated helper to exercise the same class in both modes.
            files['component.js'] = new TextEncoder().encode(
                new TextDecoder().decode(files['component.js']) +
                    '\nexport { getOrCreateAsyncState as testGetState };\n' +
                    (external ? 'export { _jcoComponentStateLookupContext as testContext };\n' : ''),
            );
            await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
            await writeFiles(files, { baseDir: dir });
            const bindings = await import(pathToFileURL(join(dir, 'component.js')).href);
            const state = external ? bindings.testGetState(bindings.testContext, 99) : bindings.testGetState(99);
            state.setBackpressure(2);
            let reentered = false;
            state.registerHandler({
                event: 'backpressure-change',
                fn: (bp: number) => {
                    if (bp === 0 && !reentered) {
                        reentered = true;
                        state.setBackpressure(0);
                    }
                },
            });
            let completed = 0;
            const waits = [state.waitForBackpressure(), state.waitForBackpressure()].map((p) =>
                p.then(() => {
                    completed++;
                }),
            );
            await new Promise((resolve) => setTimeout(resolve, 5));
            assert.strictEqual(completed, 0);
            state.decrementBackpressure();
            await Promise.resolve();
            assert.strictEqual(completed, 0);
            state.decrementBackpressure();
            await Promise.all(waits);
            assert.strictEqual(completed, 2);
            assert.strictEqual(state.getBackpressureWaiters(), 0n);
            state.setBackpressure(0);
            assert.strictEqual(state.getBackpressureWaiters(), 0n);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);
