/**
 * Error constructors for the portable node:http shim.
 *
 * Node's generic argument errors and Jco's unsupported/deprecated refusals come from the shared
 * factory and templates in `../errors/core.js`, so they carry the same identity as every other
 * builtin. Only the HTTP-specific codes (`ERR_INVALID_HTTP_TOKEN`, `ERR_INVALID_CHAR`,
 * `ERR_HTTP_HEADERS_SENT`, `ERR_STREAM_WRITE_AFTER_END`) and the host-record reconstruction live
 * here. Message templates for those follow nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/internal/errors.js (MIT license).
 */

import {
  codedError,
  deprecatedNodeApi,
  invalidArgType as sharedInvalidArgType,
  invalidArgValue as sharedInvalidArgValue,
  outOfRange as sharedOutOfRange,
  unsupportedNodeApi,
} from "../errors/core.js";

import type { DirectHttpError, HttpErrorData } from "./types.js";

export interface NodeHttpError extends Error {
  code: string;
  errno?: number | string;
  syscall?: string;
  hostname?: string;
  address?: string;
  port?: number;
}

function httpError(
  name: "Error" | "TypeError" | "RangeError",
  code: string,
  message: string,
): NodeHttpError {
  const error =
    name === "TypeError"
      ? new TypeError(message)
      : name === "RangeError"
        ? new RangeError(message)
        : new Error(message);
  return codedError(error, code) as NodeHttpError;
}

export function invalidArgType(name: string, expected: string, value: unknown): NodeHttpError {
  return sharedInvalidArgType(name, expected, value) as NodeHttpError;
}

export function invalidArgValue(name: string, value: unknown): NodeHttpError {
  return sharedInvalidArgValue(name, value) as NodeHttpError;
}

export function outOfRange(name: string, range: string, value: unknown): NodeHttpError {
  return sharedOutOfRange(name, range, value) as NodeHttpError;
}

export function invalidHttpToken(label: string, value: string): NodeHttpError {
  return httpError(
    "TypeError",
    "ERR_INVALID_HTTP_TOKEN",
    `${label} must be a valid HTTP token ["${value}"]`,
  );
}

export function invalidHeaderChar(name: string): NodeHttpError {
  return httpError(
    "TypeError",
    "ERR_INVALID_CHAR",
    `Invalid character in header content ["${name}"]`,
  );
}

export function headerAlreadySent(): NodeHttpError {
  return httpError(
    "Error",
    "ERR_HTTP_HEADERS_SENT",
    "Cannot modify headers after they are sent to the client",
  );
}

export function writeAfterEnd(): NodeHttpError {
  return httpError("Error", "ERR_STREAM_WRITE_AFTER_END", "write after end");
}

export function adapterRequired(): never {
  throw httpError(
    "Error",
    "ERR_JCO_HTTP_ADAPTER_REQUIRED",
    "node:http requires an HTTP provider; select --with-nodejs-http-via or map jco:node/http@0.1.0 to an application host",
  );
}

export function unsupported(api: string, detail?: string): never {
  throw unsupportedNodeApi(api, detail ?? "the Jco component runtime does not implement it");
}

export function deprecated(api: string, replacement: string): never {
  throw deprecatedNodeApi(api, replacement);
}

export function fromImplementationError(value: HttpErrorData | DirectHttpError): NodeHttpError {
  const error = httpError(
    value.name === "TypeError" || value.name === "RangeError" ? value.name : "Error",
    value.code ?? "ERR_JCO_HTTP_IMPLEMENTATION",
    value.message,
  );
  const errno = value.errno;
  error.errno =
    typeof errno === "object" && errno !== null
      ? errno.tag === "number"
        ? Number(errno.val)
        : errno.val
      : errno;
  error.syscall = value.syscall;
  error.hostname = value.hostname;
  error.address = value.address;
  error.port = value.port;
  return error;
}
