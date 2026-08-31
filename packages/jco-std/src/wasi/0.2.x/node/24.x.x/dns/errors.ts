import type { DnsError, DnsErrorData } from "./types.js";

export function invalidArgType(name: string, expected: string): TypeError {
  const error = new TypeError(`The \"${name}\" argument must be of type ${expected}`);
  Object.assign(error, { code: "ERR_INVALID_ARG_TYPE" });
  return error;
}

export function invalidArgValue(name: string, value: unknown): TypeError {
  const error = new TypeError(`The argument '${name}' is invalid. Received ${String(value)}`);
  Object.assign(error, { code: "ERR_INVALID_ARG_VALUE" });
  return error;
}

export function unsupported(api: string): never {
  const error = new Error(`${api} is not supported across Jco's synchronous DNS host boundary`);
  Object.assign(error, { code: "ERR_JCO_UNSUPPORTED_NODE_API" });
  throw error;
}

export function dnsError(data: DnsErrorData): DnsError {
  const error = new Error(data.message) as DnsError;
  error.name = data.name;
  error.code = data.code;
  error.errno = data.errno;
  error.syscall = data.syscall;
  error.hostname = data.hostname;
  return error;
}
