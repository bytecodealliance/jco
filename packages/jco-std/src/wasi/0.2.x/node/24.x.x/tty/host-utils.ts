import type { TtyError, TtyErrorInfo } from "./types.js";
import {
  encodeErrno,
  errorRecord,
  serializeHostError,
  stringField,
} from "../internal/host-error.js";

function errorInfo(value: unknown): TtyErrorInfo | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = errorRecord(value);
  return {
    errno: encodeErrno(record.errno),
    code: stringField(record.code),
    message: stringField(record.message),
    syscall: stringField(record.syscall),
  };
}

/** Serialize a thrown provider error into the typed terminal component boundary. */
export function serializeTtyError(error: unknown): TtyError {
  return { ...serializeHostError(error), info: errorInfo(errorRecord(error).info) };
}

/** Run a synchronous provider operation and preserve its structured error. */
export function captureTtyCall<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw serializeTtyError(error);
  }
}
