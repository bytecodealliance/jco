// Test-only convenience views. Production bindings select each owner independently.
import * as operations from '../src/intrinsics/core.js';
import * as resources from '../src/intrinsics/resource.js';
import type {
    AsyncDeterminism,
    CoreCompilePlatform,
    CoreStreamingCompilePlatform,
    CoreInstantiatePlatform,
    RuntimeErrorConstructor,
    ResourceTable,
    SuspendingImportContext,
    TaskMeta,
} from '../src/runtime.js';

export type CoreBridgeCapabilities = Omit<SuspendingImportContext, 'RuntimeError' | 'registers'>;
export interface CoreTestOptions {
    nodejsCompat?: boolean;
    asyncDeterminism?: AsyncDeterminism;
    platform?: {
        WebAssembly: Partial<CoreStreamingCompilePlatform & CoreInstantiatePlatform> & {
            RuntimeError: RuntimeErrorConstructor;
        };
    };
    coreContext?: CoreBridgeCapabilities;
}
export function createTestIntrinsics(options: CoreTestOptions = {}) {
    const wasm = options.platform?.WebAssembly ?? WebAssembly;
    const RuntimeError = wasm.RuntimeError;
    const nodejsCompat = options.nodejsCompat ?? true;
    const indexSpaces = resources.initializeHandleIndexSpaces();
    const tables = resources.initializeHandleTables();
    const scopeTasks = resources.initializeResourceScopeTasks();
    const resourceContext = { RuntimeError, indexSpaces, tables, scopeTasks };
    const ManagedBuffer = operations.initializeManagedBufferClass(resourceContext);
    const BufferManager = operations.initializeBufferManagerClass(ManagedBuffer);
    const registers = operations.initializeTaskRegisters();
    const memoryMap = operations.initializeComponentMemoryMap();
    const asyncConstructor = operations.initializeAsyncFunctionConstructor();
    const ownProperty = operations.initializeHasOwnProperty();
    const disposeSymbol = operations.initializeSymbolDispose();
    const fileCache = operations.initializeFileCompileCache(nodejsCompat);
    const base64Context = { WebAssembly: wasm as CoreCompilePlatform, nodejsCompat };
    const fetchContext = { WebAssembly: wasm as CoreStreamingCompilePlatform, nodejsCompat, fileCache };
    const core = {
        ...operations,
        asyncDeterminism: operations.initializeAsyncDeterminism(options.asyncDeterminism ?? 'random'),
        asyncFunctionConstructor: asyncConstructor,
        ComponentError: operations.initializeComponentErrorClass(),
        RuntimeError,
        RepTable: operations.initializeRepTableClass({ RuntimeError }),
        ManagedBuffer,
        BufferManager,
        bufferManager: operations.initializeBufferManager(BufferManager),
        factTrapMessages: operations.initializeFactTrapMessages({}),
        symbolCabiDispose: operations.initializeSymbolCabiDispose(),
        symbolCabiLower: operations.initializeSymbolCabiLower(),
        symbolResourceHandle: operations.initializeSymbolResourceHandle(),
        symbolResourceRep: operations.initializeSymbolResourceRep(),
        symbolDispose: disposeSymbol,
        symbolAsyncIterator: operations.initializeSymbolAsyncIterator(),
        symbolIterator: operations.initializeSymbolIterator(),
        isLE: operations.initializeEndianness(),
        hasOwnProperty: ownProperty,
        asyncEventCode: operations.initializeAsyncEventCodes(),
        componentMemoryMap: memoryMap,
        currentTaskMeta: registers,
        conditionalSuspendingWasm: operations.initializeConditionalSuspendingWasm(),
        get ReadableStream() {
            return operations.initializeReadableStream(globalThis.ReadableStream);
        },
        typeCheckAsyncFn: (value: unknown) => operations.typeCheckAsyncFn(asyncConstructor, value),
        base64Compile: (encoded: string) => operations.base64Compile(base64Context, encoded),
        fetchCompile: (url: URL) => operations.fetchCompile(fetchContext, url),
        instantiateCore: (module: WebAssembly.Module, imports?: WebAssembly.Imports) =>
            operations.instantiateCore(wasm as CoreInstantiatePlatform, module, imports),
        getErrorPayload: (value: unknown) => operations.getErrorPayload(ownProperty, value),
        getErrorPayloadString: (value: unknown) => operations.getErrorPayloadString(ownProperty, value),
        disposeHostValue: (value: unknown, disposeFn?: (this: unknown) => unknown) =>
            operations.disposeHostValue(disposeSymbol, value, disposeFn),
        registerMemory: (args: Parameters<typeof operations.registerMemory>[1]) =>
            operations.registerMemory(memoryMap, args),
        lookupMemories: (args: { componentIdx: number; memoryIdx?: number }) =>
            args.memoryIdx === undefined
                ? operations.lookupMemories(memoryMap, { componentIdx: args.componentIdx })
                : operations.lookupMemories(memoryMap, { componentIdx: args.componentIdx, memoryIdx: args.memoryIdx }),
        getCurrentTaskMeta: (componentIdx?: number | null) => operations.getCurrentTaskMeta(registers, componentIdx),
        setCurrentTaskMeta: (args: TaskMeta) => operations.setCurrentTaskMeta(registers, args),
        withCurrentTaskMeta: <T>(args: TaskMeta & { fn: () => T }) => operations.withCurrentTaskMeta(registers, args),
        withCurrentTaskMetaAsync: <T>(args: TaskMeta & { fn: () => T | PromiseLike<T> }) =>
            operations.withCurrentTaskMetaAsync(registers, args),
        clearCurrentTaskMeta: (args: TaskMeta) => operations.clearCurrentTaskMeta(registers, args),
        suspendingImport: <A extends unknown[], T>(
            componentIdx: number,
            fn: (...args: A) => T,
            syncOnly?: boolean,
            switchesTask?: boolean,
            convertsRangeErrors?: boolean,
            callsHost?: boolean,
        ) => {
            if (!options.coreContext) {
                throw new TypeError('suspending imports require coreContext');
            }
            return operations.suspendingImport(
                { ...options.coreContext, RuntimeError, registers },
                componentIdx,
                fn,
                syncOnly,
                switchesTask,
                convertsRangeErrors,
                callsHost,
            );
        },
    };
    return {
        core,
        resource: {
            tableFlag: resources.tableFlag,
            state: { handleTables: tables },
            getHandleIndexSpace: (key: number | ResourceTable) => resources.getHandleIndexSpace(indexSpaces, key),
            tableCreateOwn: (table: ResourceTable, rep: number) => resources.tableCreateOwn(indexSpaces, table, rep),
            tableGet: (table: ResourceTable, handle: number) => resources.tableGet({ RuntimeError }, table, handle),
        },
    };
}
