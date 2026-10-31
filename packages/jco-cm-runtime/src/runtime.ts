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
    readonly getCurrentTask?: (componentIdx: number) => ResourceBorrowTask | undefined;
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
    readonly withTask: <T>(args: { taskID: bigint; threadID: number; componentIdx: number; fn: () => T }) => T;
}

/** Type-only conformance map. No runtime registry or factory is required. */
export interface RuntimeModuleContracts {
    readonly 'intrinsics/resource': ResourceModule;
    readonly 'intrinsics/conversion': ConversionModule;
    readonly 'intrinsics/js-helper': JsHelperModule;
    readonly 'intrinsics/string': StringModule;
    readonly 'intrinsics/webidl': WebIdlModule;
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
