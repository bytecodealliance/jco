/** Experimental JavaScript Component Model runtime contract, independent of package version. */
export const CM_RUNTIME_API_VERSION = 1 as const;

export type RuntimeApiVersion = number;
export type ResourceHandle = number;
export type ResourceRep = number;
export type ResourceScope = number;

export interface RuntimeErrorConstructor {
    new (message?: string): Error;
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
/** Lazy access to component/task operations that are still generated inline. */
export interface SuspendingImportContext extends TrapContext {
    readonly registers: TaskRegisters;
    readonly checkMayLeave: (componentIdx: number) => void;
    readonly getCurrentThread: (
        componentIdx: number,
        threadID: number,
        taskID: bigint,
    ) => { task: { mayBlock(): boolean | undefined } } | undefined;
    readonly currentTaskMayBlock: () => number;
    readonly recordTrap: (componentIdx: number, error: unknown, convertsRangeErrors: boolean) => unknown;
    readonly throwIfInterrupted: (componentIdx: number) => void;
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
