import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, expect, test } from 'vitest';

import type {
    ComponentAsyncState,
    ComponentMemoryMap,
    RuntimeMemory,
    TaskRegisters,
} from '../../../jco-cm-runtime/src/runtime.js';
import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpileBytes, writeFiles } from '../transpilation.js';

// A real synchronous lowered import selects the compatibility helper and its
// task/subtask dependencies without requesting extra intrinsics for a probe.
const COMPONENT = `(component
 (import "host" (func $host (param "value" u32) (result u32)))
 (core func $lower (canon lower (func $host)))
 (core module $m
  (import "" "host" (func $host (param i32) (result i32)))
  (func (export "run") (param i32) (result i32) (call $host (local.get 0))))
 (core instance $m (instantiate $m (with "" (instance (export "host" (func $lower))))))
 (func (export "run") (param "value" u32) (result u32) (canon lift (core func $m "run")))
)`;

interface Subtask {
    readonly addLender: (handle: { lends: number }) => void;
    readonly onStart: () => void;
    readonly onResolve: (value: unknown) => void;
    readonly deliverResolve: () => void;
    readonly drop: () => void;
    readonly ensureHandle: () => number;
}
interface Task {
    readonly id: () => bigint;
    readonly createSubtask: (args: {
        componentIdx: number;
        isAsync?: boolean;
        callMetadata?: {
            resultPtr: number;
            lowers: ((ctx: { memory: RuntimeMemory; storagePtr: number; vals: number[] }) => void)[];
        };
    }) => Subtask;
    readonly currentSubtask: () => Subtask;
    readonly resolve: (value: unknown[]) => void;
    readonly exit: (options?: { skipExclusiveLockCheck: boolean }) => void;
}
interface Probe {
    readonly createTask: (args: { componentIdx: number }) => { task: Task; taskID: bigint; threadID: number };
    readonly State: new (args: { componentIdx: number }) => ComponentAsyncState;
    readonly states: Map<number, ComponentAsyncState | undefined>;
    readonly memories: ComponentMemoryMap;
    readonly registers: TaskRegisters;
    readonly tasks: Map<number, { id: bigint; task: Task }[]>;
    readonly scopes: Map<number, unknown>;
    readonly scheduler: { deadlockCheck: ReturnType<typeof setTimeout> | null };
    readonly compat: (
        args: {
            componentIdx: number;
            isAsync: boolean;
            funcTypeIsAsync: boolean;
            getMemoryFn: () => undefined;
            importFn: (value: number) => number;
        },
        value: number,
    ) => number;
}

async function withProbe(external: boolean, check: (probe: Probe) => void) {
    const dir = await getTmpDir();
    let probe: Probe | undefined;
    try {
        const { files } = await transpileBytes(await parse(COMPONENT), {
            name: 'task-regression',
            instantiation: 'sync',
            cmRuntimeEsModule: external ? defaultRuntimeUrl.href : undefined,
        });
        let replacements = 0;
        const source = new TextDecoder().decode(files['task-regression.js']).replace(/return \{ run,\s*\};/g, () => {
            replacements++;
            return `return { run, __test: {
                    createTask: ${external ? 'createNewCurrentImplicitThread.bind(void 0, _jcoTaskCreateContext)' : 'createNewCurrentImplicitThread'}, State: ComponentAsyncState, states: ASYNC_STATE,
                    memories: GLOBAL_COMPONENT_MEMORY_MAP, registers: CURRENT_TASK_META,
                    tasks: ASYNC_TASKS_BY_COMPONENT_IDX, scopes: RESOURCE_SCOPE_TASKS,
                    scheduler: STORE_ASYNC_STATE, compat: ${external ? '_lowerImportBackwardsCompat.bind(void 0, _jcoTaskCompatImportContext)' : '_lowerImportBackwardsCompat'},
                } };`;
        });
        assert.strictEqual(replacements, 1);
        files['task-regression.js'] = new TextEncoder().encode(source);
        await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFiles(files, { baseDir: dir });
        const bindings = await import(pathToFileURL(join(dir, 'task-regression.js')).href);
        const instance = bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {
            host: (value: number) => value,
        });
        probe = instance.__test as Probe;
        const state = probe.states.get(0) ?? new probe.State({ componentIdx: 0 });
        probe.states.set(0, state);
        // These tests drive subtask transitions directly, without a timer loop.
        assert.isTrue(Reflect.set(state, 'runTickLoop', async () => {}));
        check(probe);
    } finally {
        if (probe) {
            for (const state of probe.states.values()) {
                state?.setErrored();
            }
            if (probe.scheduler.deadlockCheck !== null) {
                clearTimeout(probe.scheduler.deadlockCheck);
                probe.scheduler.deadlockCheck = null;
            }
        }
        await rm(dir, { recursive: true, force: true });
    }
}

for (const external of [false, true]) {
    test.concurrent(`generated subtask lowers into registered memory (external=${external})`, async () => {
        await withProbe(external, (probe) => {
            const memory = { buffer: new ArrayBuffer(32) };
            probe.memories.set(0, { '0': { componentIdx: 0, memoryIdx: 0, memory } });
            const { task: parent } = probe.createTask({ componentIdx: 0 });
            let lowered = 0;
            const subtask = parent.createSubtask({
                componentIdx: 0,
                isAsync: true,
                callMetadata: {
                    resultPtr: 8,
                    lowers: [
                        (ctx) => {
                            assert.strictEqual(ctx.memory, memory);
                            new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);
                            lowered++;
                        },
                    ],
                },
            });
            subtask.onStart();
            subtask.onResolve(42);
            assert.strictEqual(lowered, 1);
            assert.strictEqual(new DataView(memory.buffer).getUint32(8, true), 42);
            subtask.deliverResolve();
            subtask.drop();
            parent.resolve([]);
            parent.exit({ skipExclusiveLockCheck: true });
        });
    });

    test.concurrent(`generated subtask tracks its first lender (external=${external})`, async () => {
        await withProbe(external, (probe) => {
            const { task: parent } = probe.createTask({ componentIdx: 0 });
            const subtask = parent.createSubtask({ componentIdx: 0, isAsync: true });
            const lender = { lends: 0 };
            expect(() => subtask.addLender(null as never)).toThrow('missing/invalid lender handle');
            expect(() => subtask.addLender({ lends: 'invalid' } as never)).toThrow('missing/invalid lender handle');
            subtask.addLender(lender);
            assert.strictEqual(lender.lends, 1);
            subtask.onStart();
            subtask.onResolve(42);
            expect(() => subtask.addLender(lender)).toThrow('already been resolved');
            subtask.deliverResolve();
            assert.strictEqual(lender.lends, 0);
            expect(() => subtask.addLender(lender)).toThrow('already been resolved');
            subtask.drop();
            parent.resolve([]);
            parent.exit({ skipExclusiveLockCheck: true });
        });
    });

    test.concurrent(`generated subtask reports its own component index (external=${external})`, async () => {
        await withProbe(external, (probe) => {
            const { task: parent } = probe.createTask({ componentIdx: 0 });
            const subtask = parent.createSubtask({ componentIdx: 0, isAsync: true });
            const state = probe.states.get(0);
            try {
                // A present but invalid entry exercises the diagnostic without
                // replacing the selected operation or requesting a new helper.
                probe.states.set(0, undefined);
                expect(() => subtask.ensureHandle()).toThrow('invalid/missing async state for component [0]');
            } finally {
                probe.states.set(0, state);
            }
            subtask.onStart();
            subtask.onResolve(42);
            subtask.deliverResolve();
            subtask.drop();
            parent.resolve([]);
            parent.exit({ skipExclusiveLockCheck: true });
        });
    });

    test.concurrent(`generated compatibility lowering retires its temporary task (external=${external})`, async () => {
        await withProbe(external, (probe) => {
            assert.strictEqual(probe.scopes.size, 0);
            const result = probe.compat(
                {
                    componentIdx: 0,
                    isAsync: false,
                    funcTypeIsAsync: false,
                    getMemoryFn: () => undefined,
                    importFn(value) {
                        const task = probe.tasks.get(0)!.at(-1)!.task;
                        assert.strictEqual(probe.registers.current?.taskID, task.id());
                        task.currentSubtask().onResolve(value);
                        return value;
                    },
                },
                23,
            );
            assert.strictEqual(result, 23);
            assert.strictEqual(probe.registers.current, null);
            assert.lengthOf(probe.tasks.get(0) ?? [], 0);
            assert.strictEqual(probe.scopes.size, 0);
        });
    });
}
