/** Types for `node:ffi`: the Node-facing surface and the host contract behind it. */

/**
 * Node's `ffi.types`: the type names usable in a signature.
 *
 * Specification data -- identical on every platform and needing no host -- so it is a plain value.
 * A caller builds a signature out of these before anything that could fail.
 */
export const types = Object.freeze({
  VOID: "void",
  POINTER: "pointer",
  BUFFER: "buffer",
  ARRAY_BUFFER: "arraybuffer",
  FUNCTION: "function",
  BOOL: "bool",
  CHAR: "char",
  STRING: "string",
  FLOAT: "float",
  DOUBLE: "double",
  INT_8: "int8",
  UINT_8: "uint8",
  INT_16: "int16",
  UINT_16: "uint16",
  INT_32: "int32",
  UINT_32: "uint32",
  INT_64: "int64",
  UINT_64: "uint64",
  FLOAT_32: "float32",
  FLOAT_64: "float64",
} as const);

/** A type name accepted in a signature, e.g. `"int32"`. */
export type TypeName = (typeof types)[keyof typeof types];

/** One function's signature, as `dlopen` and `getFunction` accept it. */
export interface Signature {
  /** Argument type names. Node defaults this to `[]`. */
  arguments?: readonly TypeName[];
  /** Return type name. Node defaults this to `"void"`. */
  return?: TypeName;
}

/** A set of named signatures, keyed by symbol name. */
export type Definitions = Readonly<Record<string, Signature>>;

/** A resolved native function. */
export type NativeFunction = (...args: never[]) => unknown;

/** What `dlopen` resolves to. */
export interface DlopenResult {
  lib: DynamicLibraryLike;
  functions: Record<string, NativeFunction>;
}

/** The `DynamicLibrary` surface, named separately so `dlopen`'s result can refer to it. */
export interface DynamicLibraryLike {
  readonly path: string;
  readonly symbols: Record<string, bigint>;
  readonly functions: Record<string, NativeFunction>;
  close(): void;
  getFunction(name: string, signature?: Signature): NativeFunction;
  getFunctions(definitions?: Definitions): Record<string, NativeFunction>;
  getSymbol(name: string): bigint;
  getSymbols(): Record<string, bigint>;
  registerCallback(signature: Signature, callback: NativeFunction): bigint;
  unregisterCallback(pointer: bigint): void;
  refCallback(pointer: bigint): void;
  unrefCallback(pointer: bigint): void;
  [Symbol.dispose](): void;
}

/**
 * A value on the wire, mirroring the WIT `variant value`.
 *
 * Transpiled WIT variants arrive as `{ tag, val }`, and payload-free cases carry no `val`.
 */
export type HostValue =
  | { tag: "nothing" }
  | { tag: "boolean"; val: boolean }
  | {
      tag: "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32" | "float32" | "float64";
      val: number;
    }
  | { tag: "int64" | "uint64" | "pointer"; val: bigint }
  | { tag: "text"; val: string };

/** The WIT `record signature`, whose field is `returns` rather than Node's reserved `return`. */
export interface HostSignature {
  arguments: string[];
  returns: string;
}

/** The host capability behind `node:ffi`, mirroring `jco:node/ffi@0.1.0`. */
export interface FfiHost {
  suffix(): string;
  open(path: string | undefined): number;
  close(handle: number): void;
  symbol(handle: number, name: string): bigint;
  define(handle: number, name: string, sig: HostSignature): void;
  call(handle: number, name: string, args: HostValue[]): HostValue;
  read(pointer: bigint, offset: bigint, kind: string): HostValue;
  write(pointer: bigint, offset: bigint, kind: string, data: HostValue): void;
  readText(pointer: bigint): string | undefined;
  readBytes(pointer: bigint, length: bigint): Uint8Array;
  writeBytes(pointer: bigint, length: bigint, data: Uint8Array): void;
  writeText(pointer: bigint, length: bigint, data: string, encoding: string): void;
  currentEventLoop(): bigint;
}

/**
 * The `node:ffi` module surface, as `createFfi` builds it.
 *
 * Declared explicitly rather than inferred: the `DynamicLibrary` class is created inside the
 * factory, and TypeScript cannot emit a declaration for an anonymous class with private fields.
 */
export interface FfiModule {
  DynamicLibrary: new (path?: string | null) => DynamicLibraryLike;
  dlopen(path: string, definitions?: Definitions): DlopenResult;
  dlclose(handle: DynamicLibraryLike): void;
  dlsym(handle: DynamicLibraryLike, symbol: string): bigint;
  toString(pointer: bigint): string | null;
  toBuffer(pointer: bigint, length: number, copy?: boolean): Uint8Array;
  toArrayBuffer(pointer: bigint, length: number, copy?: boolean): ArrayBuffer;
  getRawPointer(source: ArrayBuffer | ArrayBufferView): bigint;
  getCurrentEventLoop(): bigint;
  exportString(value: string, pointer: bigint, length: number, encoding?: string): void;
  exportBuffer(buffer: Uint8Array, pointer: bigint, length: number): void;
  exportArrayBuffer(arrayBuffer: ArrayBuffer, pointer: bigint, length: number): void;
  exportArrayBufferView(view: ArrayBufferView, pointer: bigint, length: number): void;
  getInt8(pointer: bigint, offset?: number): number;
  getUint8(pointer: bigint, offset?: number): number;
  getInt16(pointer: bigint, offset?: number): number;
  getUint16(pointer: bigint, offset?: number): number;
  getInt32(pointer: bigint, offset?: number): number;
  getUint32(pointer: bigint, offset?: number): number;
  getInt64(pointer: bigint, offset?: number): bigint;
  getUint64(pointer: bigint, offset?: number): bigint;
  getFloat32(pointer: bigint, offset?: number): number;
  getFloat64(pointer: bigint, offset?: number): number;
  setInt8(pointer: bigint, offset: number, value: number): void;
  setUint8(pointer: bigint, offset: number, value: number): void;
  setInt16(pointer: bigint, offset: number, value: number): void;
  setUint16(pointer: bigint, offset: number, value: number): void;
  setInt32(pointer: bigint, offset: number, value: number): void;
  setUint32(pointer: bigint, offset: number, value: number): void;
  setInt64(pointer: bigint, offset: number, value: bigint): void;
  setUint64(pointer: bigint, offset: number, value: bigint): void;
  setFloat32(pointer: bigint, offset: number, value: number): void;
  setFloat64(pointer: bigint, offset: number, value: number): void;
}
