import { fileURLToPath } from 'node:url';
import { scenarioIdsForPortfolio } from './matrix.mjs';

export const components = [
    { id: 'empty', path: 'empty.wat' },
    { id: 'noise', path: 'noise.mjs' },
    { id: 'numbers', path: '../../test/fixtures/components/runtime/numbers.component.wasm' },
    { id: 'variants', path: '../../test/fixtures/components/runtime/variants.component.wasm' },
    { id: 'strings', path: '../../test/fixtures/components/runtime/strings.component.wasm' },
    { id: 'adder', path: '../../test/fixtures/components/adder.component.wasm' },
    { id: 'resource', path: '../../test/fixtures/components/runtime/external-runtime-resource.component.wat' },
    { id: 'lists', path: '../../test/fixtures/components/runtime/lists.component.wasm' },
    { id: 'records', path: '../../test/fixtures/components/runtime/records.component.wasm' },
    { id: 'flavorful', path: '../../test/fixtures/components/runtime/flavorful.component.wasm' },
    { id: 'resources', path: '../../test/fixtures/components/p3/context-resource-drop.wat' },
    { id: 'events', path: '../../test/fixtures/components/p3/waitable-set-poll-non-set.wat' },
    { id: 'async', path: '../../test/fixtures/components/p3/sync-lowered-async-callee.wat' },
    { id: 'streams', path: '../../test/fixtures/components/p3/zero-length-same-component-stream.wat' },
    { id: 'futures', path: '../../test/fixtures/generated/rust-test-components/future-lower.wasm' },
] as const;
export type ComponentId = (typeof components)[number]['id'];
export const fullScenarios: { id: string; components: readonly ComponentId[] }[] = [
    ...components.map(({ id }) => ({ id, components: [id] })),
    { id: 'sharing', components: ['resource', 'resource'] },
    {
        id: 'portfolio',
        components: ['adder', 'numbers', 'strings', 'lists', 'records', 'variants', 'flavorful', 'resources'],
    },
];
export const smokeScenarios = fullScenarios.filter((scenario) =>
    scenarioIdsForPortfolio('smoke').includes(scenario.id),
);
export const portfolio = process.env.JCO_EXTERNAL_RUNTIME_BENCH_PORTFOLIO ?? 'full';
const declared = scenarioIdsForPortfolio(portfolio);
if (fullScenarios.map((scenario) => scenario.id).join() !== scenarioIdsForPortfolio('full').join()) {
    throw new Error('Full benchmark scenario catalog does not match its declared matrix');
}
export const scenarios = fullScenarios.filter((scenario) => declared.includes(scenario.id));
export const bundlers = ['rolldown', 'rollup'] as const;
export type Bundler = (typeof bundlers)[number];
export const resolutions = ['file', 'package'] as const;
export type Resolution = (typeof resolutions)[number];
export function componentPath(id: ComponentId) {
    return fileURLToPath(new URL(components.find((component) => component.id === id)!.path, import.meta.url));
}

const taskClassImports = [
    {
        suffix: 'intrinsics/core',
        names: [
            'initializeRepTableClass',
            'initializeComponentMemoryMap',
            'initializeSymbolDispose',
            'initializeAsyncEventCodes',
        ],
    },
    {
        suffix: 'intrinsics/resource',
        names: ['initializeHandleIndexSpaces', 'initializeResourceScopeCounter', 'initializeResourceScopeTasks'],
    },
    {
        suffix: 'intrinsics/component',
        names: [
            'initializeInstanceFlags',
            'initializeStoreTrap',
            'initializeStoreAsyncState',
            'initializeComponentAsyncStates',
            'initializeComponentAsyncStateClass',
        ],
    },
    { suffix: 'intrinsics/waitable', names: ['initializeWaitableClass'] },
];
const taskClassBase = `
 const RuntimeError = Error, RepTable = initializeRepTableClass({ RuntimeError });
 const indexSpaces = initializeHandleIndexSpaces(), instanceFlags = initializeInstanceFlags();
 const storeTrap = initializeStoreTrap(), storeAsyncState = initializeStoreAsyncState(), asyncState = initializeComponentAsyncStates();
 const Waitable = initializeWaitableClass(), normalization = { RuntimeError, messages: new Map() };
 const deadlock = { RuntimeError, storeTrap, storeAsyncState, asyncState };
 const ComponentAsyncState = initializeComponentAsyncStateClass({ RuntimeError, RepTable, indexSpaces, instanceFlags, storeTrap, normalization, cannotEnter: 'cannot enter', deadlock, Waitable });
 const lookup = { asyncState, ComponentAsyncState }, memories = initializeComponentMemoryMap(), disposeSymbol = initializeSymbolDispose();
 const subtaskContext = { RuntimeError, lookup, memories, disposeSymbol };
 const AsyncSubtask = initializeAsyncSubtaskClass(subtaskContext);
`;

/** Keep selected owners/classes separate from scalar-only runtime imports. */
export const importControls = [
    {
        id: 'lift-u32',
        suffix: 'intrinsics/lift',
        names: ['liftFlatU32'],
        setup: '',
        answer: 'liftFlatU32({ useDirectParams: true, params: [42] })[0]',
        allocations: {},
    },
    {
        id: 'lift-variant-scratch',
        suffix: 'intrinsics/lift',
        names: ['initializeLiftVariant'],
        setup: 'const context = initializeLiftVariant();',
        answer: '(context.scratch.setInt32(0, 42, true), context.scratch.getInt32(0, true))',
        allocations: { DataView: 1, ArrayBuffer: 1 },
    },
    {
        suffix: 'intrinsics/host',
        id: 'host-event-memory',
        names: ['storeEventInComponentMemory'],
        setup: 'const memory = { buffer: new ArrayBuffer(8) }, event = { code: 1, payload0: 17, payload1: 23 }; const code = storeEventInComponentMemory({ memory, ptr: 0, event }); const view = new DataView(memory.buffer);',
        answer: 'code === 1 && view.getUint32(0, true) === 17 && view.getUint32(4, true) === 23 ? 42 : 0',
        allocations: { ArrayBuffer: 1, DataView: 2 },
    },
    {
        suffix: 'intrinsics/host',
        id: 'host-prepare-selected-trap',
        names: ['prepareCall'],
        setup: `class Trap extends Error {} const context = { tasks: { get() {} }, registers: {}, mayBlock: { value: 0 }, RuntimeError: Trap, get creation() { throw new Error('unexpected task creation'); } }; let trapped = false; try { prepareCall(context, null, () => null, () => [], () => {}, 0, 1, 0, 0, 0, 0); } catch (error) { trapped = error instanceof Trap && error.message === 'cannot block a synchronous task before returning'; }`,
        answer: 'trapped ? 42 : 0',
        allocations: {},
    },
    {
        suffix: 'intrinsics/host',
        id: 'host-start-lazy-capabilities',
        names: ['asyncStartCall'],
        setup: `const context = { componentIdxs: [1], registers: {}, get platform() { throw new Error('unexpected JSPI selection'); }, get driver() { throw new Error('unexpected driver selection'); } }; let rejected = false; try { asyncStartCall(context, {}, () => 0, 0, 0, 0); } catch (error) { rejected = error.message === 'missing global current task globalTaskMeta'; }`,
        answer: 'rejected ? 42 : 0',
        allocations: {},
    },
    {
        suffix: 'intrinsics/async-task',
        id: 'task-blocked-value',
        names: ['asyncBlockedCode'],
        setup: '',
        answer: 'asyncBlockedCode === 0xffffffff ? 42 : 0',
        allocations: {},
    },
    {
        suffix: 'intrinsics/async-task',
        id: 'task-state-owners',
        names: [
            'initializeTasksByComponent',
            'initializeCurrentTaskIds',
            'initializeCurrentComponentIdxs',
            'initializeSymmetricSyncGuestCallStack',
        ],
        setup: 'const tasks = initializeTasksByComponent(), ids = initializeCurrentTaskIds(), components = initializeCurrentComponentIdxs(), stack = initializeSymmetricSyncGuestCallStack();',
        answer: 'tasks.size + ids.length + components.length + stack.length === 0 ? 42 : 0',
        allocations: { Map: 1 },
    },
    {
        suffix: 'intrinsics/async-task',
        id: 'task-pure-lookup',
        names: ['initializeTasksByComponent', 'getCurrentTask'],
        setup: 'const context = { tasks: initializeTasksByComponent(), registers: {} };',
        answer: 'getCurrentTask(context, 0) === undefined ? 42 : 0',
        allocations: { Map: 1 },
    },
    {
        suffix: 'intrinsics/async-task',
        id: 'task-selected-raw-registers',
        names: ['initializeCurrentTaskMayBlock', 'initializeAsyncBlockingCallDepth'],
        setup: 'let calls = 0; class Global { constructor(_descriptor, value = 0) { calls++; this.value = value; } } const a = initializeCurrentTaskMayBlock({ Global }), b = initializeAsyncBlockingCallDepth({ Global }); b.value = 1;',
        answer: 'a instanceof Global && b instanceof Global && a !== b && a.value === 0 && b.value === 1 && calls === 2 && initializeCurrentTaskMayBlock(false) === false && initializeAsyncBlockingCallDepth(false).value === 0 ? 42 : 0',
        allocations: {},
    },
    {
        suffix: 'intrinsics/async-task',
        id: 'task-create-lookup-clear',
        names: [
            'initializeTasksByComponent',
            'initializeCurrentTaskIds',
            'initializeCurrentComponentIdxs',
            'createNewCurrentTask',
            'getCurrentTask',
            'clearCurrentTask',
        ],
        setup: 'let id = 0n; class Task { constructor() { this.value = ++id; } id() { return this.value; } addThread(thread) { return thread; } } class Thread { constructor({ task }) { this.task = task; } id() { return Number(this.task.id()); } } const creation = { AsyncTask: Task, AsyncThread: Thread, tasks: initializeTasksByComponent(), taskIds: initializeCurrentTaskIds(), componentIdxs: initializeCurrentComponentIdxs() }; const [a] = createNewCurrentTask(creation, { componentIdx: 0 }), [b] = createNewCurrentTask(creation, { componentIdx: 0 }); const lookup = { tasks: creation.tasks, registers: { 0: { componentIdx: 0, taskID: a.id() } } }; const selected = getCurrentTask(lookup, 0).task; const removedA = clearCurrentTask(creation, 0, a.id()), removedB = clearCurrentTask(creation, 0, b.id());',
        answer: 'selected === a && removedA === a && removedB === b && creation.tasks.get(0).length === 0 && creation.taskIds.length === 0 && creation.componentIdxs.length === 0 ? 42 : 0',
        allocations: { Map: 1 },
    },
    {
        suffix: 'intrinsics/async-task',
        id: 'task-selected-subtask-class',
        names: ['initializeAsyncSubtaskClass'],
        imports: taskClassImports,
        setup: taskClassBase + 'const other = initializeAsyncSubtaskClass(subtaskContext);',
        answer: 'AsyncSubtask !== other && AsyncSubtask._ID === 0n && other._ID === 0n && AsyncSubtask.State.STARTING === 0 ? 42 : 0',
        allocations: { Map: 5, Symbol: 1 },
    },
    {
        suffix: 'intrinsics/async-task',
        id: 'task-selected-task-class',
        names: [
            'initializeAsyncSubtaskClass',
            'initializeAsyncTaskClass',
            'initializeAsyncThreadClass',
            'initializeTasksByComponent',
            'initializeCurrentTaskIds',
            'initializeCurrentComponentIdxs',
            'createNewCurrentTask',
            'clearCurrentTask',
        ],
        imports: taskClassImports,
        setup:
            taskClassBase +
            `
         const scopeCounter = initializeResourceScopeCounter(), scopeTasks = initializeResourceScopeTasks();
         const clearing = { tasks: initializeTasksByComponent(), taskIds: initializeCurrentTaskIds(), componentIdxs: initializeCurrentComponentIdxs() };
         const registers = {}, traps = { RuntimeError, registers, lookup };
         const AsyncThread = initializeAsyncThreadClass({ registers, lookup, traps });
         const Task = initializeAsyncTaskClass({ RuntimeError, traps, postReturn: { RuntimeError, lookup, stackOverflow: "stack", uncaughtException: "uncaught" }, AsyncSubtask, Waitable, lookup, events: initializeAsyncEventCodes(), determinism: 'deterministic', scopeCounter, scopeTasks, clearing, registers, isFutureValue: () => { throw new Error('eager future predicate'); } });
         const creation = { ...clearing, AsyncTask: Task, AsyncThread }, [a] = createNewCurrentTask(creation, { componentIdx: 0 }), [b] = createNewCurrentTask(creation, { componentIdx: 0 });
         const shared = scopeTasks.get(a.resourceScopeId()) === a && scopeTasks.get(b.resourceScopeId()) === b;
         a.validateResourceBorrowScope(); b.validateResourceBorrowScope(); clearCurrentTask(clearing, 0, a.id()); clearCurrentTask(clearing, 0, b.id());
        `,
        answer: 'a instanceof Task && b instanceof Task && a.id() === 1n && b.id() === 2n && shared && scopeCounter.value === 2 && Array.from(scopeTasks.keys()).length === 0 && clearing.tasks.get(0).length === 0 && clearing.taskIds.length === 0 ? 42 : 0',
        allocations: { Map: 9, Symbol: 1 },
    },
    {
        suffix: 'intrinsics/error-context',
        id: 'error-context-owners',
        names: ['initializeLocalErrorContextTables', 'initializeErrorContextTableRegistrations'],
        setup: 'const local = initializeLocalErrorContextTables(), tables = initializeErrorContextTableRegistrations();',
        answer: 'local.size === 0 && Object.keys(tables).length === 0 ? 42 : 0',
        allocations: { Map: 1 },
    },
    {
        suffix: 'intrinsics/error-context',
        id: 'error-context-global-class',
        names: ['initializeGlobalErrorContextTableClass'],
        imports: [{ suffix: 'intrinsics/core', names: ['initializeRepTableClass'] }],
        setup: 'const RepTable = initializeRepTableClass({ RuntimeError: Error }), GlobalTable = initializeGlobalErrorContextTableClass(RepTable);',
        answer: 'GlobalTable.data === null && typeof GlobalTable.get === "function" ? 42 : 0',
        allocations: { Symbol: 1 },
    },
    {
        suffix: 'intrinsics/error-context',
        id: 'error-context-global-reserve',
        names: ['initializeGlobalErrorContextTableClass', 'errCtxReserveGlobalRep', 'errCtxGlobalRefCountAdd'],
        imports: [{ suffix: 'intrinsics/core', names: ['initializeRepTableClass'] }],
        setup: 'const RepTable = initializeRepTableClass({ RuntimeError: Error }), GlobalTable = initializeGlobalErrorContextTableClass(RepTable); const { globalRep } = errCtxReserveGlobalRep(GlobalTable, "42", 0);',
        answer: 'errCtxGlobalRefCountAdd(GlobalTable, globalRep) === 1 && Number(GlobalTable.get().get(globalRep).debugMessage) === 42 ? 42 : 0',
        allocations: { Symbol: 1 },
    },
    {
        suffix: 'intrinsics/error-context',
        id: 'error-context-local-upsert',
        names: ['initializeLocalErrorContextTables', 'errCtxGetLocalTable'],
        imports: [{ suffix: 'intrinsics/core', names: ['initializeRepTableClass'] }],
        setup: 'const context = { localTables: initializeLocalErrorContextTables(), RepTable: initializeRepTableClass({ RuntimeError: Error }) }; const table = errCtxGetLocalTable(context, 0, 0, { upsert: true });',
        answer: 'table.get(table.insert(42)) === 42 ? 42 : 0',
        allocations: { Map: 2, Symbol: 1 },
    },
    {
        suffix: 'intrinsics/waitable',
        id: 'waitable-selected-class',
        names: ['initializeWaitableClass'],
        setup: 'const Waitable = initializeWaitableClass(); const waitable = new Waitable({ target: 42 });',
        answer: 'waitable instanceof Waitable && waitable.target === 42 && !waitable.hasPendingEvent() ? 42 : 0',
        allocations: {},
    },
    {
        suffix: 'intrinsics/waitable',
        id: 'waitable-set-selected-class',
        names: ['initializeWaitableSetClass'],
        imports: [{ suffix: 'intrinsics/core', names: ['initializeAsyncEventCodes'] }],
        setup: 'const WaitableSet = initializeWaitableSetClass(initializeAsyncEventCodes()); const set = new WaitableSet(42);',
        answer: 'set instanceof WaitableSet && set.componentIdx() === 42 && set.numWaitables() === 0 && set.numWaiting() === 0 ? 42 : 0',
        allocations: {},
    },
    {
        suffix: 'intrinsics/component',
        id: 'component-owners',
        names: [
            'initializeInstanceFlags',
            'initializeStoreTrap',
            'initializeStoreAsyncState',
            'initializeComponentAsyncStates',
        ],
        setup: 'const flags = initializeInstanceFlags(), trap = initializeStoreTrap(), store = initializeStoreAsyncState(), states = initializeComponentAsyncStates();',
        answer: 'flags.size === 0 && states.size === 0 && trap.error === null && store.deadlockCheck === null && store.pendingHostOperations === 0 ? 42 : 0',
        allocations: { Map: 2 },
    },
    {
        suffix: 'intrinsics/component',
        id: 'component-may-leave',
        names: ['initializeInstanceFlags', 'checkMayLeave'],
        setup: 'const instanceFlags = initializeInstanceFlags(); instanceFlags.set(0, { value: 1 }); const context = { RuntimeError: Error, instanceFlags };',
        answer: 'checkMayLeave(context, 0) === undefined ? 42 : 0',
        allocations: { Map: 1 },
    },
    {
        suffix: 'intrinsics/component',
        id: 'component-trap-messages',
        names: ['initializeCoreTrapMessages', 'normalizeCoreTrap'],
        setup: 'const messages = initializeCoreTrapMessages({ engine: "42" }); const context = { RuntimeError: Error, messages };',
        answer: 'Number(normalizeCoreTrap(context, new Error("engine")).message)',
        allocations: { Map: 1 },
    },
    {
        suffix: 'intrinsics/component',
        id: 'component-host-operation',
        names: [
            'initializeStoreTrap',
            'initializeStoreAsyncState',
            'initializeComponentAsyncStates',
            'trackHostOperation',
        ],
        setup: 'const context = { RuntimeError: Error, storeTrap: initializeStoreTrap(), storeAsyncState: initializeStoreAsyncState(), asyncState: initializeComponentAsyncStates(), symbolDispose: Symbol.dispose };',
        answer: 'trackHostOperation(context, () => 42) === 42 && context.storeAsyncState.pendingHostOperations === 0 ? 42 : 0',
        allocations: { Map: 1 },
    },
    {
        suffix: 'intrinsics/component',
        id: 'component-selected-class',
        names: [
            'initializeInstanceFlags',
            'initializeStoreTrap',
            'initializeStoreAsyncState',
            'initializeComponentAsyncStates',
            'initializeCoreTrapMessages',
            'initializeComponentAsyncStateClass',
            'getOrCreateAsyncState',
        ],
        imports: [
            { suffix: 'intrinsics/core', names: ['initializeRepTableClass'] },
            { suffix: 'intrinsics/resource', names: ['initializeHandleIndexSpaces'] },
            { suffix: 'intrinsics/waitable', names: ['initializeWaitableClass'] },
        ],
        setup: 'const RuntimeError = Error, RepTable = initializeRepTableClass({ RuntimeError }), indexSpaces = initializeHandleIndexSpaces(), instanceFlags = initializeInstanceFlags(), storeTrap = initializeStoreTrap(), storeAsyncState = initializeStoreAsyncState(), asyncState = initializeComponentAsyncStates(); const normalization = { RuntimeError, messages: initializeCoreTrapMessages({}) }, deadlock = { RuntimeError, storeTrap, storeAsyncState, asyncState }; const State = initializeComponentAsyncStateClass({ RuntimeError, RepTable, indexSpaces, instanceFlags, storeTrap, normalization, deadlock, cannotEnter: "cannot enter", Waitable: initializeWaitableClass() }); const state = getOrCreateAsyncState({ asyncState, ComponentAsyncState: State }, 0);',
        answer: 'state instanceof State && state.handles instanceof RepTable && state.handles.get(state.handles.insert(42)) === 42 && state.getBackpressure() === 0 ? 42 : 0',
        allocations: { Map: 6, Symbol: 1 },
    },
    {
        suffix: 'intrinsics/core',
        id: 'core-scalar',
        names: ['clampGuest', 'typeCheckValidI32', 'i32Min', 'i32Max'],
        setup: '',
        answer: 'typeCheckValidI32(42) && i32Min === -2147483648 && i32Max === 2147483647 ? clampGuest(42, 0, 100) : 0',
        allocations: {},
    },
    {
        suffix: 'intrinsics/core',
        id: 'core-error-payload',
        names: ['initializeHasOwnProperty', 'getErrorPayload'],
        setup: 'const hasOwn = initializeHasOwnProperty();',
        answer: 'getErrorPayload(hasOwn, { payload: 42 })',
        allocations: {},
    },
    {
        suffix: 'intrinsics/core',
        id: 'core-task-registers',
        names: ['initializeTaskRegisters', 'withCurrentTaskMeta', 'getCurrentTaskMeta'],
        setup: 'const registers = initializeTaskRegisters();',
        answer: 'withCurrentTaskMeta(registers, { componentIdx: 0, taskID: 42n, threadID: 1, fn: () => Number(getCurrentTaskMeta(registers).taskID) }) === 42 && registers.current === null ? 42 : 0',
        allocations: {},
    },
    {
        suffix: 'intrinsics/core',
        id: 'core-rep-constructors',
        names: ['initializeRepTableClass'],
        setup: 'const Rep = initializeRepTableClass({ RuntimeError: Error }), Other = initializeRepTableClass({ RuntimeError: Error }); const reps = new Rep();',
        answer: 'Rep !== Other && Rep.FREE !== Other.FREE && reps instanceof Rep ? reps.get(reps.insert(42)) : 0',
        allocations: { Symbol: 2 },
    },
    {
        suffix: 'intrinsics/core',
        id: 'core-error-constructors',
        names: ['initializeComponentErrorClass'],
        setup: 'const ErrorClass = initializeComponentErrorClass(), Other = initializeComponentErrorClass(); const error = new ErrorClass(42);',
        answer: 'error instanceof ErrorClass && !(error instanceof Other) ? error.payload : 0',
        allocations: {},
    },
    {
        suffix: 'intrinsics/core',
        id: 'core-memory-map',
        names: ['initializeComponentMemoryMap', 'registerMemory', 'lookupMemories'],
        setup: 'const map = initializeComponentMemoryMap(); const memory = { buffer: null }; registerMemory(map, { componentIdx: 0, memoryIdx: 0, memory });',
        answer: 'lookupMemories(map, { componentIdx: 0, memoryIdx: 0 }) === memory ? 42 : 0',
        allocations: { Map: 1 },
    },
    {
        suffix: 'intrinsics/core',
        id: 'core-buffer-manager',
        names: ['initializeManagedBufferClass', 'initializeBufferManagerClass', 'initializeBufferManager'],
        setup: 'const Managed = initializeManagedBufferClass({ RuntimeError: Error, indexSpaces: new Map(), scopeTasks: new Map(), tables: {} }); const Manager = initializeBufferManagerClass(Managed); const manager = initializeBufferManager(Manager);',
        answer: 'manager instanceof Manager && manager.getBuffer(-1, 1n) === undefined ? 42 : 0',
        allocations: { Map: 4 },
    },
    {
        suffix: 'intrinsics/core',
        id: 'core-conditional-storage',
        names: ['initializeConditionalSuspendingWasm'],
        setup: 'const modules = initializeConditionalSuspendingWasm();',
        answer: 'Object.keys(modules).length === 0 ? 42 : 0',
        allocations: {},
    },
    {
        suffix: 'intrinsics/resource',
        id: 'resource-cells',
        names: [
            'initializeScopeId',
            'initializeResourceScopeCounter',
            'initializeCallBorrows',
            'initializeCurrentBorrows',
        ],
        setup: 'const scope = initializeScopeId(), counter = initializeResourceScopeCounter(), calls = initializeCallBorrows(), current = initializeCurrentBorrows();',
        answer: 'scope.value === 0 && counter.value === 0 && calls.borrows.length === 0 && current.borrows.length === 0 ? 42 : 0',
        allocations: {},
    },
    {
        suffix: 'intrinsics/resource',
        id: 'resource-allocator',
        names: [
            'initializeHandleIndexSpaces',
            'tableCreateOwn',
            'tableCreateBorrow',
            'tableRemove',
            'initializeResourceScopeTasks',
        ],
        setup: 'const indexSpaces = initializeHandleIndexSpaces(); const scopeTasks = initializeResourceScopeTasks(); const context = { RuntimeError: WebAssembly.RuntimeError, indexSpaces, scopeTasks }; const a = Object.assign([1073741824, 0], { _componentIdx: 0, _createdReps: new Set() }), b = Object.assign([1073741824, 0], { _componentIdx: 0, _createdReps: new Set() });',
        answer: '(tableCreateOwn(indexSpaces, a, 42) === 1 && tableCreateBorrow(indexSpaces, b, 7, 3) === 2 && tableRemove(context, a, 1).rep === 42) ? 42 : 0',
        allocations: { Map: 2 },
    },
    {
        suffix: 'intrinsics/resource',
        id: 'resource-tables',
        names: ['initializeHandleTables'],
        setup: 'const tables = initializeHandleTables();',
        answer: 'Object.keys(tables).length === 0 ? 42 : 0',
        allocations: {},
    },
    {
        id: 'webidl-cache',
        suffix: 'intrinsics/webidl',
        names: ['initializeWebIdlProxyCache'],
        setup: 'const context = initializeWebIdlProxyCache();',
        answer: 'Object.keys(context).join() === "proxy" && context.proxy === undefined ? 42 : 0',
        allocations: {},
    },
    {
        id: 'webidl-proxy',
        suffix: 'intrinsics/webidl',
        names: ['initializeWebIdlProxyCache', 'globalThisIdlProxy'],
        setup: 'const context = initializeWebIdlProxyCache();',
        answer: 'globalThisIdlProxy(context) === globalThisIdlProxy(context) && Reflect.has(context.proxy, "URL") ? 42 : 0',
        allocations: { Symbol: 2, Proxy: 1 },
    },
    {
        id: 'string-char',
        suffix: 'intrinsics/string',
        names: ['validateGuestChar'],
        setup: '',
        answer: 'validateGuestChar(42).charCodeAt(0)',
        allocations: {},
    },
    {
        id: 'utf8-decoder',
        suffix: 'intrinsics/string',
        names: ['initializeUtf8Decoder'],
        setup: 'const decoder = initializeUtf8Decoder();',
        answer: 'decoder.decode(new Uint8Array([42])).charCodeAt(0)',
        allocations: { TextDecoder: 1, Uint8Array: 1 },
    },
    {
        id: 'utf16-decoder',
        suffix: 'intrinsics/string',
        names: ['initializeUtf16Decoder'],
        setup: 'const decoder = initializeUtf16Decoder();',
        answer: 'decoder.decode(new Uint8Array([42, 0])).charCodeAt(0)',
        allocations: { TextDecoder: 1, Uint8Array: 1 },
    },
    {
        id: 'utf8-encoder',
        suffix: 'intrinsics/string',
        names: ['initializeUtf8Encoder', 'utf8Encode'],
        setup: 'const encoder = initializeUtf8Encoder(); const memory = { buffer: new ArrayBuffer(8) };',
        answer: 'utf8Encode(encoder, "*", () => 0, memory).len + 41',
        allocations: { TextEncoder: 1, ArrayBuffer: 1, Uint8Array: 1 },
    },
    {
        id: 'utf16-encoding',
        suffix: 'intrinsics/string',
        names: ['initializeUtf16Encoding'],
        setup: 'const context = initializeUtf16Encoding();',
        answer: 'typeof context.littleEndian === "boolean" ? 42 : 0',
        allocations: { Uint8Array: 1, Uint16Array: 1 },
    },
    {
        id: 'empty-func',
        suffix: 'intrinsics/js-helper',
        names: ['emptyFunc'],
        setup: '',
        answer: '(emptyFunc(7), 42)',
        allocations: {},
    },
    {
        id: 'data-view',
        suffix: 'intrinsics/js-helper',
        names: ['initializeDataViewCache', 'dataView'],
        setup: 'const context = initializeDataViewCache(); const memory = { buffer: new ArrayBuffer(8) };',
        answer: '(dataView(context, memory).setUint32(0, 42, true), dataView(context, memory).getUint32(0, true))',
        allocations: { DataView: 2, ArrayBuffer: 2 },
    },
    {
        id: 'resource',
        suffix: 'intrinsics/resource',
        names: ['tableGet'],
        setup: '',
        answer: 'tableGet({ RuntimeError: WebAssembly.RuntimeError }, [1073741824, 0, 7, 4294967338], 1).rep',
        allocations: {},
    },
    {
        id: 'scalar',
        suffix: 'intrinsics/conversion',
        names: ['toUint32'],
        setup: '',
        answer: 'toUint32({ strict: false }, 42)',
        allocations: {},
    },
    {
        id: 'bitcast32',
        suffix: 'intrinsics/conversion',
        names: ['initializeBitcast32', 'i32ToF32'],
        setup: 'const context = initializeBitcast32();',
        answer: 'i32ToF32(context, 0x3f800000) + 41',
        allocations: { Int32Array: 1, Float32Array: 1 },
    },
    {
        id: 'bitcast64',
        suffix: 'intrinsics/conversion',
        names: ['initializeBitcast64', 'i64ToF64'],
        setup: 'const context = initializeBitcast64();',
        answer: 'i64ToF64(context, 0x3ff0000000000000n) + 41',
        allocations: { BigInt64Array: 1, Float64Array: 1 },
    },
] as const;
