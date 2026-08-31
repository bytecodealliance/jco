/**
 * Node-style coded errors for the `node:events` entry points Jco implements.
 *
 * These mirror Node's own argument validation rather than Jco's unsupported-API errors: the
 * functions here are supported, so a caller passing bad arguments must see what Node raises,
 * message included.
 */

interface CodedError extends Error {
  code: string;
}

function codedError(code: string, message: string): CodedError {
  const error = new Error(message) as CodedError;
  error.code = code;
  return error;
}

/** Describe a value the way Node's `ERR_INVALID_ARG_TYPE` message does. */
function describe(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === "object" || typeof value === "function") {
    const name = (value as { constructor?: { name?: string } }).constructor?.name;
    return name ? `an instance of ${name}` : "an object";
  }
  if (typeof value === "string") {
    return `type string ('${value}')`;
  }
  return `type ${typeof value} (${String(value)})`;
}

/**
 * Node's `ERR_INVALID_ARG_TYPE`, phrased for a primitive type.
 *
 * @param name - the parameter that was wrong, as Node names it
 * @param expected - the type Node accepts
 * @param actual - the value that was passed
 */
export function invalidArgType(name: string, expected: string, actual: unknown): CodedError {
  return codedError(
    "ERR_INVALID_ARG_TYPE",
    `The "${name}" argument must be of type ${expected}. Received ${describe(actual)}`,
  );
}

/**
 * Node's `ERR_INVALID_ARG_TYPE`, phrased for a class.
 *
 * @param name - the parameter that was wrong, as Node names it
 * @param expected - the classes Node accepts for it
 * @param actual - the value that was passed
 */
export function invalidArgInstance(name: string, expected: string[], actual: unknown): CodedError {
  return codedError(
    "ERR_INVALID_ARG_TYPE",
    `The "${name}" argument must be an instance of ${expected.join(" or ")}. Received ${describe(actual)}`,
  );
}

/**
 * Node's `ERR_OUT_OF_RANGE`.
 *
 * @param name - the parameter that was out of range
 * @param range - the range Node requires, phrased as Node phrases it
 * @param actual - the value that was passed
 */
export function outOfRange(name: string, range: string, actual: unknown): CodedError {
  return codedError(
    "ERR_OUT_OF_RANGE",
    `The value of "${name}" is out of range. It must be ${range}. Received ${String(actual)}`,
  );
}
