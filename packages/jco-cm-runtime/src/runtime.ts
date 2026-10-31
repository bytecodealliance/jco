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
    readonly tableGet: (
        context: ResourceTableGetContext,
        table: ArrayLike<number>,
        handle: ResourceHandle,
    ) => ResourceTableEntry;
}

/** Type-only conformance map. No runtime registry or factory is required. */
export interface RuntimeModuleContracts {
    readonly 'intrinsics/resource': ResourceModule;
    readonly 'intrinsics/conversion': ConversionModule;
    readonly 'intrinsics/js-helper': JsHelperModule;
    readonly 'intrinsics/string': StringModule;
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
