import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import ts from 'typescript-compiler-api';
import { assert, test } from 'vitest';

import type {
    AsyncTask,
    ComponentAsyncState,
    ComponentMemoryMap,
    RuntimeMemory,
    TaskRegisters,
} from '../../../jco-cm-runtime/src/runtime.js';
import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';

interface Probe {
    readonly createTask: (args: { componentIdx: number; isAsync: boolean }) => { task: AsyncTask; threadID: number };
    readonly prepare: (...args: unknown[]) => void;
    readonly start: (...args: unknown[]) => number;
    readonly tasks: Map<number, { task: AsyncTask & { subtaskMeta: { stringEncoding: unknown } } }[]>;
    readonly constructorArgs: { stringEncoding?: unknown }[];
    readonly registers: TaskRegisters;
    readonly memories: ComponentMemoryMap;
    readonly State: new (args: { componentIdx: number }) => ComponentAsyncState;
    readonly states: Map<number, ComponentAsyncState>;
    readonly flags: Map<number, { value: number }>;
    readonly scheduler: { deadlockCheck: ReturnType<typeof setTimeout> | null };
}

// Observe the selected constructor's real operands without changing its private
// brand, prototype or static owner. Both paths already select it for prepare.
function observeConstructor(source: string) {
    const tree = ts.createSourceFile('probe.js', source, ts.ScriptTarget.Latest, true);
    const edits: [number, number, string][] = [];
    let selected = 0;
    const handler =
        '{ construct(target, args, receiver) { __hostTaskArgs.push(args[0]); return Reflect.construct(target, args, receiver); } }';
    function visit(node: ts.Node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'instantiate' && node.body) {
            edits.push([node.body.getStart(tree) + 1, node.body.getStart(tree) + 1, '\nconst __hostTaskArgs = [];\n']);
        }
        if (ts.isClassDeclaration(node) && node.name?.text === 'AsyncTask') {
            selected++;
            edits.push([
                node.getStart(tree),
                node.end,
                `let AsyncTask = new Proxy(${node.getText(tree)}, ${handler});`,
            ]);
            return;
        }
        if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'AsyncTask' && node.initializer) {
            selected++;
            edits.push([
                node.initializer.getStart(tree),
                node.initializer.end,
                `new Proxy(${node.initializer.getText(tree)}, ${handler})`,
            ]);
        }
        ts.forEachChild(node, visit);
    }
    visit(tree);
    assert.strictEqual(selected, 1);
    for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) {
        source = source.slice(0, start) + text + source.slice(end);
    }
    return source;
}

async function withProbe(external: boolean, check: (probe: Probe) => void) {
    const dir = await getTmpDir();
    let probe: Probe | undefined;
    try {
        const component = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'async-call-g2g-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'async-call-g2g-callee.wasm'),
            outputPath: join(dir, 'composed.wasm'),
        });
        const { files } = await transpile(component, {
            name: 'host-regression',
            instantiation: 'sync',
            cmRuntimeEsModule: external ? defaultRuntimeUrl.href : undefined,
        });
        let source = observeConstructor(new TextDecoder().decode(files['host-regression.js']));
        const tree = ts.createSourceFile('probe.js', source, ts.ScriptTarget.Latest, true);
        const returns: ts.ReturnStatement[] = [];
        function visit(node: ts.Node) {
            if (ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression)) {
                if (node.expression.properties.some((p) => p.name?.getText(tree).includes('localRunAsync'))) {
                    returns.push(node);
                }
            }
            ts.forEachChild(node, visit);
        }
        visit(tree);
        assert.lengthOf(returns, 1);
        const returned = returns[0];
        const object = returned.expression!;
        source =
            source.slice(0, object.getStart(tree)) +
            `{
            __test: {
                createTask: ${external ? 'createNewCurrentImplicitThread.bind(void 0, _jcoTaskCreateContext)' : 'createNewCurrentImplicitThread'},
                prepare: ${external ? '_prepareCall.bind(void 0, _jcoHostPrepareContext)' : '_prepareCall'},
                start: ${external ? '_asyncStartCall.bind(void 0, _jcoHostAsyncStartContext)' : '_asyncStartCall'},
                tasks: ASYNC_TASKS_BY_COMPONENT_IDX, constructorArgs: __hostTaskArgs,
                registers: CURRENT_TASK_META, State: ComponentAsyncState, states: ASYNC_STATE,
                memories: GLOBAL_COMPONENT_MEMORY_MAP,
                flags: INSTANCE_FLAGS, scheduler: STORE_ASYNC_STATE,
            }
        }` +
            source.slice(object.end);
        await writeFile(join(dir, 'package.json'), '{"type":"module"}');
        await writeFiles(files, { baseDir: dir });
        await writeFile(join(dir, 'host-regression.js'), source);
        const bindings = await import(pathToFileURL(join(dir, 'host-regression.js')).href);
        const instance = await bindings.instantiate(
            (name: string) => new WebAssembly.Module(files[name]),
            new WASIShim().getImportObject(),
        );
        probe = instance.__test;
        for (const componentIdx of [99, 100]) {
            probe!.flags.set(componentIdx, { value: 1 });
            const state = new probe!.State({ componentIdx });
            assert.isTrue(Reflect.set(state, 'runTickLoop', async () => {}));
            probe!.states.set(componentIdx, state);
        }
        check(probe!);
    } finally {
        if (probe) {
            for (const state of probe.states.values()) {
                state.setErrored();
            }
            if (probe.scheduler.deadlockCheck !== null) {
                clearTimeout(probe.scheduler.deadlockCheck);
            }
        }
        await rm(dir, { recursive: true, force: true });
    }
}

for (const external of [false, true]) {
    test.concurrent.each([0, 1, 2])(
        'generated prepare normalizes all encoding operands (%s, external=' + external + ')',
        async (encoding) => {
            await withProbe(external, (probe) => {
                const { task: parent, threadID } = probe.createTask({ componentIdx: 99, isAsync: true });
                probe.registers[99] = { componentIdx: 99, taskID: parent.id(), threadID };
                probe.prepare(
                    3,
                    () => undefined,
                    (...params: unknown[]) => params,
                    () => {},
                    99,
                    100,
                    7,
                    1,
                    encoding,
                    -2,
                    17,
                    23,
                    8,
                );
                const child = probe.tasks.get(100)!.at(-1)!.task;
                const expected = ['utf8', 'utf16', 'compact-utf16'][encoding];
                assert.deepEqual(
                    [
                        child.getParentSubtask()!.getCallMetadata()!.stringEncoding,
                        child.subtaskMeta.stringEncoding,
                        probe.constructorArgs.at(-1)!.stringEncoding,
                    ],
                    [expected, expected, expected],
                );
                assert.deepEqual(child.getCalleeParams(), [17, 23]);
            });
        },
    );

    test.concurrent('generated prepare captures actual return memory (external=' + external + ')', async () => {
        await withProbe(external, (probe) => {
            const { task: parent, threadID } = probe.createTask({ componentIdx: 99, isAsync: true });
            probe.registers[99] = { componentIdx: 99, taskID: parent.id(), threadID };
            const memory: RuntimeMemory = { buffer: new ArrayBuffer(32) };
            let reads = 0;
            probe.prepare(
                3,
                () => {
                    reads++;
                    return memory;
                },
                () => [],
                () => {},
                99,
                100,
                7,
                1,
                0,
                -2,
                8,
            );
            const child = probe.tasks.get(100)!.at(-1)!.task;
            assert.strictEqual(child.getReturnMemory(), memory);
            assert.strictEqual(reads, 1);
        });
    });

    test.concurrent(
        'generated host result lowering selects registered memory (external=' + external + ')',
        async () => {
            await withProbe(external, (probe) => {
                const { task: parent, threadID } = probe.createTask({ componentIdx: 99, isAsync: true });
                probe.registers[99] = { componentIdx: 99, taskID: parent.id(), threadID };
                const memory: RuntimeMemory = { buffer: new ArrayBuffer(32) };
                probe.memories.set(99, { '2': { componentIdx: 99, memoryIdx: 2, memory } });
                probe.prepare(
                    null,
                    () => null,
                    () => [],
                    () => {},
                    99,
                    100,
                    0,
                    0,
                    0,
                    -2,
                    4,
                );
                const child = probe.tasks.get(100)!.at(-1)!.task;
                assert.isTrue(Reflect.deleteProperty(child.getParentSubtask()!.getCallMetadata()!, 'returnFn'));
                let lowered: { memory: unknown; vals: unknown; ptr: unknown } | undefined;
                child.setReturnLowerFns([
                    (context) => {
                        lowered = { memory: context.memory, vals: context.vals, ptr: context.storagePtr };
                        if (context.memory === memory) {
                            new DataView(memory.buffer).setUint32(context.storagePtr!, 42, true);
                        }
                    },
                ]);
                const status = probe.start(
                    { getCallbackFn: () => null, getPostReturnFn: () => null },
                    Object.assign(() => 42, { _jcoMaySuspend: false }),
                    0,
                    1,
                    0,
                );
                assert.strictEqual(status, 2);
                assert.isDefined(lowered);
                assert.strictEqual(lowered!.memory, memory);
                assert.deepEqual(lowered!.vals, [42]);
                assert.strictEqual(lowered!.ptr, 4);
                assert.strictEqual(new DataView(memory.buffer).getUint32(4, true), 42);
            });
        },
    );
}
