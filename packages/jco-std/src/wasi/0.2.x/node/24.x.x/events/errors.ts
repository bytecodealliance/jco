/**
 * Node-style coded errors for the `node:events` entry points Jco implements.
 *
 * These mirror Node's own argument validation rather than Jco's unsupported-API errors: the
 * functions here are supported, so a caller passing bad arguments must see what Node raises,
 * message included. The factory, message templates, and `Received ...` clause are the shared
 * ones in `../errors/core.js`.
 */

import {
  type CodedError as SharedCodedError,
  codedError,
  determineSpecificType,
  formatList,
  invalidArgType as sharedInvalidArgType,
  outOfRange as sharedOutOfRange,
} from "../errors/core.js";

type CodedError = SharedCodedError<Error, string>;

/**
 * Node's `ERR_INVALID_ARG_TYPE`, phrased for a primitive type.
 *
 * @param name - the parameter that was wrong, as Node names it
 * @param expected - the type Node accepts
 * @param actual - the value that was passed
 */
export function invalidArgType(name: string, expected: string, actual: unknown): CodedError {
  return sharedInvalidArgType(name, expected, actual);
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
    new TypeError(
      `The "${name}" argument must be an instance of ${formatList(expected, "or")}. Received ${determineSpecificType(actual)}`,
    ),
    "ERR_INVALID_ARG_TYPE",
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
  return sharedOutOfRange(name, range, actual);
}
