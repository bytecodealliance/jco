import { createRequire } from "node:module";

import type { FfiHost, HostSignature, HostValue } from "./ffi/types.js";

/**
 * Opt-in host adapter for `jco:node/ffi`, backed by the runtime's real `node:ffi`.
 *
 * Requires **Node 26.1.0 or newer, started with `--experimental-ffi`**. The module is Stability 1
 * and does not resolve without the flag, so it is loaded lazily and its absence is reported as a
 * host error the guest can explain rather than as a crash while importing.
 *
 * Granting this hands a component the host's dynamic loader and its address space. Map it only for
 * code already trusted to run native code in this process.
 */

interface NodeDynamicLibrary {
  close(): void;
  getSymbol(name: string): bigint;
  getFunction(
    name: string,
    signature: { arguments: string[]; return: string },
  ): (...args: unknown[]) => unknown;
}

interface NodeFfi {
  DynamicLibrary: new (path: string | null) => NodeDynamicLibrary;
  toString(pointer: bigint): string | null;
  toBuffer(pointer: bigint, length: number, copy?: boolean): Uint8Array;
  exportString(value: string, pointer: bigint, length: number, encoding?: string): void;
  exportBuffer(buffer: Uint8Array, pointer: bigint, length: number): void;
  getCurrentEventLoop(): bigint;
  suffix: string;
  [accessor: string]: unknown;
}

const require = createRequire(import.meta.url);

let cached: NodeFfi | undefined;

/** Load the host's `node:ffi`, reporting a runtime that lacks it as a host error. */
function ffi(): NodeFfi {
  if (!cached) {
    try {
      cached = require("node:ffi") as NodeFfi;
    } catch (cause) {
      throw { tag: "unavailable", val: cause instanceof Error ? cause.message : String(cause) };
    }
  }
  return cached;
}

/** Run a call against the host's `node:ffi`, re-raising failures in the WIT error shape. */
function attempt<T>(call: (module: NodeFfi) => T): T {
  const module = ffi();
  try {
    return call(module);
  } catch (cause) {
    const error = cause as { code?: string; message?: string };
    throw {
      tag: "failed",
      val: {
        code: typeof error?.code === "string" ? error.code : "ERR_FFI_CALL_FAILED",
        message: typeof error?.message === "string" ? error.message : String(cause),
      },
    };
  }
}

/** A function resolved on an open library, kept with the return type it was declared with. */
interface Resolved {
  call: (...args: unknown[]) => unknown;
  returns: string;
}

interface OpenLibrary {
  library: NodeDynamicLibrary;
  functions: Map<string, Resolved>;
}

const libraries = new Map<number, OpenLibrary>();
let nextHandle = 1;

/** Look up an open library, reporting a stale handle rather than dereferencing it. */
function lookup(handle: number): OpenLibrary {
  const entry = libraries.get(handle);
  if (!entry) {
    throw { tag: "no-such-library", val: handle };
  }
  return entry;
}

/** Tag a JavaScript value for the wire, using the type its signature declared. */
function encode(kind: string, value: unknown): HostValue {
  switch (kind) {
    case "void":
      return { tag: "nothing" };
    case "bool":
      return { tag: "boolean", val: Boolean(value) };
    case "string":
      return { tag: "text", val: String(value) };
    case "pointer":
      return { tag: "pointer", val: BigInt(value as bigint) };
    case "int64":
      return { tag: "int64", val: BigInt(value as bigint) };
    case "uint64":
      return { tag: "uint64", val: BigInt(value as bigint) };
    case "int8":
    case "char":
      return { tag: "int8", val: Number(value) };
    case "uint8":
      return { tag: "uint8", val: Number(value) };
    case "int16":
      return { tag: "int16", val: Number(value) };
    case "uint16":
      return { tag: "uint16", val: Number(value) };
    case "int32":
      return { tag: "int32", val: Number(value) };
    case "uint32":
      return { tag: "uint32", val: Number(value) };
    case "float":
    case "float32":
      return { tag: "float32", val: Number(value) };
    case "double":
    case "float64":
      return { tag: "float64", val: Number(value) };
    default:
      throw { tag: "unsupported-type", val: kind + " cannot cross the component boundary" };
  }
}

/** Untag a wire value back into what Node's FFI expects. */
function decode(value: HostValue): unknown {
  return value.tag === "nothing" ? undefined : (value as { val: unknown }).val;
}

/** Node names its accessors `getInt32`/`setInt32`; the wire names the type `int32`. */
const ACCESSOR: Record<string, string> = {
  int8: "Int8",
  uint8: "Uint8",
  int16: "Int16",
  uint16: "Uint16",
  int32: "Int32",
  uint32: "Uint32",
  int64: "Int64",
  uint64: "Uint64",
  float: "Float32",
  float32: "Float32",
  double: "Float64",
  float64: "Float64",
};

function accessor(kind: string): string {
  const name = ACCESSOR[kind];
  if (!name) {
    throw { tag: "unsupported-type", val: kind + " is not a primitive node:ffi can read or write" };
  }
  return name;
}

let configuredSuffix: string | undefined;

/**
 * Override the shared-library suffix reported to guests.
 *
 * Defaults to the runtime's own `ffi.suffix`. An application that cross-targets -- serving a guest
 * that will name `.dylib` or `.dll` files -- sets it before instantiating the component.
 *
 * @param value - the suffix to report, without a leading dot
 */
export function setSuffix(value: string): void {
  configuredSuffix = value;
}

export const suffix: FfiHost["suffix"] = () =>
  configuredSuffix ?? attempt((module) => module.suffix);

export const open: FfiHost["open"] = (path) =>
  attempt((module) => {
    const library = new module.DynamicLibrary(path ?? null);
    const handle = nextHandle++;
    libraries.set(handle, { library, functions: new Map() });
    return handle;
  });

export const close: FfiHost["close"] = (handle) => {
  const entry = lookup(handle);
  libraries.delete(handle);
  attempt(() => entry.library.close());
};

export const symbol: FfiHost["symbol"] = (handle, name) => {
  const entry = lookup(handle);
  return attempt(() => entry.library.getSymbol(name));
};

export const define: FfiHost["define"] = (handle, name, sig: HostSignature) => {
  const entry = lookup(handle);
  const resolved = attempt(() =>
    entry.library.getFunction(name, { arguments: [...sig.arguments], return: sig.returns }),
  );
  // The return type is kept here so `call` can tag the result with what was declared: the
  // JavaScript value alone cannot distinguish an int32 from a double.
  entry.functions.set(name, { call: resolved, returns: sig.returns });
};

export const call: FfiHost["call"] = (handle, name, args) => {
  const entry = lookup(handle);
  const resolved = entry.functions.get(name);
  if (!resolved) {
    throw { tag: "no-such-symbol", val: name };
  }
  const result = attempt(() => resolved.call(...args.map(decode)));
  return encode(resolved.returns, result);
};

export const read: FfiHost["read"] = (pointer, offset, kind) =>
  attempt((module) => {
    const get = module["get" + accessor(kind)] as (p: bigint, o: number) => unknown;
    return encode(kind, get(pointer, Number(offset)));
  });

export const write: FfiHost["write"] = (pointer, offset, kind, data) =>
  attempt((module) => {
    const set = module["set" + accessor(kind)] as (p: bigint, o: number, v: unknown) => void;
    set(pointer, Number(offset), decode(data));
  });

export const readText: FfiHost["readText"] = (pointer) =>
  attempt((module) => module.toString(pointer) ?? undefined);

export const readBytes: FfiHost["readBytes"] = (pointer, length) =>
  // Always a copy: a component cannot hold a live view into host memory.
  attempt((module) => new Uint8Array(module.toBuffer(pointer, Number(length), true)));

export const writeBytes: FfiHost["writeBytes"] = (pointer, length, data) =>
  attempt((module) => module.exportBuffer(data, pointer, Number(length)));

export const writeText: FfiHost["writeText"] = (pointer, length, data, encoding) =>
  attempt((module) => module.exportString(data, pointer, Number(length), encoding));

export const currentEventLoop: FfiHost["currentEventLoop"] = () =>
  attempt((module) => module.getCurrentEventLoop());

export default {
  call,
  close,
  currentEventLoop,
  define,
  open,
  read,
  readBytes,
  readText,
  suffix,
  symbol,
  write,
  writeBytes,
  writeText,
};
