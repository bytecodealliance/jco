import { unsupported } from "./errors.js";
import type { HostValue, TypeName } from "./types.js";

/**
 * Conversion between JavaScript values and the tagged values the host interface carries.
 *
 * Every value is tagged by the type its signature declared, so the host knows how to hand it to
 * the native call without guessing from the JavaScript type -- `1` is a valid `int8`, `uint64`, or
 * `double`, and only the signature says which.
 */

/** Type names that map to a wire tag carrying a JS `number`. */
const NUMBER_TAGS: Partial<Record<string, HostValue["tag"]>> = {
  int8: "int8",
  uint8: "uint8",
  int16: "int16",
  uint16: "uint16",
  int32: "int32",
  uint32: "uint32",
  char: "int8",
  float: "float32",
  float32: "float32",
  double: "float64",
  float64: "float64",
};

/** Type names that map to a wire tag carrying a JS `bigint`. */
const BIGINT_TAGS: Partial<Record<string, HostValue["tag"]>> = {
  int64: "int64",
  uint64: "uint64",
  pointer: "pointer",
};

/**
 * Type names Node accepts that this boundary deliberately cannot carry.
 *
 * `buffer`/`arraybuffer` would have to be copied, so a native function writing through the pointer
 * would write into a copy the guest never sees -- silently, which is worse than refusing. Callers
 * pass a `pointer` and use `readBytes`/`writeBytes`, which is explicit about the copy. `function`
 * needs a host-to-guest call, which the interface has no way to carry.
 *
 * TODO(ffi): the buffer pair is the easy one to lift -- give `call` copy-out results so mutated
 * buffers come back with the return value, which makes out-parameters correct rather than silently
 * lost. `function` is the callback problem; see `core.ts`.
 */
const REFUSED: Record<string, string> = {
  buffer:
    "a buffer argument would be copied across the component boundary, so native code writing " +
    "through it would write into a copy the guest cannot see. Declare a `pointer` and use " +
    "ffi.toBuffer()/ffi.exportBuffer() instead, which copy explicitly",
  arraybuffer:
    "an arraybuffer argument would be copied across the component boundary, so native code " +
    "writing through it would write into a copy the guest cannot see. Declare a `pointer` and " +
    "use ffi.toArrayBuffer()/ffi.exportArrayBuffer() instead",
  function:
    "a function argument needs the host to call back into the guest, which the component " +
    "boundary cannot carry",
};

/**
 * Check that a signature only names types this boundary can carry.
 *
 * Done guest-side and before the call so the refusal names the offending type rather than
 * surfacing as a marshalling failure later.
 *
 * @param api - the entry point being used, as a user would write it
 * @param names - the type names to check
 */
export function assertCarriable(api: string, names: readonly string[]): void {
  for (const name of names) {
    const reason = REFUSED[name];
    if (reason) {
      throw unsupported(`${api} with a \`${name}\` type`, reason);
    }
  }
}

/**
 * Convert one JavaScript argument to its wire form.
 *
 * @param api - the entry point being used, for the error message
 * @param kind - the declared type name
 * @param value - the argument as the caller passed it
 */
export function toHost(api: string, kind: string, value: unknown): HostValue {
  assertCarriable(api, [kind]);
  if (kind === "void") {
    return { tag: "nothing" };
  }
  if (kind === "bool") {
    return { tag: "boolean", val: Boolean(value) };
  }
  if (kind === "string") {
    return { tag: "text", val: String(value) };
  }
  const bigTag = BIGINT_TAGS[kind];
  if (bigTag) {
    // Node accepts a number where a pointer or 64-bit integer is expected, and widens it.
    return {
      tag: bigTag,
      val: typeof value === "bigint" ? value : BigInt(value as number),
    } as HostValue;
  }
  const numberTag = NUMBER_TAGS[kind];
  if (numberTag) {
    return {
      tag: numberTag,
      val: typeof value === "bigint" ? Number(value) : Number(value),
    } as HostValue;
  }
  throw unsupported(api, `\`${kind}\` is not a type name node:ffi recognises`);
}

/**
 * Convert a value the host returned back to what Node would have produced.
 *
 * The tag decides, not the declared type: the host already resolved which it sent, and Node's
 * 64-bit types and pointers surface as `bigint` while the rest are `number`.
 */
export function fromHost(value: HostValue): unknown {
  switch (value.tag) {
    case "nothing":
      return undefined;
    case "boolean":
    case "text":
      return value.val;
    default:
      return value.val;
  }
}

/** Convert a list of arguments against a list of declared types. */
export function argumentsToHost(
  api: string,
  kinds: readonly TypeName[],
  args: readonly unknown[],
): HostValue[] {
  if (args.length !== kinds.length) {
    const error = new Error(
      `Invalid argument count: expected ${kinds.length}, got ${args.length}`,
    ) as Error & {
      code: string;
    };
    error.code = "ERR_INVALID_ARG_VALUE";
    throw error;
  }
  return kinds.map((kind, index) => toHost(api, kind, args[index]));
}
