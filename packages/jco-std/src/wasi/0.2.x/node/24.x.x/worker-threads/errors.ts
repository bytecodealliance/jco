import { codedError } from "../errors/core.js";
import type { HostErrorBase } from "../internal/wit-types.js";

export function fromHost(error: HostErrorBase): Error {
  const result =
    error.name === "TypeError"
      ? new TypeError(error.message)
      : error.name === "RangeError"
        ? new RangeError(error.message)
        : new Error(error.message);
  result.name = error.name;
  return error.code ? codedError(result, error.code) : result;
}
