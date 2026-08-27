// Adapted from Node.js lib/internal/errors.js and lib/internal/validators.js at
// v24.19.0, commit cdc1b38d40cb567b7ad0b39c86addf830a0af0ae:
// https://github.com/nodejs/node/tree/cdc1b38d40cb567b7ad0b39c86addf830a0af0ae/lib/internal
// Node.js is MIT licensed (https://github.com/nodejs/node/blob/v24.19.0/LICENSE).
// Only portable error shapes needed by node:assert are retained and typed.

export type ErrorCode =
  | "ERR_AMBIGUOUS_ARGUMENT"
  | "ERR_CONSTRUCT_CALL_REQUIRED"
  | "ERR_INVALID_ARG_TYPE"
  | "ERR_INVALID_ARG_VALUE"
  | "ERR_INVALID_RETURN_VALUE"
  | "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API"
  | "ERR_MISSING_ARGS"
  | "ERR_OUT_OF_RANGE";

function describe(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return `'${value}'`;
  }
  if (typeof value === "function") {
    return `[Function: ${value.name || "anonymous"}]`;
  }
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export function codedError<T extends Error>(error: T, code: ErrorCode): T {
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
  return error;
}

export function invalidArgType(
  name: string,
  expected: string | string[],
  actual: unknown,
): TypeError {
  const list = Array.isArray(expected) ? expected.join(" or ") : expected;
  return codedError(
    new TypeError(`The "${name}" argument must be of type ${list}. Received ${describe(actual)}`),
    "ERR_INVALID_ARG_TYPE",
  );
}

export function invalidArgValue(name: string, value: unknown, reason: string): TypeError {
  return codedError(
    new TypeError(`The argument '${name}' ${reason}. Received ${describe(value)}`),
    "ERR_INVALID_ARG_VALUE",
  );
}

export function missingArgs(...names: string[]): TypeError {
  const message =
    names.length === 1
      ? `The "${names[0]}" argument must be specified`
      : `The ${names.map((name) => `"${name}"`).join(" and ")} arguments must be specified`;
  return codedError(new TypeError(message), "ERR_MISSING_ARGS");
}

export function invalidReturnValue(expected: string, name: string, value: unknown): TypeError {
  return codedError(
    new TypeError(
      `Expected ${expected} to be returned from the "${name}" function but got ${describe(value)}.`,
    ),
    "ERR_INVALID_RETURN_VALUE",
  );
}

export function ambiguousArgument(name: string, reason: string): TypeError {
  return codedError(
    new TypeError(`The "${name}" argument is ambiguous. ${reason}`),
    "ERR_AMBIGUOUS_ARGUMENT",
  );
}

export function constructCallRequired(name: string): TypeError {
  return codedError(
    new TypeError(`Cannot call constructor ${name} without \`new\``),
    "ERR_CONSTRUCT_CALL_REQUIRED",
  );
}

export function deprecatedNodeApi(name: string, replacement?: string): Error {
  const suffix = replacement ? ` Use ${replacement} instead.` : "";
  return codedError(
    new Error(`The deprecated Node.js API ${name} is not supported by jco-std.${suffix}`),
    "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
  );
}

export function outOfRange(name: string, range: string, value: unknown): RangeError {
  return codedError(
    new RangeError(
      `The value of "${name}" is out of range. It must be ${range}. Received ${describe(value)}`,
    ),
    "ERR_OUT_OF_RANGE",
  );
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
