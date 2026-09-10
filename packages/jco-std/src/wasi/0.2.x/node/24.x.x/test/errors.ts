/** ERR_TEST_FAILURE adapted from nodejs/node lib/internal/errors.js,
 * v24.20.0, 71b8b174857e25106d39b61a9e6f30d927da8b01, MIT (see LICENSE).
 * Uses jco-std error codes and inspection instead of Node internal bindings. */
import { inspect } from "../assert/inspect.js";
import { isObject } from "../stream/shared.js";
import { codedError, invalidArgType, outOfRange, unsupportedNodeApi } from "../errors/core.js";
export {
  invalidArgType,
  invalidArgValue,
  validateFunction,
  validateObject,
  validateUint32,
  deprecatedNodeApi,
} from "../errors/core.js";

export type TestFailure = Error & {
  code: "ERR_TEST_FAILURE";
  failureType: string;
  cause?: unknown;
};
export function failure(cause: unknown, failureType = "testCodeFailure"): TestFailure {
  const value = (isObject(cause) ? cause.message : undefined) ?? cause;
  const message = typeof value === "string" ? value : inspect(value);
  const error: TestFailure = Object.assign(codedError(new Error(message), "ERR_TEST_FAILURE"), {
    failureType,
  });
  error.cause = cause;
  return error;
}
export function unsupported(api: string, reason: string): never {
  throw unsupportedNodeApi(`node:test ${api}`, reason);
}
export function boolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw invalidArgType(name, "boolean", value);
  }
}
export function integer(value: unknown, name: string, min = 0): asserts value is number {
  if (typeof value !== "number") {
    throw invalidArgType(name, "number", value);
  }
  if (!Number.isSafeInteger(value) || value < min) {
    throw outOfRange(name, `>= ${min} and <= ${Number.MAX_SAFE_INTEGER}`, value);
  }
}
export function milliseconds(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number") {
    throw invalidArgType(name, "number", value);
  }
  if (Number.isNaN(value) || value < 0 || value > 2147483647) {
    throw outOfRange(name, ">= 0 && <= 2147483647", value);
  }
}
