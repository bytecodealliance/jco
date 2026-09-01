import type { DirectHttpError, HttpErrorData } from "./types.js";

export interface NodeHttpError extends Error {
  code: string;
  errno?: number | string;
  syscall?: string;
  hostname?: string;
  address?: string;
  port?: number;
}

function codedError(
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
  error.name = name;
  return Object.assign(error, { code });
}

export function invalidArgType(name: string, expected: string, value: unknown): NodeHttpError {
  return codedError(
    "TypeError",
    "ERR_INVALID_ARG_TYPE",
    `The \"${name}\" argument must be of type ${expected}. Received ${String(value)}`,
  );
}

export function invalidArgValue(name: string, value: unknown): NodeHttpError {
  return codedError(
    "TypeError",
    "ERR_INVALID_ARG_VALUE",
    `The argument '${name}' is invalid. Received ${String(value)}`,
  );
}

export function outOfRange(name: string, range: string, value: unknown): NodeHttpError {
  return codedError(
    "RangeError",
    "ERR_OUT_OF_RANGE",
    `The value of "${name}" is out of range. It must be ${range}. Received ${String(value)}`,
  );
}

export function invalidHttpToken(label: string, value: string): NodeHttpError {
  return codedError(
    "TypeError",
    "ERR_INVALID_HTTP_TOKEN",
    `${label} must be a valid HTTP token [\"${value}\"]`,
  );
}

export function invalidHeaderChar(name: string): NodeHttpError {
  return codedError(
    "TypeError",
    "ERR_INVALID_CHAR",
    `Invalid character in header content [\"${name}\"]`,
  );
}

export function headerAlreadySent(): NodeHttpError {
  return codedError(
    "Error",
    "ERR_HTTP_HEADERS_SENT",
    "Cannot modify headers after they are sent to the client",
  );
}

export function writeAfterEnd(): NodeHttpError {
  return codedError("Error", "ERR_STREAM_WRITE_AFTER_END", "write after end");
}

export function adapterRequired(): never {
  throw codedError(
    "Error",
    "ERR_JCO_HTTP_ADAPTER_REQUIRED",
    "node:http requires an HTTP provider; select --with-nodejs-http-via or map jco:node/http@0.1.0 to an application host",
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

export function fromTransportError(value: HttpErrorData | DirectHttpError): NodeHttpError {
  const error = codedError(
    value.name === "TypeError" || value.name === "RangeError" ? value.name : "Error",
    value.code ?? "ERR_JCO_HTTP_TRANSPORT",
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
