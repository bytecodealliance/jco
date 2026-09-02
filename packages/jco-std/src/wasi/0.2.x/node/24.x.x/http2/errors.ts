import type { DirectHttp2Error } from "./types.js";

export interface NodeHttp2Error extends Error {
  code: string;
  errno?: number | string;
  syscall?: string;
  hostname?: string;
  address?: string;
  port?: number;
}

export function codedError(
  name: "Error" | "TypeError" | "RangeError",
  code: string,
  message: string,
): NodeHttp2Error {
  const error =
    name === "TypeError"
      ? new TypeError(message)
      : name === "RangeError"
        ? new RangeError(message)
        : new Error(message);
  error.name = name;
  return Object.assign(error, { code });
}

export function invalidArgType(name: string, expected: string, value: unknown): NodeHttp2Error {
  return codedError(
    "TypeError",
    "ERR_INVALID_ARG_TYPE",
    `The "${name}" argument must be of type ${expected}. Received ${String(value)}`,
  );
}

export function outOfRange(name: string, range: string, value: unknown): NodeHttp2Error {
  return codedError(
    "RangeError",
    "ERR_OUT_OF_RANGE",
    `The value of "${name}" is out of range. It must be ${range}. Received ${String(value)}`,
  );
}

export function invalidSetting(name: string, value: unknown): NodeHttp2Error {
  return codedError(
    "TypeError",
    "ERR_HTTP2_INVALID_SETTING_VALUE",
    `Invalid value for setting "${name}": ${String(value)}`,
  );
}

export function invalidPackedSettingsLength(): NodeHttp2Error {
  return codedError(
    "RangeError",
    "ERR_HTTP2_INVALID_PACKED_SETTINGS_LENGTH",
    "Packed settings length must be a multiple of six",
  );
}

export function adapterRequired(): never {
  throw codedError(
    "Error",
    "ERR_JCO_HTTP2_ADAPTER_REQUIRED",
    "node:http2 requires an HTTP/2 provider; map jco:node/http2@0.1.0 to an application host",
  );
}

export function unsupported(api: string, detail?: string): never {
  throw codedError(
    "Error",
    "ERR_JCO_UNSUPPORTED_NODE_API",
    `${api} is not supported by the Jco component runtime${detail ? `: ${detail}` : ""}`,
  );
}

export function deprecated(api: string, replacement: string): never {
  throw codedError(
    "Error",
    "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
    `${api} is deprecated and not supported by the Jco component runtime; use ${replacement} instead`,
  );
}

export function fromImplementationError(value: DirectHttp2Error): NodeHttp2Error {
  const error = codedError(
    value.name === "TypeError" || value.name === "RangeError" ? value.name : "Error",
    value.code ?? "ERR_JCO_HTTP2_IMPLEMENTATION",
    value.message,
  );
  error.errno = value.errno?.tag === "number" ? Number(value.errno.val) : value.errno?.val;
  error.syscall = value.syscall;
  error.hostname = value.hostname;
  error.address = value.address;
  error.port = value.port;
  return error;
}
