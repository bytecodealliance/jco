import { codedError, unsupportedNodeApi } from "../errors/core.js";
import { callHost, decodeErrno } from "../internal/host-error.js";
import type { HostErrorBase } from "../internal/wit-types.js";
import type { Result } from "./types.js";

export function call<T>(operation: () => Result<T>): T {
  return callHost(operation, restoreError);
}

function restoreError(record: HostErrorBase): Error {
  const constructors = { Error, TypeError, RangeError, SyntaxError };
  const Constructor = Object.hasOwn(constructors, record.name)
    ? constructors[record.name as keyof typeof constructors]
    : Error;
  const error = new Constructor(record.message);

  error.name = record.name;

  if (record.errno !== undefined) {
    Object.assign(error, { errno: decodeErrno(record.errno) });
  }

  if (record.syscall !== undefined) {
    Object.assign(error, { syscall: record.syscall });
  }

  return record.code === undefined ? error : codedError(error, record.code);
}

export function unsupported(api: string): never {
  throw unsupportedNodeApi(
    `v8.${api}`,
    "Guest engine objects, callbacks, shared memory and native serialization hooks cannot cross the V8 host boundary",
  );
}
