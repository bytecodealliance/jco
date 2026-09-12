/*!
 * Portions of this directory are adapted from Node.js and DefinitelyTyped.
 * Copyright Node.js contributors. All rights reserved.
 * Copyright (c) Microsoft Corporation. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
/** Validation and WIT error reconstruction for the process facade.
 * previous() follows Node v24.20.0 internal/process/per_thread.js (MIT),
 * commit 71b8b174857e25106d39b61a9e6f30d927da8b01.
 */
import { validateNumber } from "../internal/validation.js";
import { decodeErrno } from "../internal/host-error.js";
import {
  deprecatedNodeApi,
  unsupportedNodeApi,
  invalidArgType,
  outOfRange,
} from "../errors/core.js";
import type { CpuUsage, ExitCode, Id, ProcessError, ProcessPath, Warning } from "./types.js";
export function unsupported(api: string): never {
  throw unsupportedNodeApi(
    `process.${api}`,
    "requires Node runtime hooks or native objects that cannot cross the component boundary",
  );
}

export function deprecated(api: string, replacement?: string): never {
  throw deprecatedNodeApi(`process.${api}`, replacement);
}

export function integer(
  value: unknown,
  name: string,
  min: number,
  max: number,
): asserts value is number {
  validateNumber(value, name);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw outOfRange(name, `>= ${min} && <= ${max}`, value);
  }
}

export function id(value: unknown, name: string): Id {
  if (typeof value === "string") {
    return { tag: "name", val: value };
  }
  if (typeof value !== "number") {
    throw invalidArgType(name, ["number", "string"], value);
  }
  integer(value, name, 0, 4294967295);
  return { tag: "number", val: value };
}

export function exitCode(value: unknown): ExitCode | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return { tag: "text", val: value };
  }
  if (typeof value !== "number") {
    throw invalidArgType("code", ["number", "string"], value);
  }
  return { tag: "number", val: value };
}

export function path(value: unknown): ProcessPath | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return { tag: "text", val: value };
  }
  if (value instanceof URL) {
    return { tag: "url", val: value.href };
  }
  if (value instanceof Uint8Array) {
    return { tag: "bytes", val: value };
  }
  throw invalidArgType("path", ["string", "Buffer", "URL"], value);
}

export function previous(value: CpuUsage | undefined): CpuUsage | undefined {
  // Adapted from Node per_thread.js: falsy values request a fresh measurement.
  if (!value) {
    return undefined;
  }
  for (const name of ["user", "system"] as const) {
    const field = value[name];
    if (typeof field !== "number") {
      throw invalidArgType(`prevValue.${name}`, "number", field);
    }
    if (!(field >= 0 && field <= Number.MAX_SAFE_INTEGER)) {
      const error = new RangeError(
        `The property 'prevValue.${name}' is invalid. Received ${field}`,
      );
      throw Object.assign(error, { code: "ERR_INVALID_ARG_VALUE" });
    }
  }
  return { user: value.user, system: value.system };
}

export function warning(error: Error): Warning {
  if (!(error instanceof Error)) {
    throw invalidArgType("err", "Error", error);
  }
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: "code" in error && typeof error.code === "string" ? error.code : undefined,
    detail: "detail" in error && typeof error.detail === "string" ? error.detail : undefined,
  };
}

export function makeError(data: ProcessError): Error {
  const error =
    data.name === "TypeError"
      ? new TypeError(data.message)
      : data.name === "RangeError"
        ? new RangeError(data.message)
        : new Error(data.message);
  error.name = data.name;
  for (const [key, value] of Object.entries({
    code: data.code,
    errno: decodeErrno(data.errno),
    syscall: data.syscall,
    path: data.path,
  })) {
    if (value !== undefined) {
      Object.defineProperty(error, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return error;
}

export { validateString as string, validateBoolean as boolean } from "../internal/validation.js";
