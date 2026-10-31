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
    /** Lazy lookup while tasks remain inline; no operation namespace is supplied. */
    readonly registers: TaskRegisters;
    readonly getTask?: (componentIdx: number, taskID: bigint) => ResourceBorrowTask | undefined;
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
    /** Lazy task capabilities, removed from generated inline bridges at N11. */
    readonly createTask: (args: ResourceDestructorCreateArgs) => { task: ResourceDestructorTask; threadID: number };
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
/** Shared component contexts plus lazy access to task operations still inline. */
export interface SuspendingImportContext extends TrapContext {
    readonly registers: TaskRegisters;
    readonly mayLeave: ComponentMayLeaveContext;
    readonly traps: ComponentRecordTrapContext;
    readonly states: ComponentStateLookupContext;
    readonly getCurrentThread: (
        componentIdx: number,
        threadID: number,
        taskID: bigint,
    ) => { task: { mayBlock(): boolean | undefined } } | undefined;
    readonly currentTaskMayBlock: () => number;
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
    align32: number;
    isNone?: boolean;
    payloadTypeName?: string;
    stringEncoding?: string;
    readonly liftFn?: (ctx: BufferElementContext) => [unknown, unknown];
    readonly lowerFn?: (ctx: BufferElementContext) => unknown;
    getReallocFn?: () => StringRealloc;
}
export interface ManagedBufferOptions {
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
    readonly threads: RepTable;
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
/** Task capabilities used by waitables while task implementation remains inline. */
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
    /** Lazy inline task lookup until N11; preserves current-task fallback semantics. */
    readonly getCurrentTask: (componentIdx: number) => { componentIdx: number; task?: WaitableTask } | undefined;
}
export interface WaitableSetNewContext {
    readonly lookup: ComponentStateLookupContext;
    readonly WaitableSet: WaitableSetConstructor;
}
export interface WaitableSetWaitContext extends TrapContext, WaitableSetNewContext, WaitableTaskLookup {
    /** Lazy inline host capability until N12. */
    readonly storeEventInComponentMemory: (args: WaitableStoreEventOptions) => number;
}
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
