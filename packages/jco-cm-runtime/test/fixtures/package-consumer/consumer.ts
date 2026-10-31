import expectedExports from './contract-exports.js';
import { CM_RUNTIME_API_VERSION as rootVersion } from '@bytecodealliance/jco-cm-runtime';
import { CM_RUNTIME_API_VERSION } from '@bytecodealliance/jco-cm-runtime/runtime';
import * as resource from '@bytecodealliance/jco-cm-runtime/intrinsics/resource';
import * as conversion from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';
import * as core from '@bytecodealliance/jco-cm-runtime/intrinsics/core';
import * as component from '@bytecodealliance/jco-cm-runtime/intrinsics/component';
import * as waitable from '@bytecodealliance/jco-cm-runtime/intrinsics/waitable';
import * as errorContext from '@bytecodealliance/jco-cm-runtime/intrinsics/error-context';
import * as asyncTask from '@bytecodealliance/jco-cm-runtime/intrinsics/async-task';
import * as host from '@bytecodealliance/jco-cm-runtime/intrinsics/host';
import * as lift from '@bytecodealliance/jco-cm-runtime/intrinsics/lift';
import * as lower from '@bytecodealliance/jco-cm-runtime/intrinsics/lower';
import * as future from '@bytecodealliance/jco-cm-runtime/intrinsics/future';
import * as stream from '@bytecodealliance/jco-cm-runtime/intrinsics/stream';
import * as jsHelper from '@bytecodealliance/jco-cm-runtime/intrinsics/js-helper';
import * as string from '@bytecodealliance/jco-cm-runtime/intrinsics/string';
import * as webidl from '@bytecodealliance/jco-cm-runtime/intrinsics/webidl';
import * as custom from './provider.js';
import type {
    ResourceModule,
    ConversionModule,
    RuntimeModuleContracts,
} from '@bytecodealliance/jco-cm-runtime/runtime';
const publicModules: Record<string, Record<string, unknown>> = {
    ResourceModule: resource,
    ConversionModule: conversion,
    JsHelperModule: jsHelper,
    StringModule: string,
    WebIdlModule: webidl,
    CoreModule: core,
    ComponentModule: component,
    WaitableModule: waitable,
    ErrorContextModule: errorContext,
    AsyncTaskModule: asyncTask,
    HostModule: host,
    LiftModule: lift,
    LowerModule: lower,
    FutureModule: future,
    StreamModule: stream,
};

const constants = new Set([
    'AsyncTaskModule.asyncBlockedCode',
    'ResourceModule.tableFlag',
    'ResourceModule.tableOwn',
    'CoreModule.i32Min',
    'CoreModule.i32Max',
]);
for (const [name, exports] of Object.entries(expectedExports)) {
    const actual = publicModules[name];
    if (Object.keys(actual).sort().join() !== [...exports].sort().join()) {
        throw new Error(name + ' JS/type exports differ');
    }
    for (const key of exports) {
        if (typeof actual[key] !== (constants.has(name + '.' + key) ? 'number' : 'function')) {
            throw new Error(name + '.' + key + ' has the wrong JavaScript export kind');
        }
    }
}
const defaultModule: ResourceModule = resource;
const defaultCore: RuntimeModuleContracts['intrinsics/core'] = core;
const defaultTasks: RuntimeModuleContracts['intrinsics/async-task'] = asyncTask;
const defaultHost: RuntimeModuleContracts['intrinsics/host'] = host;
const eventMemory = { buffer: new ArrayBuffer(8) };
if (
    defaultHost.storeEventInComponentMemory({
        memory: eventMemory,
        ptr: 0,
        event: { code: 1, payload0: 17, payload1: 23 },
    }) !== 1 ||
    new DataView(eventMemory.buffer).getUint32(4, true) !== 23
) {
    throw new Error('host event writer consumer failed');
}
if (custom.getCurrentTask({ tasks: custom.initializeTasksByComponent(), registers: {} }, 0) !== undefined) {
    throw new Error('copied task contract consumer failed');
}
const taskOwners = defaultTasks.initializeTasksByComponent();
if (
    defaultTasks.asyncBlockedCode !== 0xffffffff ||
    defaultTasks.getCurrentTask({ tasks: taskOwners, registers: {} }, 0) !== undefined ||
    defaultTasks.initializeCurrentTaskMayBlock(false) !== false ||
    defaultTasks.initializeAsyncBlockingCallDepth(false).value !== 0
) {
    throw new Error('task owner/register consumer failed');
}
const registers = custom.initializeTaskRegisters();
defaultCore.setCurrentTaskMeta(registers, { componentIdx: 0, taskID: 1n, threadID: 1 });
if (
    defaultCore.withCurrentTaskMeta(registers, {
        componentIdx: 1,
        taskID: 2n,
        threadID: 2,
        fn: () => defaultCore.getCurrentTaskMeta(registers)?.taskID,
    }) !== 2n ||
    defaultCore.getCurrentTaskMeta(registers)?.taskID !== 1n
) {
    throw new Error('task register consumer failed');
}
const Rep = defaultCore.initializeRepTableClass({ RuntimeError: Error });
const OtherRep = defaultCore.initializeRepTableClass({ RuntimeError: Error });
const reps = new Rep<string>();
if (
    Rep === OtherRep ||
    Rep.FREE === OtherRep.FREE ||
    !(reps instanceof Rep) ||
    reps.get(reps.insert('value')) !== 'value'
) {
    throw new Error('constructor consumer failed');
}
const ErrorClass = defaultCore.initializeComponentErrorClass();
const payload = { message: 'payload' };
const error = new ErrorClass(payload);
if (
    defaultCore.getErrorPayload(defaultCore.initializeHasOwnProperty(), error) !== payload ||
    custom.clampGuest(42, 0, 100) !== 42
) {
    throw new Error('error capability consumer failed');
}
const memoryMap = defaultCore.initializeComponentMemoryMap();
const wasmMemory = new WebAssembly.Memory({ initial: 1 });
defaultCore.registerMemory(memoryMap, { componentIdx: 0, memoryIdx: 0, memory: wasmMemory });
if (defaultCore.lookupMemories(memoryMap, { componentIdx: 0, memoryIdx: 0 }) !== wasmMemory) {
    throw new Error('memory owner consumer failed');
}
const indexSpaces = defaultModule.initializeHandleIndexSpaces();
const scopeTasks = defaultModule.initializeResourceScopeTasks();
const removal = { RuntimeError: Error, indexSpaces, scopeTasks };
const components: RuntimeModuleContracts['intrinsics/component'] = component;
const instanceFlags = components.initializeInstanceFlags();
const storeTrap = custom.initializeStoreTrap();
const storeAsyncState = components.initializeStoreAsyncState();
const asyncState = components.initializeComponentAsyncStates();
const normalization = {
    RuntimeError: Error,
    messages: components.initializeCoreTrapMessages({ unreachable: 'compiler unreachable' }),
};
const deadlock = { RuntimeError: Error, storeTrap, storeAsyncState, asyncState };
const waitables: RuntimeModuleContracts['intrinsics/waitable'] = waitable;
const Waitable = waitables.initializeWaitableClass();
const WaitableSet = waitables.initializeWaitableSetClass(core.initializeAsyncEventCodes());
const State = components.initializeComponentAsyncStateClass({
    RuntimeError: Error,
    RepTable: Rep,
    indexSpaces,
    instanceFlags,
    storeTrap,
    normalization,
    deadlock,
    cannotEnter: 'cannot enter',
    Waitable,
});
const state = components.getOrCreateAsyncState({ asyncState, ComponentAsyncState: State }, 0);
const waitableContext = {
    RuntimeError: Error,
    lookup: { asyncState, ComponentAsyncState: State },
    Waitable,
    WaitableSet,
};
const setRep = waitables.waitableSetNew(waitableContext, 0);
const w = state.createWaitable({ target: 'packed' });
const wRep = state.handles.insert(w);
waitables.waitableJoin(waitableContext, 0, wRep, setRep);
if (!(w instanceof Waitable) || !(state.handles.get(setRep) instanceof WaitableSet) || !w.isInSet()) {
    throw new Error('waitable constructor consumer failed');
}
w.drop();
waitables.removeWaitableSet({ RuntimeError: Error, WaitableSet }, { state, waitableSetRep: setRep });
const errors: RuntimeModuleContracts['intrinsics/error-context'] = errorContext;
const GlobalTable = errors.initializeGlobalErrorContextTableClass(Rep);
const localTables = errors.initializeLocalErrorContextTables();
const registrations = errors.initializeErrorContextTableRegistrations();
if (GlobalTable.data !== null || localTables.size || Object.keys(registrations).length) {
    throw new Error('error-context eager storage');
}
const errorLocal = { localTables, RepTable: Rep };
const errorHandles = {
    RuntimeError: WebAssembly.RuntimeError,
    globalTable: GlobalTable,
    lookup: { asyncState, ComponentAsyncState: State },
};
const errorContextView = { ...errorHandles, local: errorLocal };
errors.errCtxGetLocalTable(errorLocal, 0, 0, { upsert: true });
const errorHandle = errors.errCtxNew(
    errorContextView,
    { componentIdx: 0, localTableIdx: 0, readStrFn: () => 'packed error' },
    0,
    12,
);
let errorMessage = '';
errors.errCtxDebugMessage(
    errorHandles,
    {
        componentIdx: 0,
        writeStrFn: (message) => {
            errorMessage = message;
        },
    },
    errorHandle,
    0,
);
errors.errCtxDrop(errorContextView, { componentIdx: 0, localTableIdx: 0 }, errorHandle);
if (errorMessage !== 'packed error' || GlobalTable.get().size() !== 0) {
    throw new Error('error-context consumer failed');
}
instanceFlags.set(0, { value: 1 });
custom.checkMayLeave({ RuntimeError: Error, instanceFlags }, 0);
const receiver = { answer: 42 };
const guarded = components.guardMayLeave({ RuntimeError: Error, instanceFlags }, 0, function (this: typeof receiver) {
    return this.answer;
});
if (
    !(state instanceof State) ||
    !(state.handles instanceof Rep) ||
    guarded.call(receiver) !== 42 ||
    storeTrap.error !== null ||
    storeAsyncState.pendingHostOperations !== 0 ||
    components.trackHostOperation({ ...deadlock, symbolDispose: core.initializeSymbolDispose() }, () => 42) !== 42
) {
    throw new Error('component consumer failed');
}
const table = Object.assign([defaultModule.tableFlag, 0], { _componentIdx: 0, _createdReps: new Set<number>() });
const handle = defaultModule.tableCreateOwn(indexSpaces, table, 42);
if (
    handle !== 1 ||
    defaultModule.tableRemove(removal, table, handle).rep !== 42 ||
    defaultModule.getHandleIndexSpace(indexSpaces, 0).alloc() !== handle
) {
    throw new Error('allocator consumer failed');
}
const cells = [defaultModule.initializeScopeId(), defaultModule.initializeResourceScopeCounter()];
if (
    cells[0] === cells[1] ||
    cells.some((cell) => cell.value !== 0) ||
    defaultModule.initializeCallBorrows().borrows.length ||
    defaultModule.initializeCurrentBorrows().borrows.length ||
    Object.keys(defaultModule.initializeHandleTables()).length
) {
    throw new Error('resource storage consumer failed');
}
const transferOwn: ResourceModule['transferOwn'] = resource.transferOwn;
const transferBorrow: ResourceModule['transferBorrow'] = resource.transferBorrow;
const transferBorrowValidLifting: ResourceModule['transferBorrowValidLifting'] = resource.transferBorrowValidLifting;
const ensureBorrowDrop: ResourceModule['tableEnsureBorrowDrop'] = resource.tableEnsureBorrowDrop;
const createBorrow: ResourceModule['tableCreateBorrow'] = resource.tableCreateBorrow;
const destructor: ResourceModule['callDestructor'] = resource.callDestructor;
if (
    [transferOwn, transferBorrow, transferBorrowValidLifting, ensureBorrowDrop, createBorrow, destructor].some(
        (op) => typeof op !== 'function',
    )
) {
    throw new Error('resource exports missing');
}
const defaultConversions: RuntimeModuleContracts['intrinsics/conversion'] = conversion;
const helpers: RuntimeModuleContracts['intrinsics/js-helper'] = jsHelper;
const webIdlModule: RuntimeModuleContracts['intrinsics/webidl'] = webidl;
const webIdlCache = custom.initializeWebIdlProxyCache();
const globalProxy = webIdlModule.globalThisIdlProxy(webIdlCache);
if (globalProxy !== webIdlModule.globalThisIdlProxy(webIdlCache) || Reflect.get(globalProxy, 'URL') !== URL) {
    throw new Error('WebIDL consumer failed');
}
const strings: RuntimeModuleContracts['intrinsics/string'] = string;
const encoder = strings.initializeUtf8Encoder();
const stringMemory = { buffer: new ArrayBuffer(8) };
const allocation = strings.utf8Encode(encoder, 'é', () => 0, stringMemory);
if (
    allocation.len !== 2 ||
    strings.initializeUtf8Decoder().decode(new Uint8Array(stringMemory.buffer, 0, 2)) !== 'é' ||
    custom.validateHostChar('🚀') !== 0x1f680
) {
    throw new Error('string consumer failed');
}
const cache = helpers.initializeDataViewCache();
const memory = { buffer: new ArrayBuffer(8) };
const view = helpers.dataView(cache, memory);
view.setUint32(0, 42, true);
if (helpers.dataView(cache, memory) !== view || view.getUint32(0, true) !== 42 || helpers.emptyFunc(1) !== undefined) {
    throw new Error('cache consumer failed');
}
const customUint32: ConversionModule['toUint32'] = custom.toUint32;
if (customUint32({ strict: false }, -1) !== 0xffffffff || defaultConversions.toUint32({ strict: true }, 42) !== 42) {
    throw new Error('numeric consumer failed');
}
const scratch32 = defaultConversions.initializeBitcast32();
const scratch64 = defaultConversions.initializeBitcast64();
if (
    defaultConversions.i32ToF32(scratch32, 0x3f800000) !== 1 ||
    defaultConversions.f64ToI64(scratch64, 1) !== 0x3ff0000000000000n
) {
    throw new Error('bitcast consumer failed');
}
const customModule: Pick<ResourceModule, 'tableGet'> = custom;
const version: 1 = rootVersion;
const entry = defaultModule.tableGet({ RuntimeError: WebAssembly.RuntimeError }, [1 << 30, 0, 7, 42], 1);
if (
    version !== CM_RUNTIME_API_VERSION ||
    entry.rep !== 42 ||
    customModule.tableGet({ RuntimeError: Error }, [1 << 30, 0, 7, 24], 1).rep !== 24
) {
    throw new Error('consumer failed');
}
