import { codedError } from "../errors.js";

export function deprecated(api: string): never {
  throw codedError(
    new Error(`The deprecated ${api} API is not supported; use the WHATWG URL API instead`),
    "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
  );
}
export function unsupported(api: string): never {
  throw codedError(
    new Error(`${api} is not supported by the Jco component runtime`),
    "ERR_JCO_UNSUPPORTED_NODE_API",
  );
}
export function invalidURL(
  input: string,
  base?: string,
): TypeError & { code: string; input: string; base?: string } {
  const error = Object.assign(codedError(new TypeError("Invalid URL"), "ERR_INVALID_URL"), {
    input,
  });
  return base === undefined ? error : Object.assign(error, { base });
}
