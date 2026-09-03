/**
 * Portable Node.js error compatibility helpers.
 *
 * Adapted from nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, primarily
 * lib/internal/errors.js (MIT license). Local changes replace primordials,
 * V8 stack hooks, libuv bindings, and internal util.inspect with portable
 * ECMAScript operations and typed host-neutral system-error data.
 */

export type ErrorCode =
  | "ABORT_ERR"
  | "ERR_AMBIGUOUS_ARGUMENT"
  | "ERR_CONSTRUCT_CALL_REQUIRED"
  | "ERR_INVALID_ARG_TYPE"
  | "ERR_INVALID_ARG_VALUE"
  | "ERR_INVALID_RETURN_VALUE"
  | "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API"
  | "ERR_JCO_UNSUPPORTED_NODE_API"
  | "ERR_MISSING_ARGS"
  | "ERR_OUT_OF_RANGE"
  // Jco-specific codes. Every `ERR_JCO_*` code a shim raises is declared here so the set is
  // auditable in one place; per-builtin modules import these rather than restating literals.
  | "ERR_JCO_CHILD_PROCESS_ADAPTER_REQUIRED"
  | "ERR_JCO_CLUSTER_ADAPTER_REQUIRED"
  | "ERR_JCO_CONSOLE_ADAPTER_REQUIRED"
  | "ERR_JCO_DNS_ADAPTER_REQUIRED"
  | "ERR_JCO_FFI_ADAPTER_REQUIRED"
  | "ERR_JCO_FS_ADAPTER_REQUIRED"
  | "ERR_JCO_HTTP_ADAPTER_REQUIRED"
  | "ERR_JCO_INSPECTOR_ADAPTER_REQUIRED"
  | "ERR_JCO_OS_ADAPTER_REQUIRED"
  | "ERR_JCO_HTTP_IMPLEMENTATION"
  | "ERR_JCO_INSPECTOR_HOST"
  | "ERR_JCO_INSPECTOR_UNAVAILABLE"
  | "ERR_JCO_WASI_HTTP"
  | "ERR_JCO_WASI_HTTP_STATE"
  | "ERR_JCO_WASI_SOCKET";

export type CodedError<T extends Error = Error, C extends string = string> = T & { code: C };

export interface NodeSystemError extends Error {
  address?: string;
  code: string;
  dest?: string;
  errno?: number | string;
  info?: unknown;
  path?: string;
  port?: number;
  syscall?: string;
}

export interface SystemErrorData {
  address?: string;
  code: string;
  dest?: string;
  errno?: number | string;
  info?: unknown;
  message: string;
  path?: string;
  port?: number;
  syscall?: string;
}

export interface AbortErrorOptions {
  cause?: unknown;
}

const NativeError = globalThis.Error;
const NativeRangeError = globalThis.RangeError;
const NativeTypeError = globalThis.TypeError;

export class AbortError extends NativeError {
  readonly code = "ABORT_ERR";

  constructor(message = "The operation was aborted", options?: AbortErrorOptions) {
    if (options !== undefined && (typeof options !== "object" || options === null)) {
      throw invalidArgType("options", "Object", options);
    }
    super(message, options);
    this.name = "AbortError";
  }
}

function inspectObject(value: object): string {
  try {
    const constructor = Reflect.get(value, "constructor");
    if (typeof constructor === "function" && constructor.name) {
      return `an instance of ${constructor.name}`;
    }
  } catch {
    // Fall through to the intrinsic tag when a proxy rejects property access.
  }
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return "an object";
  }
}

function inspectValue(value: unknown): string {
  if (typeof value === "string") {
    return value.includes("'") ? JSON.stringify(value) : `'${value}'`;
  }
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (typeof value === "number" && Object.is(value, -0)) {
    return "-0";
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  if (typeof value === "function") {
    return `[Function: ${value.name || "anonymous"}]`;
  }
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) {
      return serialized.length > 128 ? `${serialized.slice(0, 128)}...` : serialized;
    }
  } catch {
    // Cyclic and hostile values fall back to their intrinsic object tag.
  }
  return inspectObject(value);
}

/** Describe a value using the stable presentation used in Node type errors. */
export function determineSpecificType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  switch (typeof value) {
    case "bigint":
      return `type bigint (${value}n)`;
    case "number":
      if (Object.is(value, -0)) {
        return "type number (-0)";
      }
      if (Number.isNaN(value)) {
        return "type number (NaN)";
      }
      return `type number (${String(value)})`;
    case "boolean":
      return `type boolean (${String(value)})`;
    case "symbol":
      return `type symbol (${String(value)})`;
    case "function":
      return `function ${value.name}`;
    case "object":
      return inspectObject(value);
    case "string": {
      const shortened = value.length > 28 ? `${value.slice(0, 25)}...` : value;
      return shortened.includes("'")
        ? `type string (${JSON.stringify(shortened)})`
        : `type string ('${shortened}')`;
    }
    default:
      return `type ${typeof value} (${String(value)})`;
  }
}

/** Format a list as `A and B` or `A, B, and C`, without depending on Intl. */
export function formatList(values: readonly string[], conjunction = "and"): string {
  switch (values.length) {
    case 0:
      return "";
    case 1:
      return values[0];
    case 2:
      return `${values[0]} ${conjunction} ${values[1]}`;
    case 3:
      return `${values[0]}, ${values[1]}, ${conjunction} ${values[2]}`;
    default:
      return `${values.slice(0, -1).join(", ")}, ${conjunction} ${values.at(-1)}`;
  }
}

/** Attach Node's stable public `code` contract to a standard error instance. */
export function codedError<T extends Error, C extends string>(error: T, code: C): CodedError<T, C> {
  Object.defineProperty(error, "code", {
    value: code,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(error, "name", {
    value: `${error.name} [${code}]`,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  // Force engines with lazy stacks to capture the coded first line before the
  // temporary name is removed. Node's native error classes do the same through
  // their internal stack preparation hook.
  void error.stack;
  Reflect.deleteProperty(error, "name");
  Object.defineProperty(error, "toString", {
    value(this: Error): string {
      return `${this.name} [${code}]: ${this.message}`;
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return error as CodedError<T, C>;
}

const PRIMITIVE_TYPES = new Set([
  "string",
  "function",
  "number",
  "object",
  "Function",
  "Object",
  "boolean",
  "bigint",
  "symbol",
]);
const CLASS_NAME = /^[A-Z][a-zA-Z0-9]*$/;

function expectedTypeDescription(expected: string | readonly string[]): string {
  const values = typeof expected === "string" ? [expected] : [...expected];
  const types: string[] = [];
  const instances: string[] = [];
  const other: string[] = [];
  for (const value of values) {
    if (PRIMITIVE_TYPES.has(value)) {
      types.push(value.toLowerCase());
    } else if (CLASS_NAME.test(value)) {
      instances.push(value);
    } else {
      other.push(value);
    }
  }
  if (instances.length > 0 && types.includes("object")) {
    types.splice(types.indexOf("object"), 1);
    instances.push("Object");
  }
  const sections: string[] = [];
  if (types.length > 0) {
    sections.push(`${types.length > 1 ? "one of type" : "of type"} ${formatList(types, "or")}`);
  }
  if (instances.length > 0) {
    sections.push(`an instance of ${formatList(instances, "or")}`);
  }
  if (other.length > 0) {
    sections.push(other.length > 1 ? `one of ${formatList(other, "or")}` : other[0]);
  }
  return formatList(sections, "or");
}

export function invalidArgType(
  name: string,
  expected: string | readonly string[],
  actual: unknown,
): CodedError<TypeError, "ERR_INVALID_ARG_TYPE"> {
  const subject = name.endsWith(" argument")
    ? `${name} `
    : `"${name}" ${name.includes(".") ? "property" : "argument"} `;
  return codedError(
    new NativeTypeError(
      `The ${subject}must be ${expectedTypeDescription(expected)}. Received ${determineSpecificType(actual)}`,
    ),
    "ERR_INVALID_ARG_TYPE",
  );
}

export function invalidArgValue(
  name: string,
  value: unknown,
  reason = "is invalid",
): CodedError<TypeError, "ERR_INVALID_ARG_VALUE"> {
  const subject = name.includes(".") ? "property" : "argument";
  return codedError(
    new NativeTypeError(`The ${subject} '${name}' ${reason}. Received ${inspectValue(value)}`),
    "ERR_INVALID_ARG_VALUE",
  );
}

export function missingArgs(
  ...names: Array<string | readonly string[]>
): CodedError<TypeError, "ERR_MISSING_ARGS"> {
  const formatted = names.map((name) =>
    typeof name === "string" ? `"${name}"` : name.map((item) => `"${item}"`).join(" or "),
  );
  const plural = names.length > 1 ? "arguments" : "argument";
  return codedError(
    new NativeTypeError(`The ${formatList(formatted)} ${plural} must be specified`),
    "ERR_MISSING_ARGS",
  );
}

export function invalidReturnValue(
  expected: string,
  name: string,
  value: unknown,
): CodedError<TypeError, "ERR_INVALID_RETURN_VALUE"> {
  return codedError(
    new NativeTypeError(
      `Expected ${expected} to be returned from the "${name}" function but got ${determineSpecificType(value)}.`,
    ),
    "ERR_INVALID_RETURN_VALUE",
  );
}

export function ambiguousArgument(
  name: string,
  reason: string,
): CodedError<TypeError, "ERR_AMBIGUOUS_ARGUMENT"> {
  return codedError(
    new NativeTypeError(`The "${name}" argument is ambiguous. ${reason}`),
    "ERR_AMBIGUOUS_ARGUMENT",
  );
}

export function constructCallRequired(
  name: string,
): CodedError<TypeError, "ERR_CONSTRUCT_CALL_REQUIRED"> {
  return codedError(
    new NativeTypeError(`Cannot call constructor ${name} without \`new\``),
    "ERR_CONSTRUCT_CALL_REQUIRED",
  );
}

export function deprecatedNodeApi(
  name: string,
  replacement?: string,
): CodedError<Error, "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API"> {
  const suffix = replacement ? ` Use ${replacement} instead.` : "";
  return codedError(
    new NativeError(`The deprecated Node.js API ${name} is not supported by jco-std.${suffix}`),
    "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
  );
}

export function unsupportedNodeApi(
  api: string,
  reason: string,
): CodedError<Error, "ERR_JCO_UNSUPPORTED_NODE_API"> {
  return codedError(
    new NativeError(`${api} is not supported in a WebAssembly component: ${reason}`),
    "ERR_JCO_UNSUPPORTED_NODE_API",
  );
}

/** Error code carried by every unsupported-API failure Jco raises for Node builtins. */
export const UNSUPPORTED_CODE = "ERR_JCO_UNSUPPORTED_NODE_API" as const;

/** Error code for APIs Node itself has deprecated, which Jco declines to implement. */
export const DEPRECATED_CODE = "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" as const;

export function outOfRange(
  name: string,
  range: string,
  value: unknown,
): CodedError<RangeError, "ERR_OUT_OF_RANGE"> {
  return codedError(
    new NativeRangeError(
      `The value of "${name}" is out of range. It must be ${range}. Received ${inspectValue(value)}`,
    ),
    "ERR_OUT_OF_RANGE",
  );
}

export function genericNodeError(
  message: string,
  properties: Readonly<Record<string, unknown>>,
): Error & Record<string, unknown> {
  return Object.assign(new NativeError(message), properties);
}

export function systemError(data: SystemErrorData): NodeSystemError {
  const error = new NativeError(data.message) as NodeSystemError;
  for (const key of [
    "address",
    "code",
    "dest",
    "errno",
    "info",
    "path",
    "port",
    "syscall",
  ] as const) {
    if (data[key] !== undefined) {
      Object.defineProperty(error, key, {
        value: data[key],
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return error;
}

export function validateFunction(
  value: unknown,
  name: string,
): asserts value is (...args: unknown[]) => unknown {
  if (typeof value !== "function") {
    throw invalidArgType(name, "Function", value);
  }
}

export function validateObject(
  value: unknown,
  name: string,
): asserts value is Record<PropertyKey, unknown> {
  if (value === null || typeof value !== "object") {
    throw invalidArgType(name, "Object", value);
  }
}

export function validateOneOf<T>(value: T, name: string, allowed: readonly T[]): void {
  if (!allowed.includes(value)) {
    throw invalidArgValue(name, value, `must be one of: ${allowed.map(String).join(", ")}`);
  }
}

export function validateUint32(
  value: unknown,
  name: string,
  positive = false,
): asserts value is number {
  const minimum = positive ? 1 : 0;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > 0xffff_ffff) {
    throw outOfRange(name, `>= ${minimum} and <= 4294967295`, value);
  }
}
