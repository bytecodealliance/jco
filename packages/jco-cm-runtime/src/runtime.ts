/** Experimental JavaScript Component Model runtime contract, independent of package version. */
export const CM_RUNTIME_API_VERSION = 1 as const;

export type RuntimeApiVersion = number;
export type ResourceHandle = number;
export type ResourceRep = number;
export type ResourceScope = number;

export interface RuntimeErrorConstructor {
    new (message?: string, options?: ErrorOptions): Error;
    readonly prototype: Error;
}

/** Trap capability from the WebAssembly implementation selected by the bindings. */
export interface TrapContext {
    readonly RuntimeError: RuntimeErrorConstructor;
}

/** Stable per-instantiation capability; the table and handle remain call operands. */
export type ResourceTableGetContext = TrapContext;

export interface ResourceTableEntry {
    readonly rep: ResourceRep;
    readonly scope: ResourceScope;
    readonly own: boolean;
}

/** Exports required at the public intrinsics/resource subpath. */
export interface ResourceModule {
    readonly tableFlag: number;
    readonly tableOwn: number;
    readonly initializeHandleIndexSpaces: () => ResourceHandleIndexSpaces;
    readonly initializeHandleTables: () => ResourceHandleTables;
    readonly initializeCallBorrows: () => ResourceCallBorrowList;
    readonly initializeCurrentBorrows: () => ResourceCurrentBorrowList;
    readonly initializeResourceScopeCounter: () => ResourceScopeCell;
    readonly initializeResourceScopeTasks: () => ResourceScopeTasks;
    readonly initializeScopeId: () => ResourceScopeCell;
    readonly getHandleIndexSpace: (spaces: ResourceHandleIndexSpaces, key: number | ResourceTable) => HandleIndexSpace;
    readonly tableCreateBorrow: (
        spaces: ResourceHandleIndexSpaces,
        table: ResourceTable,
        rep: ResourceRep,
        scopeId: ResourceScope,
    ) => ResourceHandle;
    readonly tableCreateOwn: (
        spaces: ResourceHandleIndexSpaces,
        table: ResourceTable,
        rep: ResourceRep,
    ) => ResourceHandle;
    readonly tableGet: (
        context: ResourceTableGetContext,
        table: ArrayLike<number>,
        handle: ResourceHandle,
    ) => ResourceTableEntry;
    readonly tableEnsureBorrowDrop: (table: ArrayLike<number>, handle: ResourceHandle, scope: ResourceScope) => void;
    readonly tableRemove: (
        context: ResourceTableRemoveContext,
        table: ResourceTable,
        handle: ResourceHandle,
    ) => ResourceTableEntry;
    readonly transferBorrow: (
        context: ResourceTransferBorrowContext,
        handle: ResourceHandle,
        fromTid: number,
        toTid: number,
    ) => number;
    readonly transferBorrowValidLifting: ResourceModule['transferBorrow'];
    readonly transferOwn: (
        context: ResourceTransferOwnContext,
        handle: ResourceHandle,
        fromTid: number,
        toTid: number,
    ) => ResourceHandle;
    readonly callDestructor: <T>(context: ResourceDestructorContext, args: ResourceDestructorArgs<T>) => T;
}

/** Resizable pair slots and the metadata actually owned by this table. */
export interface ResourceTable extends Array<number> {
    _componentIdx?: number;
    _createdReps: Set<ResourceRep>;
}
export interface HandleIndexSpace {
    next: number;
    free: number[];
    readonly alloc: () => number;
    readonly release: (index: number) => void;
}
export interface ResourceHandleIndexSpaces {
    readonly get: (key: number | ResourceTable) => HandleIndexSpace | undefined;
    readonly set: (key: number | ResourceTable, space: HandleIndexSpace) => unknown;
}
export interface ResourceHandleTables {
    [tableId: number]: ResourceTable;
}
export interface ResourceScopeCell {
    value: ResourceScope;
}
export interface ResourceBorrowRecord {
    rid: number;
    handle: ResourceHandle;
}
export interface ResourceCallBorrowList {
    borrows: ResourceBorrowRecord[];
}
/** Host resource objects or generated { rsc, drop } cleanup entries. */
export interface ResourceCurrentBorrowList {
    borrows: object[];
}
export interface ResourceBorrowTask {
    readonly resourceScopeId: () => ResourceScope;
    readonly addResourceLender: (table: ResourceTable, handle: ResourceHandle) => void;
    readonly addBorrowedHandle: () => void;
    readonly removeBorrowedHandle: () => void;
}
export interface ResourceScopeTasks {
    readonly get: (scope: ResourceScope) => ResourceBorrowTask | undefined;
    readonly set: (scope: ResourceScope, task: ResourceBorrowTask) => unknown;
    readonly delete: (scope: ResourceScope) => boolean;
    readonly keys: () => IterableIterator<ResourceScope>;
}
export interface ResourceTableRemoveContext extends TrapContext {
    readonly indexSpaces: ResourceHandleIndexSpaces;
    readonly scopeTasks: Pick<ResourceScopeTasks, 'get'>;
}
export interface ResourceTransferOwnContext extends ResourceTableRemoveContext {
    readonly tables: ResourceHandleTables;
}
export interface ResourceTransferBorrowContext extends TrapContext {
    readonly indexSpaces: ResourceHandleIndexSpaces;
    readonly tables: ResourceHandleTables;
    readonly scope: ResourceScopeCell;
    readonly callBorrows: ResourceCallBorrowList;
    readonly taskLookup: TaskLookupContext<ResourceBorrowTask & TaskIdentity>;
}
export interface ResourceDestructorTask {
    readonly id: () => bigint;
    readonly enterSync: () => void;
    readonly resolve: (results: unknown[]) => void;
    readonly exit: (options?: { skipExclusiveLockCheck: boolean }) => void;
    readonly isResolvedState: () => boolean;
    readonly setErrored: (error: unknown) => void;
    readonly reject: (error: unknown) => void;
    readonly isExited: () => boolean;
}
export interface ResourceDestructorCreateArgs {
    readonly componentIdx: number;
    readonly isAsync: false;
    readonly callingWasmExport: true;
    readonly entryFnName: '<resource-drop>';
}
export interface ResourceDestructorArgs<T> {
    readonly componentIdx: number;
    readonly dtor: (rep: ResourceRep) => T;
    readonly rep: ResourceRep;
}
export interface ResourceDestructorContext {
    readonly creation: TaskCreateContext;
    readonly registers: TaskRegisters;
}

/** Type-only conformance map. No runtime registry or factory is required. */
export interface RuntimeModuleContracts {
    readonly 'intrinsics/resource': ResourceModule;
    readonly 'intrinsics/conversion': ConversionModule;
    readonly 'intrinsics/js-helper': JsHelperModule;
    readonly 'intrinsics/string': StringModule;
    readonly 'intrinsics/webidl': WebIdlModule;
    readonly 'intrinsics/core': CoreModule;
    readonly 'intrinsics/component': ComponentModule;
    readonly 'intrinsics/waitable': WaitableModule;
    readonly 'intrinsics/error-context': ErrorContextModule;
    readonly 'intrinsics/async-task': AsyncTaskModule;
    readonly 'intrinsics/host': HostModule;
    readonly 'intrinsics/lift': LiftModule;
    readonly 'intrinsics/lower': LowerModule;
    readonly 'intrinsics/future': FutureModule;
    readonly 'intrinsics/stream': StreamModule;
}

/** Only the numeric validation policy selected for one instantiation. */
export interface StrictNumericContext {
    readonly strict: boolean;
}

/** Mutable scratch views share storage; property identities remain stable. */
export interface Bitcast32Context {
    readonly i32: { [index: number]: number };
    readonly f32: { [index: number]: number };
}
export interface Bitcast64Context {
    readonly i64: { [index: number]: bigint };
    readonly f64: { [index: number]: number };
}

/** Named calls and narrowly scoped storage initializers at intrinsics/conversion. */
export interface ConversionModule {
    readonly initializeBitcast32: () => Bitcast32Context;
    readonly initializeBitcast64: () => Bitcast64Context;
    readonly i32ToF32: (context: Bitcast32Context, value: number) => number;
    readonly f32ToI32: (context: Bitcast32Context, value: number) => number;
    readonly i64ToF64: (context: Bitcast64Context, value: bigint) => number;
    readonly f64ToI64: (context: Bitcast64Context, value: number) => bigint;
    readonly i32ToChar: (value: number) => string;
    readonly toInt8: (context: StrictNumericContext, value: unknown) => number;
    readonly toUint8: (context: StrictNumericContext, value: unknown) => number;
    readonly toInt16: (context: StrictNumericContext, value: unknown) => number;
    readonly toUint16: (context: StrictNumericContext, value: unknown) => number;
    readonly toInt32: (context: StrictNumericContext, value: unknown) => number;
    readonly toUint32: (context: StrictNumericContext, value: unknown) => number;
    readonly toInt64: (context: StrictNumericContext, value: unknown) => bigint;
    readonly toUint64: (context: StrictNumericContext, value: unknown) => bigint;
    readonly toString: (value: unknown) => string;
    readonly toResultString: (value: unknown) => string | undefined;
    readonly isValidNumericPrimitive: (type: string, value: unknown) => boolean;
    readonly requireValidNumericPrimitive: (type: string, value: unknown) => true;
    readonly splitInt64: (value: bigint) => [number, number];
    readonly mergeInt64: (low: number, high: number) => bigint;
}

/** Mutable view owner shared by all selected memory loads/stores in one instantiation. */
export interface DataViewCacheContext {
    view: DataView;
}

export interface JsHelperModule {
    readonly emptyFunc: (...args: unknown[]) => void;
    readonly initializeDataViewCache: () => DataViewCacheContext;
    readonly dataView: (context: DataViewCacheContext, memory: { readonly buffer: ArrayBufferLike }) => DataView;
}

export type StringRealloc = (oldPtr: number, oldSize: number, alignment: number, newSize: number) => number;
export type AsyncStringRealloc = (
    oldPtr: number,
    oldSize: number,
    alignment: number,
    newSize: number,
) => number | PromiseLike<number>;
export interface StringMemory {
    readonly buffer: ArrayBufferLike;
}
export interface StringAllocation {
    ptr: number;
    len: number;
    /** Omitted for the empty UTF-8 sentinel. */
    codepoints?: number;
}
export interface StringDecoder {
    readonly decode: (input: ArrayBufferLike | ArrayBufferView) => string;
}
export interface StringEncodeInto {
    readonly encodeInto: (input: string, destination: Uint8Array) => { read: number; written: number };
}
export interface StringEncoder extends StringEncodeInto {
    readonly encode: (input: string) => Uint8Array;
}
export interface Utf16EncodingContext {
    readonly littleEndian: boolean;
}

/** Independently selected codecs and operations at intrinsics/string. */
export interface StringModule {
    readonly compactUtf16Decode: (
        decoder: StringDecoder,
        memory: StringMemory,
        ptr: number,
        taggedLength: number,
    ) => string;
    readonly compactUtf16Encode: (
        context: Utf16EncodingContext,
        value: unknown,
        realloc: StringRealloc,
        memory: StringMemory,
    ) => StringAllocation;
    readonly initializeUtf8Decoder: () => StringDecoder;
    readonly initializeUtf16Decoder: () => StringDecoder;
    readonly initializeUtf8Encoder: () => StringEncoder;
    readonly initializeUtf16Encoding: () => Utf16EncodingContext;
    readonly utf16Encode: (
        context: Utf16EncodingContext,
        value: unknown,
        realloc: StringRealloc,
        memory: StringMemory,
    ) => StringAllocation;
    readonly utf16EncodeAsync: (
        context: Utf16EncodingContext,
        value: unknown,
        realloc: AsyncStringRealloc,
        memory: StringMemory,
    ) => Promise<StringAllocation>;
    readonly utf16ValidatingCopy: (from: Uint16Array, to: Uint16Array) => boolean;
    readonly utf8Encode: (
        encoder: StringEncodeInto,
        value: unknown,
        realloc: StringRealloc,
        memory: StringMemory,
    ) => StringAllocation;
    readonly utf8EncodeAsync: (
        encoder: StringEncodeInto,
        value: unknown,
        realloc: AsyncStringRealloc,
        memory: StringMemory,
    ) => Promise<StringAllocation>;
    readonly validateGuestChar: (value: number) => string;
    readonly validateHostChar: (value: unknown) => number | undefined;
}

/** Mutable cache owner; proxy internals are created only on first use. */
export interface WebIdlProxyCacheContext {
    proxy: object | undefined;
}

export interface WebIdlModule {
    readonly initializeWebIdlProxyCache: () => WebIdlProxyCacheContext;
    readonly globalThisIdlProxy: (context: WebIdlProxyCacheContext) => object;
}

/** Task and compiler capabilities; no operation namespace is assembled. */
export type AsyncDeterminism = 'random' | 'deterministic';
export type RuntimeMemory = {
    readonly buffer: ArrayBufferLike;
};
export interface TaskMeta {
    threadID: number;
    taskID: bigint;
    componentIdx: number;
}
export interface TaskRegisters {
    [componentIdx: number]: TaskMeta | null | undefined;
    current?: TaskMeta | null;
}
export interface MemoryMeta {
    componentIdx: number;
    memoryIdx?: number;
    memory?: RuntimeMemory;
}
/** Shared component and task owners used by the selected suspending wrapper. */
export interface SuspendingImportContext extends TrapContext {
    readonly registers: TaskRegisters;
    readonly mayLeave: ComponentMayLeaveContext;
    readonly traps: ComponentRecordTrapContext;
    readonly states: ComponentStateLookupContext;
    readonly threadLookup: ThreadLookupContext;
    readonly mayBlock: TaskMayBlockGlobal;
}
export interface ComponentError extends Error {
    readonly payload: unknown;
}
export interface ComponentErrorConstructor {
    new (value: unknown): ComponentError;
}
export interface RepTable<T = unknown> {
    target: unknown;
    readonly data: () => (T | number | symbol | null)[];
    readonly insert: (value: T) => number;
    readonly get: (rep: number) => T | undefined;
    readonly contains: (rep: number) => boolean;
    readonly remove: (rep: number) => T;
    readonly size: () => number;
    readonly clear: () => void;
}
export interface RepTableConstructor {
    new <T = unknown>(args?: { target?: unknown; space?: Pick<HandleIndexSpace, 'alloc' | 'release'> }): RepTable<T>;
    readonly FREE: symbol;
}
/** Context passed to the generated element lift/lower functions. */
export interface BufferElementContext {
    storagePtr: number;
    memory: RuntimeMemory;
    componentIdx: number;
    stringEncoding: string;
    realloc?: StringRealloc;
    getReallocFn?: () => StringRealloc;
    vals?: unknown[];
    readonly liftResource?: (
        handle: number,
        tableIdx: number,
    ) => {
        rep: number;
    };
    readonly lowerResource?: (
        resource: {
            rep: number;
        },
        tableIdx: number,
    ) => number;
}
export interface BufferElementMetadata {
    size32?: number;
    isNumeric?: boolean;
    align32: number;
    isNone?: boolean;
    payloadTypeName?: string;
    stringEncoding?: string;
    readonly liftFn?: (ctx: BufferElementContext) => [unknown, unknown];
    readonly lowerFn?: (ctx: BufferElementContext) => unknown;
    getReallocFn?: () => StringRealloc;
}
export interface ManagedBufferOptions {
    isReadable?: boolean;
    isWritable?: boolean;
    componentIdx: number;
    capacity: number;
    elemMeta: BufferElementMetadata;
    memory?: RuntimeMemory;
    start?: number;
    data?: unknown[];
    target?: unknown;
}
export interface ManagedBuffer {
    capacity: number;
    processed: number;
    target: unknown;
    readonly setTarget: (target: unknown) => void;
    readonly remaining: () => number;
    readonly componentIdx: () => number;
    readonly getElemMeta: () => BufferElementMetadata;
    readonly isHostOwned: () => boolean;
    readonly read: (
        count: number,
        options?: {
            transferResources?: boolean;
        },
    ) => unknown[];
    readonly write: (
        values: unknown[],
        options?: {
            transferResources?: boolean;
        },
    ) => void;
}
export interface ManagedBufferConstructor {
    new (args: ManagedBufferOptions): ManagedBuffer;
    readonly validateGuestBuffer: (
        memory: RuntimeMemory | undefined,
        start: number | undefined,
        count: number,
        elemMeta: BufferElementMetadata,
    ) => void;
    readonly MAX_LENGTH: number;
}
export type CreateBufferOptions = Omit<ManagedBufferOptions, 'capacity'> & {
    count: number;
    stringEncoding?: string;
};
export interface BufferManager {
    readonly getNextBufferID: (componentIdx: number) => bigint;
    readonly getBuffer: (componentIdx: number, bufferID: bigint) => ManagedBuffer | undefined;
    readonly createBuffer: (args: CreateBufferOptions) => {
        id: bigint;
        buffer: ManagedBuffer;
    };
    readonly deleteBuffer: (componentIdx: number, bufferID: bigint) => boolean | undefined;
}
export interface BufferManagerConstructor {
    new (): BufferManager;
}
export interface RuntimeFinalizationRegistry<T> {
    readonly unregister: (token: object) => boolean | void;
    /** Absent on the inline implementation's fallback when the host has no registry. */
    readonly register?: (target: object, heldValue: T, unregisterToken?: object) => void;
}
export type ConditionalTrampoline = (...args: number[]) => number | void;

export type HasOwnPropertyCapability = (this: unknown, key: PropertyKey) => boolean;
export interface ComponentMemoryMap {
    readonly get: (componentIdx: number) => Record<string, MemoryMeta> | undefined;
    readonly set: (componentIdx: number, memories: Record<string, MemoryMeta>) => unknown;
}
export type MemoryLookupCapability = Pick<ComponentMemoryMap, 'get'>;
export interface MemoryLookup {
    (map: MemoryLookupCapability, args: { componentIdx: number }): MemoryMeta[];
    (map: MemoryLookupCapability, args: { componentIdx: number; memoryIdx: number }): RuntimeMemory | undefined | [];
}
export interface CoreCompilePlatform {
    readonly compile: (bytes: BufferSource) => Promise<WebAssembly.Module>;
}
export interface CoreStreamingCompilePlatform extends CoreCompilePlatform {
    readonly compileStreaming: (source: Response | PromiseLike<Response>) => Promise<WebAssembly.Module>;
}
export interface CoreInstantiatePlatform {
    readonly instantiate: (module: WebAssembly.Module, imports?: WebAssembly.Imports) => Promise<WebAssembly.Instance>;
}
export interface Base64CompileContext {
    readonly WebAssembly: CoreCompilePlatform;
    readonly nodejsCompat: boolean;
}
export interface FileCompileReader {
    readonly readFile: (url: URL) => Promise<Uint8Array<ArrayBuffer>>;
}
export interface FileCompileCache {
    readonly node: boolean;
    fs: FileCompileReader | undefined;
}
export interface FetchCompileContext {
    readonly WebAssembly: CoreStreamingCompilePlatform;
    readonly nodejsCompat: boolean;
    readonly fileCache: FileCompileCache;
}
export interface ResourceBufferContext extends ResourceTableRemoveContext {
    readonly tables: ResourceHandleTables;
}
export interface AsyncEventCodes {
    NONE: 0;
    SUBTASK: 1;
    STREAM_READ: 2;
    STREAM_WRITE: 3;
    FUTURE_READ: 4;
    FUTURE_WRITE: 5;
    TASK_CANCELLED: 6;
}
export interface ConditionalSuspendingWasmModules {
    _conditionalSuspending1I32ToI32?: WebAssembly.Module;
    _conditionalSuspending2I32ToI32?: WebAssembly.Module;
    _conditionalSuspending3I32ToI32?: WebAssembly.Module;
    _conditionalSuspending3I32ToVoid?: WebAssembly.Module;
}
export type ConditionalSlowFn = (...args: number[]) => number | void | PromiseLike<number | void>;
export interface ConditionalSuspendingPlatform {
    readonly Instance: typeof WebAssembly.Instance;
    /** Accessed only when a selected trampoline is called, not during setup. */
    readonly Suspending: new (fn: ConditionalSlowFn) => unknown;
}
export interface ConditionalSuspendingContext<K extends keyof ConditionalSuspendingWasmModules> {
    readonly WebAssembly: ConditionalSuspendingPlatform;
    readonly modules: Pick<ConditionalSuspendingWasmModules, K>;
}
export interface CoreModule {
    readonly i32Min: number;
    readonly i32Max: number;
    readonly initializeAsyncDeterminism: (mode: AsyncDeterminism) => AsyncDeterminism;
    readonly initializeAsyncFunctionConstructor: () => Function;
    readonly initializeComponentErrorClass: () => ComponentErrorConstructor;
    readonly initializeRuntimeErrorConstructor: (platform: {
        readonly RuntimeError: RuntimeErrorConstructor;
    }) => RuntimeErrorConstructor;
    readonly initializeReadableStream: (chosen: typeof ReadableStream | undefined) => typeof ReadableStream;
    readonly initializeRepTableClass: (context: TrapContext) => RepTableConstructor;
    readonly initializeManagedBufferClass: (context: ResourceBufferContext) => ManagedBufferConstructor;
    readonly initializeBufferManagerClass: (ManagedBuffer: ManagedBufferConstructor) => BufferManagerConstructor;
    readonly initializeBufferManager: (BufferManager: BufferManagerConstructor) => BufferManager;
    readonly initializeFactTrapMessages: (messages: Record<number, string>) => Record<number, string>;
    readonly initializeSymbolCabiDispose: () => symbol;
    readonly initializeSymbolCabiLower: () => symbol;
    readonly initializeSymbolResourceHandle: () => symbol;
    readonly initializeSymbolResourceRep: () => symbol;
    readonly initializeSymbolDispose: () => symbol;
    readonly initializeSymbolAsyncIterator: () => symbol;
    readonly initializeSymbolIterator: () => symbol;
    readonly initializeEndianness: () => boolean;
    readonly initializeHasOwnProperty: () => HasOwnPropertyCapability;
    readonly initializeAsyncEventCodes: () => AsyncEventCodes;
    readonly initializeComponentMemoryMap: () => ComponentMemoryMap;
    readonly initializeTaskRegisters: () => TaskRegisters;
    readonly initializeConditionalSuspendingWasm: () => ConditionalSuspendingWasmModules;
    readonly initializeFileCompileCache: (nodejsCompat: boolean) => FileCompileCache;
    readonly debugLog: (...args: unknown[]) => void;
    readonly coinFlip: () => boolean;
    readonly typeCheckValidI32: (value: unknown) => boolean;
    readonly typeCheckAsyncFn: (constructor: Function, value: unknown) => boolean;
    readonly base64Compile: (context: Base64CompileContext, encoded: string) => Promise<WebAssembly.Module>;
    readonly fetchCompile: (context: FetchCompileContext, url: URL) => Promise<WebAssembly.Module>;
    readonly instantiateCore: (
        platform: CoreInstantiatePlatform,
        module: WebAssembly.Module,
        imports?: WebAssembly.Imports,
    ) => Promise<WebAssembly.Instance>;
    readonly clampGuest: (value: number, min: number, max: number) => number;
    readonly getErrorPayload: (hasOwnProperty: HasOwnPropertyCapability, error: unknown) => unknown;
    readonly getErrorPayloadString: (hasOwnProperty: HasOwnPropertyCapability, error: unknown) => unknown;
    readonly finalizationRegistryCreate: <T>(cleanup: (value: T) => void) => RuntimeFinalizationRegistry<T>;
    readonly disposeHostValue: (disposeSymbol: symbol, value: unknown, disposeFn?: (this: unknown) => unknown) => void;
    readonly throwInvalidBool: () => never;
    readonly throwUninitialized: () => never;
    readonly promiseWithResolvers: <T>() => {
        promise: Promise<T>;
        resolve(value: T | PromiseLike<T>): void;
        reject(reason?: unknown): void;
    };
    readonly registerMemory: (map: ComponentMemoryMap, args: MemoryMeta) => void;
    readonly lookupMemories: MemoryLookup;
    readonly getCurrentTaskMeta: (registers: TaskRegisters, componentIdx?: number | null) => TaskMeta | undefined;
    readonly setCurrentTaskMeta: (registers: TaskRegisters, args: TaskMeta) => TaskMeta;
    readonly withCurrentTaskMeta: <T>(registers: TaskRegisters, args: TaskMeta & { fn: () => T }) => T;
    readonly withCurrentTaskMetaAsync: <T>(
        registers: TaskRegisters,
        args: TaskMeta & { fn: () => T },
    ) => T | Promise<Awaited<T>>;
    readonly clearCurrentTaskMeta: (registers: TaskRegisters, args: TaskMeta) => Promise<void>;
    readonly suspendingImport: <A extends unknown[], T>(
        context: SuspendingImportContext,
        componentIdx: number,
        fn: (...args: A) => T,
        syncOnly?: boolean,
        switchesTask?: boolean,
        convertsRangeErrors?: boolean,
        callsHost?: boolean,
    ) => (...args: A) => T | Promise<T>;
    readonly conditionalSuspending1I32ToI32: (
        context: ConditionalSuspendingContext<'_conditionalSuspending1I32ToI32'>,
        fast: ConditionalTrampoline,
        slow: ConditionalSlowFn,
    ) => ConditionalTrampoline;
    readonly conditionalSuspending2I32ToI32: (
        context: ConditionalSuspendingContext<'_conditionalSuspending2I32ToI32'>,
        fast: ConditionalTrampoline,
        slow: ConditionalSlowFn,
    ) => ConditionalTrampoline;
    readonly conditionalSuspending3I32ToI32: (
        context: ConditionalSuspendingContext<'_conditionalSuspending3I32ToI32'>,
        fast: ConditionalTrampoline,
        slow: ConditionalSlowFn,
    ) => ConditionalTrampoline;
    readonly conditionalSuspending3I32ToVoid: (
        context: ConditionalSuspendingContext<'_conditionalSuspending3I32ToVoid'>,
        fast: ConditionalTrampoline,
        slow: ConditionalSlowFn,
    ) => ConditionalTrampoline;
}

/** The task operations used by component scheduling; tasks may still be generated inline. */
export interface ComponentTask {
    readonly id: () => bigint;
    readonly defaultThread: () => ComponentThread;
    readonly componentIdx: () => number;
    readonly taskState: () => unknown;
    readonly entryFnName: () => string | undefined;
    readonly getParentSubtask: () => unknown;
    readonly getRootTask: () => ComponentTask;
    readonly isResolvedState: () => boolean;
    readonly isRejected: () => boolean;
    readonly isCancelled: () => boolean;
    readonly needsExclusiveLock: () => boolean;
    readonly endFirstSlice: () => void;
    readonly notifyProgress: () => void;
    readonly setErrored: (error: unknown) => void;
    readonly reject: (error: unknown) => void;
}
export interface SuspendTaskOptions {
    task: ComponentTask;
    readonly readyFn: () => boolean;
    cancellable: boolean;
    readonly onResume?: (keepGoing: boolean) => void;
}
/** Structural thread contract used by the component scheduler. */
export interface ComponentThread {
    readonly id: () => number;
    readonly taskID: () => bigint;
    readonly componentIdx: () => number;
    readonly task: () => ComponentTask;
    readonly isCancelled: () => boolean;
    readonly isRejected: () => boolean;
    readonly notifyProgress: () => void;
}
export interface SuspendThreadOptions {
    thread: ComponentThread;
    readyFn: () => boolean;
    cancellable: boolean;
    onResume?: (keepGoing: boolean) => void;
    suspended?: boolean;
}
export interface SuspendedThread {
    thread: ComponentThread;
    readyFn: () => boolean;
    cancellable: boolean;
    resume: () => void;
    suspended: boolean;
}
export interface SuspendedTask extends SuspendedThread {
    task: ComponentTask;
}
export interface AdmissionTicket {
    taskID: bigint;
    promise: Promise<void>;
    readonly resolve: () => void;
    readonly reject: (reason?: unknown) => void;
}
export interface WaitableEvent {
    code: number;
    payload0: number;
    payload1: number;
}
/** Structural contract shared by component, task and waitable operations. */
export interface ComponentWaitable {
    target: unknown;
    readonly componentIdx: () => number | undefined;
    readonly isInSet: () => boolean;
    readonly idx: () => number | null;
    readonly setIdx: (idx: number) => void;
    readonly setTarget: (target: unknown) => void;
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
    readonly promise: () => Promise<void>;
    readonly hasPendingEvent: () => boolean;
    readonly setPendingEvent: (fn: () => WaitableEvent) => void;
    readonly getPendingEvent: () => WaitableEvent | null;
    readonly join: (set: ComponentWaitableSet | null) => void;
    readonly drop: () => void;
}
export interface ComponentWaitableSet {
    readonly addWaitable: (waitable: ComponentWaitable) => void;
    readonly removeWaitable: (waitable: ComponentWaitable) => void;
}
export type ComponentTickResult = 'done' | 'resumed' | 'idle';
export interface ComponentAsyncState {
    readonly handles: RepTable;
    readonly subtasks: RepTable;
    readonly threads: RepTable<ComponentThread>;
    mayLeave: boolean;
    readonly componentIdx: () => number;
    readonly errored: () => boolean;
    readonly setErrored: (error?: unknown) => void;
    readonly markTrapped: (error: unknown) => boolean;
    readonly isTrapped: () => boolean;
    readonly throwIfInterrupted: () => void;
    readonly throwIfTrapped: () => void;
    readonly callingSyncImport: {
        (): boolean;
        (value: boolean): void;
    };
    readonly waitForSyncImportCallEnd: () => Promise<void>;
    readonly setBackpressure: (value: number) => number;
    readonly getBackpressure: () => number;
    readonly incrementBackpressure: () => number;
    readonly decrementBackpressure: () => number;
    readonly hasBackpressure: () => boolean;
    readonly waitForBackpressure: () => Promise<null>;
    readonly registerHandler: (args: { event: string; readonly fn: (value: number) => void }) => bigint;
    readonly removeHandler: (args: { event: string; handlerID: bigint }) => void;
    readonly getBackpressureWaiters: () => bigint;
    readonly addBackpressureWaiter: () => void;
    readonly removeBackpressureWaiter: () => void;
    readonly isExclusivelyLocked: () => boolean;
    readonly exclusivelyLockedBy: (taskID: bigint) => boolean;
    readonly exclusiveLock: (taskID: bigint) => void;
    readonly acquireExclusiveLock: (taskID: bigint) => Promise<void> | undefined;
    readonly takeAdmissionTicket: (taskID: bigint) => AdmissionTicket;
    readonly hasPendingAdmissions: () => boolean;
    readonly waitForAdmissionTurn: (ticket: AdmissionTicket) => Promise<void> | undefined;
    readonly releaseAdmissionTicket: (ticket: AdmissionTicket) => void;
    readonly abandonAdmissionWaiters: () => void;
    readonly abandonLockWaiters: () => void;
    readonly cancelExclusiveLockWaiter: (taskID: bigint) => boolean;
    readonly exclusiveRelease: (taskID: bigint) => boolean;
    readonly onNextExclusiveRelease: (fn: () => void) => void;
    readonly waitForExclusiveRelease: () => Promise<void>;
    readonly suspendThread: (args: SuspendThreadOptions) => Promise<boolean> | undefined;
    readonly resumeThread: (thread: ComponentThread) => boolean;
    readonly markThreadReady: (thread: ComponentThread) => boolean;
    readonly isThreadSuspended: (thread: ComponentThread) => boolean;
    readonly isThreadReady: (thread: ComponentThread) => boolean;
    readonly suspendedThreadReady: (thread: ComponentThread) => boolean;
    readonly suspendTask: (args: SuspendTaskOptions) => Promise<boolean> | undefined;
    readonly resumeTaskByID: (taskID: bigint) => boolean;
    readonly suspendedTaskReady: (taskID: bigint) => boolean;
    readonly suspendedTaskCancellable: (taskID: bigint) => boolean;
    readonly isTaskSuspended: (taskID: bigint) => boolean;
    readonly suspendedTaskMetas: () => IterableIterator<SuspendedTask>;
    readonly addPendingTaskStart: () => void;
    readonly removePendingTaskStart: () => void;
    readonly hasPendingSchedulerWork: () => boolean;
    readonly runTickLoop: () => Promise<void>;
    readonly tick: () => ComponentTickResult;
    readonly createWaitable: (args?: { target?: unknown }) => ComponentWaitable;
}
export interface ComponentAsyncStateConstructor {
    new (args: { componentIdx: number }): ComponentAsyncState;
    readonly EVENT_HANDLER_EVENTS: string[];
    readonly TickResult: {
        DONE: 'done';
        RESUMED: 'resumed';
        IDLE: 'idle';
    };
}
export interface ComponentStoreAsyncState {
    // Opaque host timer handle, kept portable between Node and browsers.
    deadlockCheck: unknown | null;
    pendingHostOperations: number;
}
export interface ComponentDeadlockDetail {
    pendingHostOperations: number;
    suspendedTasks: {
        taskID: bigint;
        componentIdx: number;
        state: unknown;
        rootTaskID: bigint;
    }[];
    unresolvedRootTaskIDs: bigint[];
}

/** Actual owners shared with generated component and task code. */
export type ComponentInstanceFlags = Map<number, { value: number }>;
export interface ComponentStoreTrap {
    error: Error | null;
}
export type ComponentAsyncStates = Map<number, ComponentAsyncState>;
export interface ComponentNormalizeTrapContext extends TrapContext {
    readonly messages: Pick<ReadonlyMap<string, string>, 'get'>;
}
export interface ComponentDeadlockContext extends TrapContext {
    readonly storeTrap: ComponentStoreTrap;
    readonly storeAsyncState: ComponentStoreAsyncState;
    readonly asyncState: Pick<ComponentAsyncStates, 'values'>;
}
export interface ComponentHostOperationContext extends ComponentDeadlockContext {
    readonly symbolDispose: symbol;
}
export interface ComponentMayLeaveContext extends TrapContext {
    readonly instanceFlags: Pick<ComponentInstanceFlags, 'get'>;
}
export interface ComponentStateLookupContext {
    readonly asyncState: Pick<ComponentAsyncStates, 'has' | 'get' | 'set'>;
    readonly ComponentAsyncState: ComponentAsyncStateConstructor;
}
export interface ComponentPostReturnTrapContext extends TrapContext {
    readonly lookup: ComponentStateLookupContext;
    readonly stackOverflow: string;
    readonly uncaughtException: string;
}
export interface ComponentRecordTrapContext extends TrapContext {
    readonly registers: TaskRegisters;
    readonly lookup: ComponentStateLookupContext;
}
export interface ComponentAsyncStateContext extends TrapContext {
    readonly RepTable: RepTableConstructor;
    readonly indexSpaces: ResourceHandleIndexSpaces;
    readonly instanceFlags: Pick<ComponentInstanceFlags, 'get'>;
    readonly storeTrap: ComponentStoreTrap;
    readonly normalization: ComponentNormalizeTrapContext;
    readonly cannotEnter: string;
    readonly deadlock: ComponentDeadlockContext;
    readonly Waitable: new (args: { target?: unknown }) => ComponentWaitable;
}
export interface ComponentModule {
    readonly initializeInstanceFlags: () => ComponentInstanceFlags;
    readonly initializeStoreTrap: () => ComponentStoreTrap;
    readonly initializeStoreAsyncState: () => ComponentStoreAsyncState;
    readonly initializeComponentAsyncStates: () => ComponentAsyncStates;
    readonly initializeCoreTrapMessages: (messages: Readonly<Record<string, string>>) => Map<string, string>;
    readonly initializeComponentAsyncStateClass: (
        context: ComponentAsyncStateContext,
    ) => ComponentAsyncStateConstructor;
    readonly checkForDeadlock: (context: ComponentDeadlockContext) => void;
    readonly trackHostOperation: <T>(
        context: ComponentHostOperationContext,
        operation: () => T,
    ) => T | Promise<Awaited<T>>;
    readonly normalizeCoreTrap: <T>(context: ComponentNormalizeTrapContext, error: T) => T;
    readonly checkMayLeave: (context: ComponentMayLeaveContext, componentIdx: number) => void;
    readonly guardMayLeave: <A extends unknown[], T, R>(
        context: ComponentMayLeaveContext,
        componentIdx: number,
        fn: (this: R, ...args: A) => T,
    ) => (this: R, ...args: A) => T;
    readonly postReturnTrap: (context: ComponentPostReturnTrapContext, componentIdx: number, error: unknown) => Error;
    readonly guardPostReturn: <A extends unknown[], T>(
        context: ComponentPostReturnTrapContext,
        componentIdx: number,
        fn: (...args: A) => T,
    ) => (...args: A) => T;
    readonly recordTrap: (
        context: ComponentRecordTrapContext,
        componentIdx: number | null | undefined,
        error: unknown,
        convertsRangeErrors?: boolean,
    ) => unknown;
    readonly guardTrap: <A extends unknown[], T, R>(
        context: ComponentRecordTrapContext,
        componentIdx: number | null | undefined,
        fn: (this: R, ...args: A) => T,
        convertsRangeErrors?: boolean,
    ) => (this: R, ...args: A) => T;
    readonly getOrCreateAsyncState: (context: ComponentStateLookupContext, componentIdx: number) => ComponentAsyncState;
    readonly backpressureInc: (context: ComponentStateLookupContext, componentIdx: number) => void;
    readonly backpressureDec: (context: ComponentStateLookupContext, componentIdx: number) => void;
    readonly setAllError: (states: Pick<ComponentAsyncStates, 'values'>) => void;
}

export interface WaitableSuspendOptions {
    readonly readyFn: () => boolean;
    readonly cancellable: boolean;
}
/** Task capabilities used by waitables. */
export interface WaitableTask {
    readonly componentIdx: () => number;
    readonly deliverPendingCancel: (options: { cancellable: boolean }) => boolean;
    readonly isErrored: () => unknown;
    readonly suspendUntil: (options: WaitableSuspendOptions) => Promise<boolean>;
    readonly suspendUntilCallback: (options: WaitableSuspendOptions, onResume: (keepGoing: boolean) => void) => void;
}
export interface WaitableWaitOptions extends WaitableSuspendOptions {
    readonly task: WaitableTask;
}
export interface Waitable extends ComponentWaitable {
    /** Standalone hook: the supplied scheduler must implement waitUntil. */
    readonly waitForPendingEvent: (args: {
        cstate: { readonly waitUntil: (options: WaitableSuspendOptions) => unknown };
    }) => Promise<void>;
}
export interface WaitableConstructor {
    new (args: { componentIdx?: number; target?: unknown }): Waitable;
}
export interface WaitableSet extends ComponentWaitableSet {
    target: unknown;
    readonly componentIdx: () => number;
    readonly numWaitables: () => number;
    readonly numWaiting: () => number;
    readonly incrementNumWaiting: (n?: number) => void;
    readonly decrementNumWaiting: (n?: number) => void;
    readonly targets: () => unknown[];
    readonly setTarget: (target: unknown) => void;
    readonly shuffleWaitables: () => void;
    readonly removeWaitable: (waitable: ComponentWaitable) => ComponentWaitable | undefined;
    readonly hasPendingEvent: () => boolean;
    readonly getPendingEvent: () => WaitableEvent | null;
    readonly tryWait: (options: WaitableWaitOptions) => WaitableEvent | null;
    readonly waitUntil: (options: WaitableWaitOptions) => WaitableEvent | null | Promise<WaitableEvent | null>;
    readonly waitUntilCallback: (options: WaitableWaitOptions, onEvent: (event: WaitableEvent | null) => void) => void;
}
export interface WaitableSetConstructor {
    new (componentIdx: number): WaitableSet;
}
/** Memory and canonical options vary per trampoline and remain call operands. */
export interface WaitableMemoryContext {
    readonly componentIdx: number;
    readonly isAsync: boolean;
    readonly memoryIdx?: number;
    readonly getMemoryFn: () => RuntimeMemory;
}
export interface WaitableStoreEventOptions {
    readonly memory: RuntimeMemory;
    readonly ptr: number;
    readonly event: WaitableEvent | null;
    readonly componentIdx: number;
    readonly task: WaitableTask;
    readonly memoryIdx?: number;
}
export interface WaitableTaskLookup {
    readonly taskLookup: TaskLookupContext<WaitableTask & TaskIdentity>;
}
export interface WaitableSetNewContext {
    readonly lookup: ComponentStateLookupContext;
    readonly WaitableSet: WaitableSetConstructor;
}
export interface WaitableSetWaitContext extends TrapContext, WaitableSetNewContext, WaitableTaskLookup {}
export interface WaitableSetPollContext extends WaitableSetWaitContext {
    readonly events: Pick<AsyncEventCodes, 'NONE'>;
}
export interface WaitableSetRemoveContext extends TrapContext {
    readonly WaitableSet: WaitableSetConstructor;
}
export interface WaitableSetDropContext extends WaitableSetRemoveContext, WaitableTaskLookup {
    readonly lookup: ComponentStateLookupContext;
}
export interface WaitableJoinContext extends WaitableSetRemoveContext {
    readonly Waitable: WaitableConstructor;
    readonly lookup: ComponentStateLookupContext;
}
export interface WaitableModule {
    readonly initializeWaitableClass: () => WaitableConstructor;
    readonly initializeWaitableSetClass: (events: Pick<AsyncEventCodes, 'TASK_CANCELLED'>) => WaitableSetConstructor;
    readonly waitableSetNew: (context: WaitableSetNewContext, componentIdx: number) => number;
    readonly waitableSetWait: (
        context: WaitableSetWaitContext,
        memory: WaitableMemoryContext,
        setRep: number,
        resultPtr: number,
        syncOnly?: boolean,
    ) => number | Promise<number>;
    readonly waitableSetPoll: (
        context: WaitableSetPollContext,
        memory: WaitableMemoryContext,
        setRep: number,
        resultPtr: number,
    ) => number;
    readonly waitableSetDrop: (context: WaitableSetDropContext, componentIdx: number, setRep: number) => void;
    readonly removeWaitableSet: (
        context: WaitableSetRemoveContext,
        args: { state: Pick<ComponentAsyncState, 'handles'>; waitableSetRep: number },
    ) => void;
    readonly waitableJoin: (
        context: WaitableJoinContext,
        componentIdx: number,
        waitableRep: number,
        setRep: number,
    ) => void;
}

/** Store-wide metadata; origin fields are populated by errCtxNew. */
export interface GlobalErrorContext {
    refCount: number;
    debugMessage: string;
    localIdx?: number;
    waitableIdx?: number;
    componentIdx?: number;
    localTableIdx?: number;
}
/** Metadata in the component's shared handle table. */
export interface LocalErrorContext {
    globalRep: number;
    refCount: number;
    localIdx: number;
}
export interface GlobalErrorContextTableConstructor {
    new (): object;
    data: RepTable<GlobalErrorContext> | null;
    readonly get: () => RepTable<GlobalErrorContext>;
}
export type ErrorContextGlobalTable = Pick<GlobalErrorContextTableConstructor, 'get'>;
export type LocalErrorContextTables = Map<number, Map<number, RepTable<number>>>;
export interface ErrorContextTableRegistration {
    componentIdx: number;
    table: RepTable;
}
export type ErrorContextTableRegistrations = Record<number, ErrorContextTableRegistration>;
export interface ErrorContextLocation {
    readonly componentIdx: number;
    readonly localTableIdx: number;
}
export interface ErrorContextNewOptions extends ErrorContextLocation {
    readonly readStrFn: (ptr: number, len: number) => string;
}
export interface ErrorContextDebugOptions {
    readonly componentIdx: number;
    readonly writeStrFn: (message: string, outputPtr: number) => unknown;
}
export interface ErrorContextLocalTableContext {
    readonly localTables: Pick<LocalErrorContextTables, 'get' | 'set'>;
    readonly RepTable: RepTableConstructor;
}
export interface ErrorContextHandleContext {
    readonly globalTable: ErrorContextGlobalTable;
    readonly lookup: ComponentStateLookupContext;
}
export interface ErrorContextNewContext extends ErrorContextHandleContext {
    readonly local: ErrorContextLocalTableContext;
}
export type ErrorContextDropContext = ErrorContextNewContext & TrapContext;
export type ErrorContextDebugContext = ErrorContextHandleContext & TrapContext;
export interface ErrorContextTransferContext extends ErrorContextNewContext {
    readonly tables: Readonly<Record<number, Pick<ErrorContextTableRegistration, 'componentIdx'>>>;
}
export interface ErrorContextModule {
    readonly initializeGlobalErrorContextTableClass: (
        RepTable: RepTableConstructor,
    ) => GlobalErrorContextTableConstructor;
    readonly initializeErrorContextTableRegistrations: () => ErrorContextTableRegistrations;
    readonly initializeLocalErrorContextTables: () => LocalErrorContextTables;
    readonly errCtxNew: (
        context: ErrorContextNewContext,
        options: ErrorContextNewOptions,
        msgPtr: number,
        msgLen: number,
    ) => number;
    readonly errCtxDrop: (context: ErrorContextDropContext, location: ErrorContextLocation, handle: number) => void;
    readonly errCtxTransfer: (
        context: ErrorContextTransferContext,
        handle: number,
        srcTableIdx: number,
        destTableIdx: number,
    ) => number;
    readonly errCtxDebugMessage: (
        context: ErrorContextDebugContext,
        options: ErrorContextDebugOptions,
        handle: number,
        outputPtr: number,
    ) => void;
    readonly errCtxGetLocalTable: (
        context: ErrorContextLocalTableContext,
        componentIdx: number,
        tableIdx: number,
        options?: { upsert?: boolean },
    ) => RepTable<number>;
    readonly errCtxGlobalRefCountAdd: (
        globalTable: ErrorContextGlobalTable,
        globalRep: number,
        amount?: number | null,
    ) => number;
    readonly errCtxCreateLocalHandle: (
        context: ErrorContextHandleContext,
        componentIdx: number,
        localTable: RepTable<number>,
        globalRep: number,
    ) => { waitableIdx: number; localIdx: number };
    readonly errCtxReserveGlobalRep: (
        globalTable: ErrorContextGlobalTable,
        debugMessage: string,
        refCount: number,
    ) => { globalRep: number; errCtx: GlobalErrorContext };
}

export type TaskState = 'initial' | 'cancelled' | 'cancel-pending' | 'cancel-delivered' | 'resolved';

export interface TaskSuspendOptions {
    suspended?: boolean;
    readonly readyFn: () => boolean;
    cancellable?: boolean;
}

export type TaskCallback = ((...args: number[]) => number | Promise<number>) & {
    _jcoMaySuspend?: boolean;
};

export type TaskPostReturn = (value: unknown) => unknown;

export interface TaskLiftContext {
    componentIdx: number;
    params: unknown[];
    memory?: RuntimeMemory | null;
    useDirectParams?: boolean;
    stringEncoding?: string | null;
    storagePtr?: number;
    storageLen?: number;
    isBorrowed?: boolean;
    liftResource?: (handle: number, tableIdx: number) => unknown;
    [key: string]: unknown;
}

export type TaskLiftFn = (ctx: TaskLiftContext) => [unknown, TaskLiftContext];

export interface TaskLowerContext {
    componentIdx: number;
    params?: unknown[];
    useDirectParams?: boolean;
    storageLen?: number;
    lowerResource?: (value: unknown, tableIdx: number) => number;
    vals: unknown[];
    memory?: RuntimeMemory | null;
    realloc?: StringRealloc | null;
    storagePtr?: number;
    stringEncoding?: string | null;
    [key: string]: unknown;
}

export type TaskLowerFn = (ctx: TaskLowerContext) => unknown;

export interface TaskCallMetadata {
    callerThreadID?: number;
    readonly getMemoryFn?: () => RuntimeMemory | null | undefined;
    startFn?: (...args: unknown[]) => unknown;
    returnFn?: (...args: unknown[]) => unknown;
    returnFnCalled?: boolean;
    returnFnResult?: unknown;
    resultPtr?: number | null;
    memoryIdx?: number | null;
    memory?: RuntimeMemory | null;
    realloc?: StringRealloc | null;
    getReallocFn?: () => StringRealloc;
    lowers?: TaskLowerFn[];
    funcTypeIsAsync?: boolean;
    stringEncoding?: string | null;
}

export interface AsyncTaskOptions {
    componentIdx: number;
    isAsync?: boolean;
    isManualAsync?: boolean;
    preserveFutureResult?: boolean;
    entryFnName?: string;
    callingWasmExport?: boolean;
    callbackFn?: TaskCallback | null;
    callbackFnName?: string | null;
    getCalleeParamsFn?: () => unknown[];
    stringEncoding?: string | null;
    parentSubtask?: AsyncSubtask;
    errHandling?: unknown;
    resultPtr?: number;
}

export interface CreateTaskOptions extends AsyncTaskOptions {
    parentSubtaskID?: bigint;
    getCallbackFn?: () => TaskCallback;
    getParamsFn?: () => unknown[];
}

export interface CreateSubtaskOptions {
    componentIdx: number;
    childTask?: AsyncTask | null;
    parentTask?: AsyncTask;
    callMetadata?: TaskCallMetadata;
    fnName?: string;
    isAsync?: boolean;
    isManualAsync?: boolean;
}

export interface AsyncSubtaskOptions extends CreateSubtaskOptions {
    parentTask: AsyncTask;
    waitable: ComponentWaitable;
    memoryIdx?: number;
    target?: unknown;
}

export interface SubtaskLender {
    lends: number;
}

export interface AsyncThreadOptions {
    componentIdx: number;
    task: AsyncTask;
    startFn?: () => unknown;
}
export interface AsyncThread extends ComponentThread {
    storage: number[];
    readonly setId: (id: number) => void;
    readonly task: () => AsyncTask;
    readonly taskID: () => bigint;
    readonly state: () => 'not-started' | 'running' | 'completed';
    readonly isCancelled: () => boolean;
    readonly isRejected: () => boolean;
    readonly notifyProgress: () => void;
    readonly entryFnName: () => string | undefined;
    readonly getParentSubtask: () => AsyncSubtask | null;
    readonly suspend: (options: TaskSuspendOptions & { releaseLock?: boolean }) => Promise<boolean>;
    readonly start: () => void;
}
export interface AsyncThreadConstructor {
    new (options: AsyncThreadOptions): AsyncThread;
    readonly State: { NOT_STARTED: 'not-started'; RUNNING: 'running'; COMPLETED: 'completed' };
}
export interface ThreadLookupContext {
    readonly lookup: ComponentStateLookupContext;
    readonly registers: TaskRegisters;
}
export interface AsyncThreadClassContext extends ThreadLookupContext {
    readonly traps: ComponentRecordTrapContext;
}
export interface ThreadControlContext extends ThreadLookupContext, TrapContext {
    readonly AsyncThread: AsyncThreadConstructor;
}
export interface ThreadOperationOptions {
    componentIdx: number;
    isCancellable?: boolean;
}
export interface ThreadStartPlatform {
    readonly Module: typeof WebAssembly.Module;
    readonly Instance: typeof WebAssembly.Instance;
    readonly LinkError: typeof WebAssembly.LinkError;
    readonly promising: (fn: Function) => (...args: number[]) => Promise<unknown>;
}
export interface ThreadStartChecks {
    readonly platform: ThreadStartPlatform;
    readonly checked: WeakSet<Function>;
    readonly typeCheck: WebAssembly.Module;
}
export interface ThreadNewContext extends ThreadControlContext {
    readonly start: ThreadStartChecks;
}
export interface AsyncThreadMeta {
    id: number;
    componentIdx: number;
    taskID: bigint;
    task: AsyncTask;
    thread: AsyncThread;
}

export interface AsyncTask extends ComponentTask, WaitableTask {
    readonly calleeIsAsync: () => boolean;
    readonly addThread: (thread: AsyncThread) => AsyncThread;
    readonly removeThread: (thread: AsyncThread) => void;
    readonly defaultThread: () => AsyncThread;
    readonly enterHost: () => boolean;
    readonly cancellationPending: () => boolean;
    subtaskMeta?: HostSubtaskMetadata;
    cancelled: boolean;
    cancelRequested: boolean;
    alwaysTaskReturn: boolean;
    returnCalls: number;
    storage: number[];
    tmpRetI64HighBits: number;
    callbackFnIdx?: number | null;
    readonly taskState: () => TaskState;
    readonly resourceScopeId: () => number;
    readonly addBorrowedHandle: () => void;
    readonly removeBorrowedHandle: () => void;
    readonly addResourceLender: (table: ResourceTable, handle: number) => void;
    readonly validateResourceBorrowScope: () => void;
    readonly completionPromise: () => Promise<unknown>;
    readonly settleCompletion: () => void;
    readonly exitPromise: () => Promise<void>;
    readonly waitForProgress: () => Promise<void>;
    readonly isAsync: () => boolean;
    readonly isManualAsync: () => boolean;
    readonly isSync: () => boolean;
    readonly getErrHandling: () => unknown;
    readonly hasCallback: () => boolean;
    readonly getReturnMemoryIdx: () => number | null | undefined;
    readonly setReturnMemoryIdx: (idx: number | null | undefined) => void;
    readonly getReturnMemory: () => RuntimeMemory | null | undefined;
    readonly setReturnMemory: (memory: RuntimeMemory | null | undefined) => void;
    readonly setReturnLowerFns: (fns: TaskLowerFn[]) => void;
    readonly getReturnLowerFns: () => TaskLowerFn[] | null;
    readonly setCalleeIsAsync: (value: boolean) => void;
    readonly setParentSubtask: (subtask: AsyncSubtask | null) => void;
    readonly getParentSubtask: () => AsyncSubtask | null;
    readonly getRootTask: () => AsyncTask;
    readonly setPostReturnFn: (fn?: TaskPostReturn | null) => void;
    readonly setCallbackFn: (fn?: TaskCallback | null, name?: string | null) => void;
    readonly getCallbackFnName: () => string | undefined;
    readonly runCallbackFn: (...args: number[]) => number | Promise<number>;
    readonly getCalleeParams: () => unknown[];
    readonly mayBlock: () => boolean;
    readonly setFuncTypeIsAsync: (value: boolean) => void;
    readonly setReturnResultTypeIdx: (value: number | null) => void;
    readonly returnResultTypeIdx: () => number | null;
    readonly mayEnter: (task: AsyncTask) => boolean;
    readonly enterSync: () => boolean;
    readonly tryEnter: () => boolean | null;
    readonly enter: (options?: { isHost?: boolean }) => Promise<boolean>;
    readonly isRunningState: () => boolean;
    readonly isResolved: () => boolean;
    readonly isExited: () => boolean;
    readonly waitUntil: (options: TaskSuspendOptions) => Promise<boolean>;
    readonly yieldUntil: (options: TaskSuspendOptions) => Promise<WaitableEvent>;
    readonly suspendUntil: (options: TaskSuspendOptions) => Promise<boolean>;
    readonly suspendUntilCallback: (options: TaskSuspendOptions, onResume: (keepGoing: boolean) => void) => void;
    readonly immediateSuspendUntil: (options: TaskSuspendOptions) => Promise<boolean>;
    readonly immediateSuspend: (options: TaskSuspendOptions) => Promise<boolean>;
    readonly deliverPendingCancel: (options: { cancellable?: boolean }) => boolean;
    readonly cancellationRequested: () => boolean;
    readonly requestCancellation: () => void;
    readonly cancel: (args?: { error?: unknown }) => void;
    readonly onResolve: (value: unknown) => void;
    readonly registerOnResolveHandler: (fn: (value: unknown) => void) => void;
    readonly isErrored: () => unknown;
    readonly resolve: (results: unknown[]) => void;
    readonly exit: (args?: { skipExclusiveLockCheck?: boolean }) => void;
    readonly createSubtask: (args: CreateSubtaskOptions) => AsyncSubtask;
    readonly getLatestSubtask: () => AsyncSubtask | undefined;
    readonly getSubtaskByWaitableRep: (rep: number) => AsyncSubtask | undefined;
    readonly currentSubtask: () => AsyncSubtask | undefined;
    readonly removeSubtask: (subtask: AsyncSubtask) => AsyncSubtask;
}

export interface AsyncTaskConstructor {
    new (options: AsyncTaskOptions): AsyncTask;
    _ID: bigint;
    readonly State: {
        INITIAL: 'initial';
        CANCELLED: 'cancelled';
        CANCEL_PENDING: 'cancel-pending';
        CANCEL_DELIVERED: 'cancel-delivered';
        RESOLVED: 'resolved';
    };
    readonly BlockResult: {
        CANCELLED: 'block.cancelled';
        NOT_CANCELLED: 'block.not-cancelled';
    };
}

export interface AsyncSubtask {
    fnName: string | undefined;
    target: unknown;
    isAsync: boolean | undefined;
    isManualAsync: boolean | undefined;
    cancelProgress: Promise<unknown> | null;
    readonly id: () => bigint;
    readonly parentTaskID: () => bigint;
    readonly childTaskID: () => bigint | undefined;
    readonly state: () => number;
    readonly getWaitable: () => ComponentWaitable;
    readonly waitable: () => ComponentWaitable;
    readonly waitableRep: () => number | null;
    readonly ensureHandle: () => number;
    readonly join: (set: ComponentWaitableSet | null) => void;
    readonly getPendingEvent: () => WaitableEvent | null;
    readonly hasPendingEvent: () => boolean;
    readonly setPendingEvent: (fn: () => WaitableEvent) => void;
    readonly setTarget: (value: unknown) => void;
    readonly getResult: () => unknown;
    readonly setResult: (value: unknown) => void;
    readonly componentIdx: () => number;
    readonly setChildTask: (task: AsyncTask) => void;
    readonly getChildTask: () => AsyncTask | null;
    readonly getParentTask: () => AsyncTask;
    readonly setCallbackFn: (fn?: TaskCallback | null, name?: string | null) => void;
    readonly getCallbackFnName: () => string | undefined;
    readonly setPostReturnFn: (fn?: TaskPostReturn | null) => void;
    readonly setOnProgressFn: (fn: () => void) => void;
    readonly isNotStarted: () => boolean;
    readonly cancellationRequested: () => boolean;
    readonly requestCancellation: () => void;
    readonly setHostPendingResult: (value: unknown) => void;
    readonly registerOnStartHandler: (fn: () => void) => void;
    readonly onStart: (args?: { startFnParams?: unknown[] }) => unknown;
    readonly registerOnResolveHandler: (fn: (value: unknown) => void) => void;
    readonly reject: (error: unknown) => void;
    readonly onResolve: (value: unknown) => void;
    readonly getStateNumber: () => number;
    readonly isReturned: () => boolean;
    readonly getCallMetadata: () => TaskCallMetadata;
    readonly isResolved: () => boolean;
    readonly addLender: (lender: SubtaskLender) => void;
    readonly deliverResolve: () => void;
    readonly resolveDelivered: () => boolean;
    readonly drop: () => void;
    readonly getWaitableHandleIdx: () => number | null;
}

export interface AsyncSubtaskConstructor {
    new (options: AsyncSubtaskOptions): AsyncSubtask;
    _ID: bigint;
    readonly State: {
        STARTING: 0;
        STARTED: 1;
        RETURNED: 2;
        CANCELLED_BEFORE_STARTED: 3;
        CANCELLED_BEFORE_RETURNED: 4;
    };
}

export interface TaskIdentity {
    readonly id: () => bigint;
}
export interface AsyncTaskMeta<T extends TaskIdentity = AsyncTask> {
    id: bigint;
    componentIdx: number;
    task: T;
}

export interface TaskReturnOptions {
    componentIdx: number;
    readonly getMemoryFn: () => RuntimeMemory | null | undefined;
    memoryIdx?: number | null;
    callbackFnIdx?: number | null;
    liftFns: TaskLiftFn[];
    lowerFns?: TaskLowerFn[];
    stringEncoding?: string;
    useDirectParams?: boolean;
    resultTypeIdx?: number;
}

export interface TaskLowerImportOptions {
    componentIdx: number;
    functionIdx?: number;
    trampolineIdx?: number;
    isAsync: boolean;
    isManualAsync?: boolean;
    paramLiftFns?: TaskLiftFn[];
    resultLowerFns?: TaskLowerFn[];
    hasResultPointer?: boolean;
    funcTypeIsAsync?: boolean;
    metadata?: unknown;
    memoryIdx?: number | null;
    readonly getMemoryFn: () => RuntimeMemory | null | undefined;
    readonly getCallbackFn?: () => TaskCallback | null;
    readonly getPostReturnFn?: () => TaskPostReturn | null;
    isCancellable?: boolean;
    getReallocFn?: () => StringRealloc;
    stringEncoding?: string;
    importFn: ((...params: unknown[]) => unknown) & {
        fnName?: string;
    };
}

export interface TaskFutureValue {
    readonly resolveAsValue: (resolve: (value: unknown) => void) => void;
}

export interface SymmetricSyncGuestCall {
    threadID: number;
    callerThreadID: number;
    componentIdx: number;
    previousTaskMayBlock: number;
}

/** Actual task owners; no operation namespace is retained. */
export type AsyncTasksByComponent<T extends TaskIdentity = AsyncTask> = Map<number, AsyncTaskMeta<T>[]>;
export interface TaskLookupContext<T extends TaskIdentity = AsyncTask> {
    readonly registers: TaskRegisters;
    readonly tasks: Pick<AsyncTasksByComponent<T>, 'get'>;
}
export interface TaskClearContext<T extends TaskIdentity = AsyncTask> {
    readonly tasks: Pick<AsyncTasksByComponent<T>, 'get'>;
    readonly taskIds: bigint[];
    readonly componentIdxs: number[];
}
export interface TaskCreateContext<T extends AsyncTask = AsyncTask> {
    readonly AsyncThread: AsyncThreadConstructor;
    readonly AsyncTask: new (options: AsyncTaskOptions) => T;
    readonly tasks: Pick<AsyncTasksByComponent<T>, 'get' | 'set'>;
    readonly taskIds: bigint[];
    readonly componentIdxs: number[];
}
export interface TaskReturnRuntimeContext extends TaskLookupContext, TrapContext {}
export interface TaskCancelContext extends TaskLookupContext {
    readonly lookup: ComponentStateLookupContext;
}
export interface SubtaskCancelContext extends TaskCancelContext, TrapContext {
    readonly AsyncSubtask: AsyncSubtaskConstructor;
}
export interface TaskDriverContext extends TrapContext {
    readonly lookup: ComponentStateLookupContext;
    readonly WaitableSet: WaitableSetConstructor;
    readonly events: Pick<AsyncEventCodes, 'NONE' | 'TASK_CANCELLED'>;
    readonly strictNumeric: StrictNumericContext;
}
export interface TaskLowerImportRuntimeContext extends TaskCancelContext {
    readonly AsyncTask: Pick<AsyncTaskConstructor, 'State'>;
    readonly mayLeave: ComponentMayLeaveContext;
    readonly events: Pick<AsyncEventCodes, 'SUBTASK'>;
}
export interface TaskCompatImportRuntimeContext extends TaskCancelContext {
    readonly creation: TaskCreateContext;
    readonly mayLeave: ComponentMayLeaveContext;
    readonly events: Pick<AsyncEventCodes, 'SUBTASK'>;
}
export interface TaskSymmetricExitContext extends TaskCancelContext {
    readonly mayBlock: TaskMayBlockGlobal;
    readonly stack: SymmetricSyncGuestCall[];
}
export interface TaskSymmetricEnterContext extends TaskSymmetricExitContext {
    readonly creation: TaskCreateContext;
}
export interface SubtaskDropContext extends TrapContext {
    readonly lookup: ComponentStateLookupContext;
    readonly AsyncSubtask: AsyncSubtaskConstructor;
}
export interface AsyncSubtaskClassContext extends TrapContext {
    readonly lookup: ComponentStateLookupContext;
    readonly memories: MemoryLookupCapability;
    readonly disposeSymbol: symbol;
}
export interface AsyncTaskClassContext extends TrapContext {
    readonly traps: ComponentRecordTrapContext;
    readonly postReturn: ComponentPostReturnTrapContext;
    readonly AsyncSubtask: AsyncSubtaskConstructor;
    readonly Waitable: WaitableConstructor;
    readonly lookup: ComponentStateLookupContext;
    readonly events: Pick<AsyncEventCodes, 'NONE' | 'TASK_CANCELLED'>;
    readonly determinism: AsyncDeterminism;
    readonly scopeCounter: ResourceScopeCell;
    readonly scopeTasks: ResourceScopeTasks;
    readonly clearing: TaskClearContext;
    readonly registers: TaskRegisters;
    /** The selected constructor supplies the store's future identity. */
    readonly FutureValue: abstract new (...args: never[]) => TaskFutureValue;
}
/** A narrow selected platform, distinct from an absent WebAssembly implementation. */
export interface TaskGlobalPlatform {
    readonly Global?: new (descriptor: { value: 'i32'; mutable: true }, value: number) => TaskMutableRegister;
}
export interface TaskMutableRegister {
    value: number;
}
export type TaskMayBlockGlobal = TaskMutableRegister | false;
export interface AsyncTaskModule {
    readonly initializeThreadStartChecks: (platform: ThreadStartPlatform) => ThreadStartChecks;
    readonly threadIndex: (context: ThreadLookupContext, componentIdx: number) => number;
    readonly threadNewIndirect: (
        context: ThreadNewContext,
        options: { componentIdx: number; getStartFuncTableFn: () => WebAssembly.Table },
        index: number,
        value: number,
    ) => number;
    readonly threadResumeLater: (
        context: ThreadControlContext,
        options: { componentIdx: number },
        handle: number,
    ) => void;
    readonly threadSuspend: (context: ThreadControlContext, options: ThreadOperationOptions) => Promise<number>;
    readonly threadSuspendThenResume: (
        context: ThreadControlContext,
        options: ThreadOperationOptions,
        index: number,
    ) => Promise<number>;
    readonly threadYieldThenResume: (
        context: ThreadControlContext,
        options: ThreadOperationOptions,
        index: number,
    ) => Promise<number>;
    readonly threadSuspendThenPromote: (
        context: ThreadControlContext,
        options: ThreadOperationOptions,
        index: number,
    ) => number | Promise<number>;
    readonly threadYieldThenPromote: (
        context: ThreadControlContext,
        options: ThreadOperationOptions,
        index: number,
    ) => number | Promise<number>;

    readonly initializeAsyncThreadClass: (context: AsyncThreadClassContext) => AsyncThreadConstructor;
    readonly getCurrentThread: (
        context: ThreadLookupContext,
        componentIdx: number,
        threadID?: number,
        taskID?: bigint,
    ) => AsyncThreadMeta | undefined;
    readonly currentThreadOrThrow: (context: ThreadLookupContext, componentIdx: number) => AsyncThreadMeta;
    readonly createNewCurrentImplicitThread: (
        context: TaskCreateContext,
        args: CreateTaskOptions,
    ) => { task: AsyncTask; thread: AsyncThread; taskID: bigint; threadID: number };
    readonly clearCurrentThread: <T extends TaskIdentity = AsyncTask>(
        context: TaskClearContext<T>,
        componentIdx: number,
        taskID?: bigint,
        options?: { preserveTask?: boolean },
    ) => T | undefined;
    readonly initializeCurrentTaskMayBlock: (platform: TaskGlobalPlatform | false) => TaskMayBlockGlobal;
    readonly initializeAsyncBlockingCallDepth: (platform: TaskGlobalPlatform | false) => TaskMutableRegister;
    readonly asyncBlockedCode: 4294967295;
    readonly initializeAsyncSubtaskClass: (context: AsyncSubtaskClassContext) => AsyncSubtaskConstructor;
    readonly initializeAsyncTaskClass: (context: AsyncTaskClassContext) => AsyncTaskConstructor;
    readonly initializeTasksByComponent: () => AsyncTasksByComponent;
    readonly initializeCurrentTaskIds: () => bigint[];
    readonly initializeCurrentComponentIdxs: () => number[];
    readonly initializeSymmetricSyncGuestCallStack: () => SymmetricSyncGuestCall[];
    readonly contextSet: (
        context: ThreadLookupContext,
        options: { componentIdx?: number; slot: number },
        value: number,
    ) => void;
    readonly contextGet: (context: ThreadLookupContext, options: { componentIdx?: number; slot: number }) => number;
    readonly taskReturn: (context: TaskReturnRuntimeContext, options: TaskReturnOptions, ...params: unknown[]) => void;
    readonly subtaskDrop: (context: SubtaskDropContext, componentIdx: number, rep: number) => void;
    readonly asyncYield: (
        context: ThreadControlContext,
        options: { componentIdx: number; isCancellable?: boolean },
    ) => number | Promise<number>;
    readonly subtaskCancel: (
        context: SubtaskCancelContext,
        componentIdx: number,
        isAsync: boolean,
        rep: number,
        slowOnly?: boolean,
    ) => number | Promise<number>;
    readonly taskCancel: (context: TaskCancelContext, componentIdx: number) => void;
    readonly createNewCurrentTask: <T extends AsyncTask = AsyncTask>(
        context: TaskCreateContext<T>,
        args: CreateTaskOptions,
    ) => [T, bigint];
    readonly getCurrentTask: <T extends TaskIdentity = AsyncTask>(
        context: TaskLookupContext<T>,
        componentIdx: number,
        taskID?: bigint,
    ) => AsyncTaskMeta<T> | undefined;
    readonly clearCurrentTask: <T extends TaskIdentity = AsyncTask>(
        context: TaskClearContext<T>,
        componentIdx: number,
        taskID?: bigint,
    ) => T | undefined;
    readonly unpackCallbackResult: (context: TrapContext, result: number) => [number, number];
    readonly driverLoop: (
        context: TaskDriverContext,
        args: {
            componentState: ComponentAsyncState;
            task: AsyncTask;
            fnName?: string;
            isAsync?: boolean;
            callbackResult: unknown;
        },
    ) => void | Promise<void>;
    readonly lowerImport: (
        context: TaskLowerImportRuntimeContext,
        args: TaskLowerImportOptions,
        ...params: unknown[]
    ) => unknown;
    readonly lowerImportBackwardsCompat: (
        context: TaskCompatImportRuntimeContext,
        args: TaskLowerImportOptions,
        ...params: unknown[]
    ) => unknown;
    readonly symmetricSyncGuestCallEnter: (
        context: TaskSymmetricEnterContext,
        callerComponentIdx: number,
        calleeIsAsync: boolean,
        calleeComponentIdx: number,
        syncOnly?: boolean,
    ) => number | Promise<number>;
    readonly symmetricSyncGuestCallExit: (context: TaskSymmetricExitContext) => void;
}

/** Per-call fused-call metadata; runtime owners are separate context operands. */
export interface HostSyncStartOptions {
    readonly callbackIdx?: number | null;
    readonly getCallbackFn: () => (TaskCallback & { fnName?: string }) | null | undefined;
}
export interface HostStartOptions extends HostSyncStartOptions {
    readonly postReturnIdx?: number | null;
    readonly getPostReturnFn: () => TaskPostReturn | null | undefined;
}
export type HostCallee = ((...params: unknown[]) => unknown) & {
    _jcoMaySuspend?: boolean;
    _cachedPromising?: (...params: unknown[]) => Promise<unknown>;
};
export interface StoreEventOptions {
    readonly memory: RuntimeMemory;
    readonly ptr: number;
    readonly event: WaitableEvent | null;
}
export interface HostSubtaskMetadata {
    subtask: AsyncSubtask;
    calleeComponentIdx: number;
    callerComponentIdx: number;
    getCalleeParamsFn: () => unknown[];
    stringEncoding: string;
    isAsync: boolean;
}
/** Actual selected platform object; optional JSPI is read only at a cache miss. */
export interface HostPromisingPlatform {
    readonly promising?: (callee: HostCallee) => (...params: unknown[]) => Promise<unknown>;
}
export interface HostPrepareContext extends TaskLookupContext, TrapContext {
    readonly creation: TaskCreateContext;
    readonly mayBlock: TaskMayBlockGlobal;
}
export interface HostSyncStartContext extends TaskLookupContext {
    readonly componentIdxs: readonly number[];
    readonly lookup: ComponentStateLookupContext;
    readonly driver: TaskDriverContext;
    readonly platform: HostPromisingPlatform | undefined;
}
export interface HostAsyncStartContext extends HostSyncStartContext {
    readonly blockingDepth: TaskMutableRegister;
    readonly memories: MemoryLookupCapability;
    readonly events: Pick<AsyncEventCodes, 'SUBTASK'>;
}
export interface HostModule {
    readonly prepareCall: (
        context: HostPrepareContext,
        memoryIdx: number | null,
        getMemoryFn: () => RuntimeMemory | null | undefined,
        startFn: (...params: unknown[]) => unknown,
        returnFn: (...params: unknown[]) => unknown,
        callerComponentIdx: number,
        calleeComponentIdx: number,
        taskReturnTypeIdx: number,
        calleeIsAsyncInt: number,
        stringEncoding: number,
        resultCountOrAsync: number,
        ...params: unknown[]
    ) => void;
    readonly asyncStartCall: (
        context: HostAsyncStartContext,
        args: HostStartOptions,
        callee: HostCallee,
        paramCount: number,
        resultCount: number,
        flags: number,
    ) => number;
    readonly syncStartCall: (
        context: HostSyncStartContext,
        args: HostSyncStartOptions,
        callee: HostCallee,
        paramCount: number,
    ) => Promise<unknown>;
    readonly storeEventInComponentMemory: (args: StoreEventOptions) => number;
}

/** Metadata-driven lifting consumes the caller's live parameter/storage cursor. */
export interface LiftRecordMeta {
    readonly fieldMetas: readonly (readonly [string, TaskLiftFn, number, number])[];
    readonly size32: number;
    readonly align32: number;
}
export interface LiftVariantMeta {
    readonly caseMetas: readonly (readonly [
        string,
        TaskLiftFn | null,
        number,
        number,
        number | null,
        (readonly string[])?,
    ])[];
    readonly variantSize32: number;
    readonly variantAlign32: number;
    readonly variantPayloadOffset32: number;
    readonly variantFlatCount: number | null;
    readonly variantPayloadFlatTypes?: readonly string[] | null;
    isEnum?: boolean;
    readonly payloadMaybeNull?: boolean;
}
export interface LiftVariantContext {
    readonly scratch: DataView;
}
export interface LiftStringContext {
    readonly utf8: StringDecoder;
    readonly utf16: StringDecoder;
}
export interface LiftListMeta {
    readonly elemLiftFn: TaskLiftFn;
    readonly elemSize32: number;
    readonly elemAlign32: number;
    readonly knownLen?: number;
    readonly typedArray?: (new (values: number[]) => unknown) | (new (values: bigint[]) => unknown);
}
export interface LiftMapMeta {
    readonly keyLiftFn: TaskLiftFn;
    readonly valueLiftFn: TaskLiftFn;
    readonly entrySize32: number;
    readonly valueOffset32: number;
}
export interface LiftTupleMeta {
    readonly elemLiftFns: readonly (readonly [TaskLiftFn, number, number])[];
    readonly size32: number;
    readonly align32: number;
}
export interface LiftFlagsMeta {
    readonly names: readonly string[];
    readonly size32: number;
    readonly align32: number;
    readonly intSizeBytes: number;
}
export interface LiftFlagsContext {
    readonly asBigInt: boolean;
}
export interface LiftOwnMeta {
    readonly classNameFn: () => unknown;
    readonly createResourceFn: (handle: number) => unknown;
    readonly componentIdx: number;
    readonly tableIdx: number;
}
export interface LiftFutureMeta {
    readonly componentIdx: number;
    readonly futureTableIdx: number;
}
export interface LiftStreamMeta {
    readonly componentIdx: number;
    readonly streamTableIdx: number;
}
export interface LiftEndpoint {
    readonly isWritable: () => boolean;
    readonly isDoneState: () => boolean;
    readonly isIdleState: () => boolean;
    readonly isInSet: () => boolean;
}
/** Actual named owner views used by lifting. */
export type LiftFutureContext = FutureEndLookupContext;
export interface LiftStreamContext extends StreamEndLookupContext {
    readonly Stream: ExternalStreamConstructor;
}
export interface LiftErrorContext extends ErrorContextHandleContext {
    readonly local: ErrorContextLocalTableContext;
}
export interface LiftModule {
    readonly initializeLiftVariant: () => LiftVariantContext;
    readonly liftFlatBool: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatS8: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatU8: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatS16: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatU16: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatS32: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatU32: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatS64: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatU64: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatFloat32: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatFloat64: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatChar: (ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatStringAny: (context: LiftStringContext, ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatStringUTF8: (context: StringDecoder, ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatStringUTF16: (context: StringDecoder, ctx: TaskLiftContext) => [unknown, TaskLiftContext];
    readonly liftFlatRecord: (meta: LiftRecordMeta) => TaskLiftFn;
    readonly liftFlatVariant: (context: LiftVariantContext, meta: LiftVariantMeta) => TaskLiftFn;
    readonly liftFlatList: (context: TrapContext, meta: LiftListMeta) => TaskLiftFn;
    readonly liftFlatMap: (meta: LiftMapMeta) => TaskLiftFn;
    readonly liftFlatTuple: (meta: LiftTupleMeta) => TaskLiftFn;
    readonly liftFlatEnum: (context: LiftVariantContext, meta: LiftVariantMeta) => TaskLiftFn;
    readonly liftFlatOption: (context: LiftVariantContext, meta: LiftVariantMeta) => TaskLiftFn;
    readonly liftFlatResult: (context: LiftVariantContext, meta: LiftVariantMeta) => TaskLiftFn;
    readonly liftFlatFlags: (context: LiftFlagsContext, meta: LiftFlagsMeta) => TaskLiftFn;
    readonly liftFlatOwn: (meta: LiftOwnMeta) => TaskLiftFn;
    readonly liftFlatBorrow: (
        componentTableIdx: number,
        size: number,
        memory: unknown,
        vals: unknown[],
        storagePtr: number,
        storageLen: number,
    ) => never;
    readonly liftFlatFuture: (context: LiftFutureContext, meta: LiftFutureMeta) => TaskLiftFn;
    readonly liftFlatStream: (context: LiftStreamContext, meta: LiftStreamMeta) => TaskLiftFn;
    readonly liftFlatErrorContext: (
        context: LiftErrorContext,
        errCtxTableIdx: number,
        ctx: TaskLiftContext,
    ) => [unknown, TaskLiftContext];
}

export interface LowerRecordMeta {
    readonly fieldMetas: readonly (readonly [string, TaskLowerFn, number, number])[];
    readonly size32: number;
    readonly align32: number;
}
export type LowerVariantCaseMeta = readonly [string, TaskLowerFn | null, number, number, number | null];
export interface LowerVariantMeta {
    readonly caseMetas: readonly LowerVariantCaseMeta[];
    readonly variantSize32: number;
    readonly variantAlign32: number;
    readonly variantPayloadOffset32: number;
    readonly payloadMaybeNull?: boolean;
}
export interface LowerListMeta {
    readonly elemLowerFn: TaskLowerFn;
    readonly knownLen?: number;
    readonly size32?: number;
    readonly align32?: number;
    readonly elemSize32: number;
    readonly elemAlign32: number;
}
export interface LowerMapMeta {
    readonly keyLowerFn: TaskLowerFn;
    readonly valueLowerFn: TaskLowerFn;
    readonly entrySize32: number;
    readonly entryAlign32: number;
    readonly valueOffset32: number;
}
export interface LowerTupleMeta {
    readonly elemLowerMetas: readonly (readonly [TaskLowerFn, number, number])[];
    readonly size32: number;
    readonly align32: number;
}
export interface LowerOwnMeta {
    readonly lowerFn: (value: unknown) => number;
    readonly componentIdx: number;
    readonly tableIdx: number;
}
export interface LowerStringContext {
    readonly utf8: StringEncodeInto;
    readonly utf16: Utf16EncodingContext;
}
export interface LowerElementMeta extends FutureElementMetadata {
    stringEncoding?: string;
    [key: string]: unknown;
}
export interface LowerFutureMeta {
    readonly componentIdx: number;
    readonly futureTableIdx: number;
    readonly elemMeta: LowerElementMeta;
    readonly futureNestingLevel?: number;
}
export interface LowerStreamMeta {
    readonly componentIdx: number;
    readonly streamTableIdx: number;
    readonly elemMeta: LowerElementMeta;
}
export interface LowerFutureContext {
    readonly numeric: StrictNumericContext;
    readonly lookup: ComponentStateLookupContext;
    readonly resourceRep: symbol;
    readonly nestedSymbol: symbol;
    readonly futures: FutureGlobalMap;
    readonly creation: FutureCreateContext;
    readonly injection: FutureHostInjectContext;
}

export interface LowerStreamContext {
    readonly numeric: StrictNumericContext;
    readonly lookup: ComponentStateLookupContext;
    readonly resourceRep: symbol;
    readonly streams: StreamGlobalMap;
    readonly InternalStream: InternalStreamConstructor;
    readonly lowerable: StreamLowerableContext;
    readonly creation: StreamCreateContext;
    readonly source: StreamSourceContext;
    readonly injection: StreamHostInjectContext;
}
export interface LowerErrorContext extends ErrorContextNewContext {
    readonly numeric: StrictNumericContext;
}
export interface LowerModule {
    readonly lowerFlatBool: (context: StrictNumericContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatS8: (context: StrictNumericContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatU8: (context: StrictNumericContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatS16: (context: StrictNumericContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatU16: (context: StrictNumericContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatS32: (context: StrictNumericContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatU32: (context: StrictNumericContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatS64: (context: StrictNumericContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatU64: (context: StrictNumericContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatFloat32: (context: StrictNumericContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatFloat64: (context: StrictNumericContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatChar: (ctx: TaskLowerContext) => void;
    readonly lowerFlatStringAny: (context: LowerStringContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatStringUTF16: (context: Utf16EncodingContext, ctx: TaskLowerContext) => void;
    readonly lowerFlatStringUTF8: (context: StringEncodeInto, ctx: TaskLowerContext) => void;
    readonly lowerFlatRecord: (meta: LowerRecordMeta) => TaskLowerFn;
    readonly lowerFlatVariant: (context: StrictNumericContext, meta: LowerVariantMeta) => TaskLowerFn;
    readonly lowerFlatList: (context: StrictNumericContext, meta: LowerListMeta) => TaskLowerFn;
    readonly lowerFlatMap: (context: StrictNumericContext, meta: LowerMapMeta) => TaskLowerFn;
    readonly lowerFlatTuple: (meta: LowerTupleMeta) => TaskLowerFn;
    readonly lowerFlatFlags: (context: LiftFlagsContext, meta: LiftFlagsMeta) => TaskLowerFn;
    readonly lowerFlatEnum: (context: StrictNumericContext, meta: LowerVariantMeta) => TaskLowerFn;
    readonly lowerFlatOption: (context: StrictNumericContext, meta: LowerVariantMeta) => TaskLowerFn;
    readonly lowerFlatResult: (context: StrictNumericContext, meta: LowerVariantMeta) => TaskLowerFn;
    readonly lowerFlatOwn: (context: StrictNumericContext, meta: LowerOwnMeta) => TaskLowerFn;
    readonly lowerFlatBorrow: (ctx: TaskLowerContext) => never;
    readonly lowerFlatFuture: (context: LowerFutureContext, meta: LowerFutureMeta) => TaskLowerFn;
    readonly lowerFlatStream: (context: LowerStreamContext, meta: LowerStreamMeta) => TaskLowerFn;
    readonly lowerFlatErrorContext: (context: LowerErrorContext, errCtxTableIdx: number, ctx: TaskLowerContext) => void;
}

/** A one-layer awaitable preserves a future-valued payload without assimilating it. */
export type FutureValueResolve = (value: unknown) => unknown;
export type FutureValueReject = (reason: unknown) => unknown;
export interface FutureValueBox {
    readonly value: unknown;
}
export type FutureValueStart = () => FutureValueBox | PromiseLike<FutureValueBox>;
export interface FutureValue {
    readonly then: (resolve: FutureValueResolve, reject?: FutureValueReject) => Promise<unknown>;
    readonly resolveAsValue: (resolve: FutureValueResolve) => void;
}
export interface FutureValueConstructor {
    new (start: FutureValueStart): FutureValue;
    readonly prototype: FutureValue;
}

export interface FutureCopyResults {
    readonly COMPLETED: number;
    readonly DROPPED: number;
    readonly CANCELLED: number;
}
export interface FutureCopyStates {
    readonly IDLE: number;
    readonly SYNC_COPYING: number;
    readonly ASYNC_COPYING: number;
    readonly CANCELLING_COPY: number;
    readonly DONE: number;
    readonly CANCELLED?: number;
}
export type FutureOnCopyDone = (result: number) => void;
export interface FuturePendingBufferMeta {
    componentIdx?: number | null;
    buffer?: ManagedBuffer | null;
    isWrite?: boolean | null;
    onCopyDoneFn?: FutureOnCopyDone | null;
}
export interface FutureEndOptions {
    readonly pendingBufferMeta: FuturePendingBufferMeta;
    readonly waitable: ComponentWaitable;
    readonly isPeerDroppedFn?: () => boolean;
    readonly notifyPeerDroppedFn?: () => void;
}
export interface FutureEndBase {
    readonly getWaitable: () => ComponentWaitable;
    readonly setWaitable: (waitable: ComponentWaitable) => void;
    readonly setCopyState: (state: number) => void;
    readonly getCopyState: () => number;
    readonly isDoneState: () => boolean;
    readonly isCancelledState: () => boolean;
    readonly isIdleState: () => boolean;
    readonly isCopying: () => boolean;
    readonly setPendingBufferMeta: (meta: FuturePendingBufferMeta) => void;
    readonly resetPendingBufferMeta: () => void;
    readonly getPendingBufferMeta: () => FuturePendingBufferMeta;
    readonly resetAndNotifyPending: (result: number) => void;
    readonly setPendingEvent: (fn: () => WaitableEvent) => void;
    readonly hasPendingEvent: () => boolean;
    readonly isInSet: () => boolean;
    readonly getPendingEvent: () => WaitableEvent | null;
    readonly isDropped: () => boolean;
    readonly isPeerDropped: () => boolean;
    readonly notifyDropped: () => void;
    readonly drop: () => void;
}
export interface FutureEndConstructor {
    new (options: FutureEndOptions): FutureEndBase;
    readonly prototype: FutureEndBase;
    readonly CopyResult: FutureCopyResults;
    readonly CopyState: FutureCopyStates;
}

export interface FutureElementMetadata extends BufferElementMetadata {
    size32?: number;
    isBorrowed?: boolean;
    isNumeric?: boolean;
}
export interface FutureCopyOptions {
    readonly componentIdx: number;
    readonly buffer: ManagedBuffer;
    readonly onCopyDoneFn: FutureOnCopyDone;
}
export type FutureCleanup = () => void;
export interface FutureHostInjectFn {
    (args: { count: number }): Promise<FutureCleanup>;
    readonly drop?: () => unknown;
}
export interface FutureGuestCopyOptions {
    readonly elemMeta?: FutureElementMetadata;
    readonly componentIdx: number;
    readonly stringEncoding?: string;
    readonly getReallocFn?: () => StringRealloc;
    readonly isAsync?: boolean;
    readonly memory?: RuntimeMemory;
    readonly realloc?: StringRealloc;
    readonly ptr?: number;
    readonly data?: unknown[];
    readonly buffer?: ManagedBuffer;
}
export interface FutureHostReadOptions {
    readonly stringEncoding?: string;
}
export interface FutureHostWriteOptions extends FutureHostReadOptions {
    readonly value: unknown;
    readonly getReallocFn?: () => StringRealloc;
}
export interface FutureEndpointOptions extends FutureEndOptions {
    readonly target?: unknown;
    readonly elemMeta: FutureElementMetadata;
    readonly tableIdx: number;
    readonly hostInjectFn?: FutureHostInjectFn;
    readonly hostOwned?: boolean;
}
export interface FuturePayloadEnd extends FutureEndBase {
    target: unknown;
    readonly isReadable: () => boolean;
    readonly isWritable: () => boolean;
    readonly setTarget: (target: unknown) => void;
    readonly getElemMeta: () => FutureElementMetadata;
    readonly futureTableIdx: () => number;
    readonly setFutureTableIdx: (index: number) => void;
    readonly globalFutureMapRep: () => number | undefined;
    readonly setGlobalFutureMapRep: (index: number) => void;
    readonly waitableIdx: () => number | null;
    readonly setWaitableIdx: (index: number) => void;
    readonly handle: () => number | undefined;
    readonly setHandle: (index: number) => void;
    readonly setHostInjectFn: (fn: FutureHostInjectFn) => void;
    readonly promise: () => FutureValue;
    readonly cancel: () => void;
}
export interface FutureReadableEnd extends FuturePayloadEnd {
    readonly _read: (args: FutureCopyOptions) => void;
    readonly guestRead: (args: FutureGuestCopyOptions) => { buffer: ManagedBuffer };
    readonly hostRead: (args: FutureHostReadOptions) => Promise<FutureValueBox>;
}
export interface FutureWritableEnd extends FuturePayloadEnd {
    readonly _write: (args: FutureCopyOptions) => void;
    readonly guestWrite: (args: FutureGuestCopyOptions) => { buffer: ManagedBuffer };
    readonly hostWrite: (args: FutureHostWriteOptions) => Promise<boolean>;
}
export interface FutureReadableEndConstructor extends Pick<FutureEndConstructor, 'CopyState' | 'CopyResult'> {
    new (args: FutureEndpointOptions): FutureReadableEnd;
    readonly prototype: FutureReadableEnd;
}
export interface FutureWritableEndConstructor extends Pick<FutureEndConstructor, 'CopyState' | 'CopyResult'> {
    new (args: FutureEndpointOptions): FutureWritableEnd;
    readonly prototype: FutureWritableEnd;
}
export interface FutureBufferManager {
    readonly createBuffer: (
        options: CreateBufferOptions & { realloc?: StringRealloc; isReadable?: boolean; isWritable?: boolean },
    ) => { id: bigint; buffer: ManagedBuffer };
}
export interface FutureEndpointClassContext extends TrapContext {
    readonly FutureEnd: FutureEndConstructor;
    readonly FutureValue: FutureValueConstructor;
    readonly buffers: FutureBufferManager;
    readonly events: Pick<AsyncEventCodes, 'FUTURE_READ' | 'FUTURE_WRITE'>;
}
export interface FutureReadableClassContext extends FutureEndpointClassContext {
    readonly lookup: ComponentStateLookupContext;
}

export interface InternalFutureOptions {
    readonly tableIdx: number;
    readonly elemMeta: FutureElementMetadata;
    readonly readWaitable: ComponentWaitable;
    readonly writeWaitable: ComponentWaitable;
    readonly hostInjectFn?: FutureHostInjectFn;
    readonly componentIdx?: number;
}
export interface InternalFuture {
    readonly elemMeta: () => FutureElementMetadata;
    readonly readEnd: () => FutureReadableEnd;
    readonly writeEnd: () => FutureWritableEnd;
    readonly globalFutureMapRep: () => number | undefined;
    readonly setGlobalFutureMapRep: (index: number) => void;
}
export interface InternalFutureConstructor {
    new (options: InternalFutureOptions): InternalFuture;
    readonly prototype: InternalFuture;
}
export interface InternalFutureClassContext {
    readonly FutureReadableEnd: FutureReadableEndConstructor;
    readonly FutureWritableEnd: FutureWritableEndConstructor;
}

export interface FutureTable {
    readonly componentIdx: number;
    readonly table: RepTable<FuturePayloadEnd>;
}
export interface FutureTables {
    [tableIdx: number]: FutureTable;
}
export interface HostFutureOptions {
    readonly componentIdx: number;
    readonly futureEndWaitableIdx: number;
    readonly futureTableIdx: number;
    readonly payloadLiftFn: TaskLiftFn;
    readonly payloadLowerFn: TaskLowerFn;
}
export interface HostFuture {
    readonly setRep: (rep: number) => void;
    readonly getFutureEndWaitableIdx: () => number;
    readonly createUserFuture: () => FutureValue;
}
export interface HostFutureConstructor {
    new (options: HostFutureOptions): HostFuture;
    readonly prototype: HostFuture;
}
export type FutureGlobalMap = RepTable<InternalFuture | HostFuture>;
export interface FutureCreateContext {
    readonly InternalFuture: InternalFutureConstructor;
    readonly futures: FutureGlobalMap;
    readonly tables: FutureTables;
}
export interface FutureCreateOptions {
    readonly tableIdx: number;
    readonly elemMeta: FutureElementMetadata;
    readonly hostInjectFn?: FutureHostInjectFn;
}
export interface FutureCreated {
    readonly writeEnd: FutureWritableEnd;
    readonly writeEndWaitableIdx: number | null;
    readonly writeEndHandle: number | undefined;
    readonly readEndWaitableIdx: number | null;
    readonly readEndHandle: number | undefined;
    readonly readEnd: FutureReadableEnd;
}
export interface FutureTableContext extends TrapContext {
    readonly FutureEnd: FutureEndConstructor;
    readonly tables: FutureTables;
    readonly lookup: ComponentStateLookupContext;
}
export interface FutureEndLookupContext extends TrapContext, FutureTableContext {}
export interface FutureEndLocation {
    readonly tableIdx: number;
    readonly futureEndHandle?: number;
    readonly futureEndWaitableIdx?: number;
}
export interface FutureEndInsertion {
    readonly tableIdx: number;
    readonly futureEnd: FuturePayloadEnd;
}
export interface FutureEndRemoval {
    readonly tableIdx: number;
    readonly futureWaitableIdx: number;
}
export interface HostFutureClassContext extends TrapContext {
    readonly lookup: ComponentStateLookupContext;
    readonly ends: FutureEndLookupContext;
}

export interface FutureTask extends TaskIdentity {
    readonly mayBlock: () => boolean | undefined;
    readonly suspendUntil: (options: TaskSuspendOptions) => Promise<boolean>;
    readonly isErrored: () => unknown;
}
export interface FutureNewOptions {
    readonly componentIdx: number;
    readonly futureTableIdx: number;
    readonly elemMeta: FutureElementMetadata;
}
export interface FutureNewContext {
    readonly taskLookup: TaskLookupContext<FutureTask>;
    readonly lookup: ComponentStateLookupContext;
    readonly creation: FutureCreateContext;
}
export interface FutureNewFromLiftOptions extends HostFutureOptions {
    readonly payloadTypeSize32?: number;
}
export interface FutureNewFromLiftContext {
    readonly HostFuture: HostFutureConstructor;
    readonly futures: FutureGlobalMap;
}
export interface FutureOperationOptions {
    readonly elemMeta?: FutureElementMetadata;
    readonly componentIdx: number;
    readonly futureTableIdx: number;
    readonly memoryIdx?: number;
    readonly getMemoryFn?: () => RuntimeMemory;
    readonly reallocIdx?: number;
    readonly getReallocFn?: () => StringRealloc;
    readonly stringEncoding?: string;
    readonly isAsync?: boolean;
}
export interface FutureOperationContext extends TrapContext {
    readonly lookup: ComponentStateLookupContext;
    readonly taskLookup: TaskLookupContext<FutureTask>;
    readonly ends: FutureEndLookupContext;
    readonly events: Pick<AsyncEventCodes, 'FUTURE_READ' | 'FUTURE_WRITE'>;
    readonly Base: Pick<FutureEndConstructor, 'CopyState'>;
}
export interface FutureReadContext extends FutureOperationContext {
    readonly FutureEnd: FutureReadableEndConstructor;
}
export interface FutureWriteContext extends FutureOperationContext {
    readonly FutureEnd: FutureWritableEndConstructor;
}
export interface FutureDropContext extends TrapContext {
    readonly tables: FutureTableContext;
}
export interface FutureDropReadableContext extends FutureDropContext {
    readonly FutureEnd: FutureReadableEndConstructor;
}
export interface FutureDropWritableContext extends FutureDropContext {
    readonly FutureEnd: FutureWritableEndConstructor;
}
export interface FutureHostInjectContext {
    readonly nestedSymbol: symbol;
    readonly hasOwnProperty: HasOwnPropertyCapability;
    readonly disposeSymbol: symbol;
    readonly tracking: ComponentHostOperationContext;
}
export interface FutureHostInjectOptions {
    readonly promise: unknown;
    readonly hostWriteEnd: FutureWritableEnd;
    readonly stringEncoding?: string;
    readonly getReallocFn?: () => StringRealloc;
}

export interface FutureModule {
    readonly initializeFutures: (RepTable: RepTableConstructor) => FutureGlobalMap;
    readonly initializeNestedFutureSymbol: () => symbol;
    readonly initializeFutureTables: () => FutureTables;
    readonly initializeFutureValueClass: () => FutureValueConstructor;
    readonly initializeFutureEndClass: (
        events: Pick<AsyncEventCodes, 'FUTURE_READ' | 'FUTURE_WRITE'>,
    ) => FutureEndConstructor;
    readonly initializeFutureReadableEndClass: (context: FutureReadableClassContext) => FutureReadableEndConstructor;
    readonly initializeFutureWritableEndClass: (context: FutureEndpointClassContext) => FutureWritableEndConstructor;
    readonly initializeInternalFutureClass: (context: InternalFutureClassContext) => InternalFutureConstructor;
    readonly initializeHostFutureClass: (context: HostFutureClassContext) => HostFutureConstructor;
    readonly createFuture: (
        context: FutureCreateContext,
        state: ComponentAsyncState,
        args: FutureCreateOptions,
    ) => FutureCreated;
    readonly getFutureEnd: (context: FutureEndLookupContext, args: FutureEndLocation) => FuturePayloadEnd;
    readonly addFutureEndToTable: (
        context: FutureTableContext,
        args: FutureEndInsertion,
    ) => { handle: number; waitableIdx: number };
    readonly removeFutureEndFromTable: (context: FutureTableContext, args: FutureEndRemoval) => FuturePayloadEnd;
    readonly futureNew: (context: FutureNewContext, options: FutureNewOptions) => bigint;
    readonly futureNewFromLift: (context: FutureNewFromLiftContext, options: FutureNewFromLiftOptions) => FutureValue;
    readonly futureRead: (
        context: FutureReadContext,
        options: FutureOperationOptions,
        waitableIdx: number,
        ptr: number,
    ) => number | Promise<number>;
    readonly futureWrite: (
        context: FutureWriteContext,
        options: FutureOperationOptions,
        waitableIdx: number,
        ptr: number,
    ) => number | Promise<number>;
    readonly futureCancelRead: (
        context: FutureReadContext,
        options: FutureOperationOptions,
        waitableIdx: number,
    ) => number | Promise<number>;
    readonly futureCancelWrite: (
        context: FutureWriteContext,
        options: FutureOperationOptions,
        waitableIdx: number,
    ) => number | Promise<number>;
    readonly futureDropReadable: (
        context: FutureDropReadableContext,
        options: FutureOperationOptions,
        waitableIdx: number,
    ) => void;
    readonly futureDropWritable: (
        context: FutureDropWritableContext,
        options: FutureOperationOptions,
        waitableIdx: number,
    ) => void;
    readonly futureTransfer: (
        context: FutureEndLookupContext,
        waitableIdx: number,
        source: number,
        destination: number,
    ) => number;
    readonly genFutureHostInjectFn: (
        context: FutureHostInjectContext,
        options: FutureHostInjectOptions,
    ) => FutureHostInjectFn;
    readonly isFutureLowerableObject: (value: unknown) => boolean;
}

/** Stream classes and owners are selected once for each generated store. */
export interface StreamCopyResults {
    readonly COMPLETED: number;
    readonly DROPPED: number;
    readonly CANCELLED: number;
}
export interface StreamCopyStates {
    readonly IDLE: number;
    readonly SYNC_COPYING: number;
    readonly ASYNC_COPYING: number;
    readonly CANCELLING_COPY: number;
    readonly DONE: number;
    readonly CANCELLED?: number;
}
export interface StreamEvent extends WaitableEvent {
    rejectedLength?: number;
}
export type StreamOnCopyDone = (result: number, rejectedLength?: number) => void;
export type StreamOnCopy = (reclaim: () => void, result?: number) => void;
export interface StreamPendingBufferMeta {
    componentIdx?: number | null;
    buffer?: ManagedBuffer | null;
    onCopyFn?: StreamOnCopy | null;
    onCopyDoneFn?: StreamOnCopyDone | null;
    rejectLength?: number;
    dropAfterCopy?: boolean;
}
export interface StreamEndOptions {
    readonly tableIdx: number;
    readonly componentIdx?: number;
    readonly waitable: ComponentWaitable;
    readonly isPeerDroppedFn?: () => boolean;
    readonly notifyPeerDroppedFn?: () => void;
    readonly target?: unknown;
}
export interface StreamEndBase {
    target: unknown;
    readonly tableIdx: () => number;
    readonly idx: () => number | null;
    readonly setIdx: (index: number) => void;
    readonly setTarget: (target: unknown) => void;
    readonly getWaitable: () => ComponentWaitable;
    readonly setWaitable: (waitable: ComponentWaitable) => void;
    readonly setCopyState: (state: number) => void;
    readonly getCopyState: () => number;
    readonly isCopying: () => boolean;
    readonly setPendingEvent: (fn: () => StreamEvent) => void;
    readonly hasPendingEvent: () => boolean;
    readonly isInSet: () => boolean;
    readonly getPendingEvent: () => StreamEvent | null;
    readonly isDropped: () => boolean;
    readonly isPeerDropped: () => boolean;
    readonly notifyDropped: () => void;
    readonly drop: (options?: { allowPendingEvent?: boolean }) => void;
}
export interface StreamEndConstructor {
    new (options: StreamEndOptions): StreamEndBase;
    readonly prototype: StreamEndBase;
    readonly CopyResult: StreamCopyResults;
    readonly CopyState: StreamCopyStates;
}
export interface StreamElementMetadata extends FutureElementMetadata {
    typedArray?: new (values: unknown[]) => unknown;
    string?: string;
}
export type StreamCleanup = () => void;
export type StreamHostInjectFn = (args: { count: number }) => Promise<StreamCleanup>;
export interface StreamEndpointOptions extends StreamEndOptions {
    readonly elemMeta: StreamElementMetadata;
    readonly pendingBufferMeta: StreamPendingBufferMeta;
    readonly hostInjectFn?: StreamHostInjectFn;
    readonly hostOwned?: boolean;
}
export interface StreamCopyOptions {
    readonly isAsync?: boolean;
    readonly memory?: RuntimeMemory;
    readonly componentIdx: number;
    readonly ptr?: number;
    readonly count: number;
    readonly eventCode: number;
    readonly initial?: boolean;
    readonly skipStateCheck?: boolean;
    readonly stringEncoding?: string;
    readonly reallocFn?: StringRealloc;
    readonly realloc?: StringRealloc;
    readonly getReallocFn?: () => StringRealloc;
    readonly rejectLength?: number;
    readonly elemMeta?: StreamElementMetadata;
    readonly dropAfterCopy?: boolean;
    readonly deferSyncFinish?: boolean;
    readonly buffer?: ManagedBuffer;
    readonly bufferID?: bigint;
}
export interface StreamInnerCopyOptions {
    readonly buffer: ManagedBuffer;
    readonly onCopyFn: StreamOnCopy;
    readonly onCopyDoneFn: StreamOnCopyDone;
    readonly componentIdx: number;
    readonly rejectLength?: number;
    readonly dropAfterCopy?: boolean;
}
export interface StreamReadOptions {
    readonly count?: number;
    readonly rejectLength?: number;
    readonly dropAfterCopy?: boolean;
}
export interface StreamReadResult {
    value: unknown;
    done: boolean;
    rejectedLength?: number;
}
export interface StreamPayloadEnd extends StreamEndBase {
    readonly streamTableIdx: () => number;
    readonly setStreamTableIdx: (index: number) => void;
    readonly handle: () => number | undefined;
    readonly setHandle: (handle: number) => void;
    readonly globalStreamMapRep: () => number | undefined;
    readonly setGlobalStreamMapRep: (rep: number) => void;
    readonly waitableIdx: () => number | null;
    readonly setWaitableIdx: (index: number) => void;
    readonly setHostInjectFn: (fn: StreamHostInjectFn) => void;
    readonly setHostDropFn: (fn: (reason?: unknown) => unknown) => void;
    readonly setHostCancelFn: (fn: () => boolean) => void;
    readonly hasHostInject: () => boolean;
    readonly setSourceRebufferFn: (fn: (items: unknown[]) => void) => void;
    readonly getElemMeta: () => StreamElementMetadata;
    readonly isReadable: () => boolean;
    readonly isWritable: () => boolean;
    readonly isDoneState: () => boolean;
    readonly isCancelledState: () => boolean;
    readonly isIdleState: () => boolean;
    readonly setupCopy: (args: StreamCopyOptions) => {
        bufferID: bigint | undefined;
        buffer: ManagedBuffer;
        onCopyFn: StreamOnCopy;
        onCopyDoneFn: StreamOnCopyDone;
    };
    readonly copy: (args: StreamCopyOptions) => number | Promise<number>;
    readonly setPendingBufferMeta: (args: StreamPendingBufferMeta) => void;
    readonly resetPendingBufferMeta: () => void;
    readonly getPendingBufferMeta: () => StreamPendingBufferMeta;
    readonly hasPendingBuffer: () => boolean;
    readonly resetAndNotifyPending: (result: number) => void;
    readonly cancel: () => void;
}
export interface StreamReadableEnd extends StreamPayloadEnd {
    readonly read: (options?: number | StreamReadOptions) => Promise<StreamReadResult>;
    readonly _read: (args: StreamInnerCopyOptions) => void;
}
export interface StreamWritableEnd extends StreamPayloadEnd {
    readonly write: (value: unknown) => Promise<void>;
    readonly writeMany: (values: unknown[], opts?: { dropAfterCopy?: boolean }) => Promise<void>;
    readonly _write: (args: StreamInnerCopyOptions) => void;
}
export interface StreamReadableEndConstructor extends Pick<StreamEndConstructor, 'CopyState' | 'CopyResult'> {
    new (args: StreamEndpointOptions): StreamReadableEnd;
    readonly prototype: StreamReadableEnd;
}
export interface StreamWritableEndConstructor extends Pick<StreamEndConstructor, 'CopyState' | 'CopyResult'> {
    new (args: StreamEndpointOptions): StreamWritableEnd;
    readonly prototype: StreamWritableEnd;
}
export interface StreamEndpointClassContext extends TrapContext {
    readonly StreamEnd: StreamEndConstructor;
    readonly ManagedBuffer: Pick<ManagedBufferConstructor, 'MAX_LENGTH'>;
    readonly buffers: BufferManager;
    readonly lookup: ComponentStateLookupContext;
    readonly taskLookup: TaskLookupContext<FutureTask>;
    readonly tracking: ComponentHostOperationContext;
    readonly events: Pick<AsyncEventCodes, 'STREAM_READ' | 'STREAM_WRITE'>;
}
export interface InternalStreamOptions {
    readonly tableIdx: number;
    readonly elemMeta: StreamElementMetadata;
    readonly readWaitable: ComponentWaitable;
    readonly writeWaitable: ComponentWaitable;
    readonly hostInjectFn?: StreamHostInjectFn;
}
export interface InternalStream {
    readonly elemMeta: () => StreamElementMetadata;
    readonly readEnd: () => StreamReadableEnd;
    readonly writeEnd: () => StreamWritableEnd;
    readonly globalStreamMapRep: () => number | undefined;
    readonly setGlobalStreamMapRep: (rep: number) => void;
}
export interface InternalStreamConstructor {
    new (args: InternalStreamOptions): InternalStream;
    readonly prototype: InternalStream;
}
export interface InternalStreamClassContext {
    readonly StreamReadableEnd: StreamReadableEndConstructor;
    readonly StreamWritableEnd: StreamWritableEndConstructor;
}
export interface HostStreamOptions {
    readonly componentIdx: number;
    readonly streamEndWaitableIdx: number;
    readonly streamTableIdx: number;
    readonly payloadLiftFn: TaskLiftFn;
    readonly payloadLowerFn: TaskLowerFn;
}
export interface HostStream {
    readonly setRep: (rep: number) => void;
    readonly getStreamEndWaitableIdx: () => number;
    readonly createUserStream: () => ExternalStream;
}
export interface HostStreamConstructor {
    new (args: HostStreamOptions): HostStream;
    readonly prototype: HostStream;
}
export interface ExternalStreamOptions {
    readonly globalRep: number | undefined;
    readonly isReadable: boolean;
    readonly isWritable: boolean;
    readonly writeFn?: (value: unknown) => unknown;
    readonly readFn?: (options: StreamReadOptions) => unknown;
    readonly dropFn?: () => unknown;
}
export interface ExternalStream {
    readonly return: () => Promise<{ done: true }>;
    readonly next: () => Promise<unknown>;
    readonly read: (options?: number | StreamReadOptions) => Promise<unknown>;
    readonly write: (...values: unknown[]) => Promise<void>;
}
export interface ExternalStreamConstructor {
    new (args: ExternalStreamOptions): ExternalStream;
    readonly prototype: ExternalStream;
}
export interface ExternalStreamClassContext {
    readonly disposeSymbol: symbol;
    readonly asyncIteratorSymbol: symbol;
    readonly resourceRep: symbol;
}
export interface HostStreamClassContext extends TrapContext {
    readonly lookup: ComponentStateLookupContext;
    readonly ends: StreamEndLookupContext;
    readonly Stream: ExternalStreamConstructor;
}
export type StreamChunk = ArrayLike<unknown> & { slice(start: number): StreamChunk };
export interface StreamReadFn {
    (): IteratorResult<unknown> | PromiseLike<IteratorResult<unknown>>;
    drop?: (reason?: unknown) => unknown;
    sourceIsSync?: boolean;
}
export interface PendingValueQueue {
    readonly length: number;
    readonly done: boolean;
    readonly sourceIsSync: boolean;
    readonly push: (source: StreamChunk) => number;
    readonly appendReadValue: (value: unknown) => number;
    readonly readSource: () => Promise<number>;
    readonly prepend: (source: StreamChunk) => void;
    readonly drainInto: (target: unknown[], maxCount: number) => number;
}
export interface PendingValueQueueConstructor {
    new (readFn: StreamReadFn, elemMeta: StreamElementMetadata): PendingValueQueue;
    readonly prototype: PendingValueQueue;
}
export type StreamGlobalMap = RepTable<InternalStream | HostStream>;
export type StreamTables = Record<
    number,
    { readonly componentIdx: number; readonly table: RepTable<StreamPayloadEnd> }
>;
export interface StreamCreateContext {
    readonly InternalStream: InternalStreamConstructor;
    readonly streams: StreamGlobalMap;
    readonly tables: StreamTables;
}
export interface StreamCreateOptions {
    readonly tableIdx: number;
    readonly elemMeta: StreamElementMetadata;
    readonly hostInjectFn?: StreamHostInjectFn;
}
export interface StreamCreated {
    readonly writeEnd: StreamWritableEnd;
    readonly writeEndWaitableIdx: number | null;
    readonly writeEndHandle: number | undefined;
    readonly readEndWaitableIdx: number | null;
    readonly readEndHandle: number | undefined;
    readonly readEnd: StreamReadableEnd;
}
export interface StreamTableContext extends TrapContext {
    readonly StreamEnd: StreamEndConstructor;
    readonly tables: StreamTables;
    readonly lookup: ComponentStateLookupContext;
}
export interface StreamEndLookupContext extends TrapContext, StreamTableContext {}
export interface StreamEndLocation {
    readonly tableIdx: number;
    readonly streamEndHandle?: number;
    readonly streamEndWaitableIdx?: number;
}
export interface StreamEndInsertion {
    readonly tableIdx: number;
    readonly streamEnd: StreamPayloadEnd;
}
export interface StreamEndRemoval {
    readonly tableIdx: number;
    readonly streamWaitableIdx: number;
}
export interface StreamDeleteOptions {
    readonly tableIdx: number;
    readonly streamEndWaitableIdx: number;
}
export interface StreamNewOptions {
    readonly callerComponentIdx: number;
    readonly streamTableIdx: number;
    readonly elemMeta: StreamElementMetadata;
}
export interface StreamTask extends FutureTask {
    readonly componentIdx: () => number;
}
export interface StreamNewContext {
    readonly taskLookup: TaskLookupContext<StreamTask>;
    readonly lookup: ComponentStateLookupContext;
    readonly creation: StreamCreateContext;
}
export interface StreamNewFromLiftOptions extends HostStreamOptions {
    readonly payloadTypeSize32?: number;
}
export interface StreamNewFromLiftContext {
    readonly HostStream: HostStreamConstructor;
    readonly streams: StreamGlobalMap;
}
export interface StreamOperationOptions {
    readonly componentIdx: number;
    readonly streamTableIdx: number;
    readonly memoryIdx?: number;
    readonly getMemoryFn?: () => RuntimeMemory;
    readonly reallocIdx?: number;
    readonly getReallocFn?: () => StringRealloc;
    readonly stringEncoding?: string;
    readonly isAsync?: boolean;
    readonly elemMeta?: StreamElementMetadata;
    readonly syncFastOnly?: boolean;
    readonly deferSyncFinish?: boolean;
}
export interface StreamOperationContext extends TrapContext {
    readonly lookup: ComponentStateLookupContext;
    readonly ends: StreamEndLookupContext;
    readonly mayBlock: TaskMayBlockGlobal;
    readonly ManagedBuffer: Pick<ManagedBufferConstructor, 'MAX_LENGTH' | 'validateGuestBuffer'>;
    readonly events: Pick<AsyncEventCodes, 'STREAM_READ' | 'STREAM_WRITE'>;
}
export interface StreamReadContext extends StreamOperationContext {
    readonly StreamEnd: StreamReadableEndConstructor;
}
export interface StreamWriteContext extends StreamOperationContext {
    readonly StreamEnd: StreamWritableEndConstructor;
}
export interface StreamCancelContext extends TrapContext {
    readonly lookup: ComponentStateLookupContext;
    readonly ends: StreamEndLookupContext;
    readonly taskLookup: TaskLookupContext<FutureTask>;
    readonly events: Pick<AsyncEventCodes, 'STREAM_READ' | 'STREAM_WRITE'>;
}
export interface StreamCancelReadContext extends StreamCancelContext {
    readonly StreamEnd: StreamReadableEndConstructor;
}
export interface StreamCancelWriteContext extends StreamCancelContext {
    readonly StreamEnd: StreamWritableEndConstructor;
}
export interface StreamDropContext extends TrapContext {
    readonly lookup: ComponentStateLookupContext;
    readonly ends: StreamEndLookupContext;
    readonly taskLookup: TaskLookupContext<FutureTask>;
}
export interface StreamDropReadableContext extends StreamDropContext {
    readonly StreamEnd: StreamReadableEndConstructor;
}
export interface StreamDropWritableContext extends StreamDropContext {
    readonly StreamEnd: StreamWritableEndConstructor;
}
export interface StreamLowerableContext {
    readonly Stream: ExternalStreamConstructor;
    readonly asyncIteratorSymbol: symbol;
    readonly iteratorSymbol: symbol;
    readonly ReadableStream: abstract new (...args: never[]) => ReadableStream;
}
export interface StreamSourceContext {
    readonly lowerable: StreamLowerableContext;
    readonly disposeSymbol: symbol;
}
export interface StreamHostInjectContext {
    readonly PendingValueQueue: PendingValueQueueConstructor;
}
export interface StreamHostInjectOptions {
    readonly readFn: StreamReadFn;
    readonly hostWriteEnd: StreamWritableEnd;
    readonly readEnd: StreamReadableEnd;
}
export interface StreamModule {
    readonly initializeStreams: (RepTable: RepTableConstructor) => StreamGlobalMap;
    readonly initializeStreamTables: () => StreamTables;
    readonly initializeStreamEndClass: (
        events: Pick<AsyncEventCodes, 'STREAM_READ' | 'STREAM_WRITE'>,
    ) => StreamEndConstructor;
    readonly initializeStreamReadableEndClass: (context: StreamEndpointClassContext) => StreamReadableEndConstructor;
    readonly initializeStreamWritableEndClass: (context: StreamEndpointClassContext) => StreamWritableEndConstructor;
    readonly initializeInternalStreamClass: (context: InternalStreamClassContext) => InternalStreamConstructor;
    readonly initializeHostStreamClass: (context: HostStreamClassContext) => HostStreamConstructor;
    readonly initializeExternalStreamClass: (context: ExternalStreamClassContext) => ExternalStreamConstructor;
    readonly initializePendingValueQueueClass: (
        tracking: ComponentHostOperationContext,
    ) => PendingValueQueueConstructor;
    readonly createStream: (
        context: StreamCreateContext,
        state: ComponentAsyncState,
        options: StreamCreateOptions,
    ) => StreamCreated;
    readonly getStreamEnd: (context: StreamEndLookupContext, options: StreamEndLocation) => StreamPayloadEnd;
    readonly addStreamEndToTable: (
        context: StreamTableContext,
        options: StreamEndInsertion,
    ) => { handle: number; waitableIdx: number };
    readonly deleteStreamEnd: (context: StreamTableContext, options: StreamDeleteOptions) => StreamPayloadEnd;
    readonly removeStreamEndFromTable: (context: StreamTableContext, options: StreamEndRemoval) => StreamPayloadEnd;
    readonly streamNew: (context: StreamNewContext, options: StreamNewOptions) => bigint;
    readonly streamNewFromLift: (
        context: StreamNewFromLiftContext,
        options: StreamNewFromLiftOptions,
    ) => ExternalStream;
    readonly streamRead: (
        context: StreamReadContext,
        options: StreamOperationOptions,
        index: number,
        ptr: number,
        count: number,
    ) => number | Promise<number>;
    readonly streamWrite: (
        context: StreamWriteContext,
        options: StreamOperationOptions,
        index: number,
        ptr: number,
        count: number,
    ) => number | Promise<number>;
    readonly streamCancelRead: (
        context: StreamCancelReadContext,
        options: StreamOperationOptions,
        index: number,
    ) => number | Promise<number>;
    readonly streamCancelWrite: (
        context: StreamCancelWriteContext,
        options: StreamOperationOptions,
        index: number,
    ) => number | Promise<number>;
    readonly streamDropReadable: (
        context: StreamDropReadableContext,
        options: StreamOperationOptions,
        index: number,
    ) => void;
    readonly streamDropWritable: (
        context: StreamDropWritableContext,
        options: StreamOperationOptions,
        index: number,
    ) => void;
    readonly streamTransfer: (
        context: StreamEndLookupContext,
        index: number,
        srcTable: number,
        destTable: number,
    ) => number;
    readonly isStreamLowerableObject: (context: StreamLowerableContext, value: unknown) => boolean;
    readonly genReadFnFromLowerableStream: (context: StreamSourceContext, value: unknown) => StreamReadFn;
    readonly genStreamHostInjectFn: (
        context: StreamHostInjectContext,
        options: StreamHostInjectOptions,
    ) => StreamHostInjectFn;
}
