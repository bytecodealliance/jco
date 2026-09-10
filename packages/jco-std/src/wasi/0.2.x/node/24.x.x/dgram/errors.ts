import {
  codedError,
  deprecatedNodeApi,
  invalidArgType,
  invalidArgValue,
  outOfRange,
  unsupportedNodeApi,
} from "../errors/core.js";
import {
  decodeErrno,
  serializeHostError,
  errorRecord,
  stringField,
} from "../internal/host-error.js";
import type { DgramError } from "./types.js";
export { invalidArgType, invalidArgValue, outOfRange };
export function socketError(code: string, message: string): Error & { code: string } {
  return codedError(
    code === "ERR_SOCKET_BAD_BUFFER_SIZE" || code === "ERR_SOCKET_BAD_TYPE"
      ? new TypeError(message)
      : new Error(message),
    code,
  );
}
export function notRunning(): Error {
  return socketError("ERR_SOCKET_DGRAM_NOT_RUNNING", "Not running");
}
export function alreadyBound(): Error {
  return socketError("ERR_SOCKET_ALREADY_BOUND", "Socket is already bound");
}
export function connected(): Error {
  return socketError("ERR_SOCKET_DGRAM_IS_CONNECTED", "Already connected");
}
export function notConnected(): Error {
  return socketError("ERR_SOCKET_DGRAM_NOT_CONNECTED", "Not connected");
}
export function deprecated(api: string): never {
  throw deprecatedNodeApi(api, "dgram.createSocket() and the public Socket methods");
}
export function unsupported(api: string): never {
  throw unsupportedNodeApi(
    api,
    "Native file descriptors and shared cluster handles cannot cross a component boundary",
  );
}
export function serializeError(error: unknown): DgramError {
  const record = errorRecord(error);
  const info = errorRecord(record.info);
  const bufferInfo =
    typeof info.errno === "number" &&
    typeof info.code === "string" &&
    typeof info.message === "string" &&
    typeof info.syscall === "string"
      ? { errno: info.errno, code: info.code, message: info.message, syscall: info.syscall }
      : undefined;
  return {
    ...serializeHostError(error),
    info: bufferInfo,
    address: stringField(record.address),
    port: typeof record.port === "number" ? record.port : undefined,
  };
}
export function fromHost(error: DgramError): Error {
  const result =
    error.name === "TypeError"
      ? new TypeError(error.message)
      : error.name === "RangeError"
        ? new RangeError(error.message)
        : new Error(error.message);
  for (const [name, value] of Object.entries({
    code: error.code,
    errno: decodeErrno(error.errno),
    syscall: error.syscall,
    address: error.address,
    port: error.port,
  })) {
    if (value !== undefined) {
      Object.defineProperty(result, name, {
        value,
        configurable: true,
        writable: true,
        enumerable: true,
      });
    }
  }
  if (error.name !== result.name) {
    Object.defineProperty(result, "name", {
      value: error.name,
      configurable: true,
      writable: true,
    });
  }
  if (error.info) {
    const info: Record<string, unknown> = { ...error.info };
    Object.defineProperty(result, "info", { value: info, configurable: true, enumerable: true });
    for (const key of ["errno", "syscall"] as const) {
      Object.defineProperty(result, key, {
        get: () => info[key],
        set: (value: unknown) => {
          info[key] = value;
        },
        configurable: true,
        enumerable: true,
      });
    }
  }
  return result;
}
export function validatePort(value: unknown, name = "Port", zero = false): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim()) ||
    +value !== +value >>> 0 ||
    +value > 65535 ||
    (!zero && +value === 0)
  ) {
    throw codedError(
      new RangeError(
        `${name} should be >${zero ? "=" : ""} 0 and < 65536. Received type ${typeof value} (${String(value)}).`,
      ),
      "ERR_SOCKET_BAD_PORT",
    );
  }
  return +value;
}
export function validateString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") {
    throw invalidArgType(name, "string", value);
  }
}
export function validateNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number") {
    throw invalidArgType(name, "number", value);
  }
}
