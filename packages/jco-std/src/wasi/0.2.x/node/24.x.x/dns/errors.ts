/**
 * Errors for the `node:dns` shim.
 *
 * Argument errors use the shared factory and templates in `../errors/core.js`. `dnsError`
 * reconstructs the host's serialized error record into the `Error` a guest should see.
 */

import {
  codedError,
  invalidArgValue as sharedInvalidArgValue,
  invalidArgType as sharedInvalidArgType,
  unsupportedNodeApi,
} from "../errors/core.js";
import { decodeErrno } from "../internal/host-error.js";

import type { DnsError, DnsErrorData } from "./types.js";

/**
 * Node's `ERR_INVALID_ARG_TYPE`.
 *
 * Callers that have the offending value in hand pass it so the message carries Node's
 * `Received ...` clause; callers that only know the expected type get the clause-free form.
 */
export function invalidArgType(name: string, expected: string, actual?: unknown): TypeError {
  if (arguments.length >= 3) {
    return sharedInvalidArgType(name, expected, actual);
  }
  return codedError(
    new TypeError(`The "${name}" argument must be of type ${expected}`),
    "ERR_INVALID_ARG_TYPE",
  );
}

export function invalidArgValue(name: string, value: unknown): TypeError {
  return sharedInvalidArgValue(name, value);
}

export function unsupported(api: string): never {
  throw unsupportedNodeApi(api, "Jco's DNS host boundary is synchronous and cannot carry it");
}

export function dnsError(data: DnsErrorData): DnsError {
  const error = new Error(data.message) as DnsError;
  error.name = data.name;
  error.code = data.code;
  error.errno = decodeErrno(data.errno);
  error.syscall = data.syscall;
  error.hostname = data.hostname;
  return error;
}
