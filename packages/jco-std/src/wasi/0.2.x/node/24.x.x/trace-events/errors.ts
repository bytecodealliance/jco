import { codedError } from "../errors/core.js";
import { callHost } from "../internal/host-error.js";

import type { HostErrorBase } from "../internal/wit-types.js";

/** Use the shared bridge for raw results and ComponentError.payload wrappers. */
export function hostCall<T>(operation: () => T): T {
  return callHost(operation, fromHost);
}

function fromHost(failure: HostErrorBase): Error {
  let result: Error;

  switch (failure.name) {
    case "TypeError":
      result = new TypeError(failure.message);
      break;
    case "RangeError":
      result = new RangeError(failure.message);
      break;
    default:
      result = new Error(failure.message);
  }

  if (result.name !== failure.name) {
    Object.defineProperty(result, "name", {
      value: failure.name,
      configurable: true,
      writable: true,
    });
  }

  return failure.code === undefined ? result : codedError(result, failure.code);
}
