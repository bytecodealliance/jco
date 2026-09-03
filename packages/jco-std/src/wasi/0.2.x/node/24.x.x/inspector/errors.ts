/**
 * Node-faithful errors for the `node:inspector` shim.
 *
 * State errors (`ERR_INSPECTOR_*`) and argument errors (`ERR_INVALID_ARG_TYPE`) are raised
 * guest-side before any host call, so their codes and messages match Node's exactly without a
 * round trip. Protocol errors (`ERR_INSPECTOR_COMMAND`) and other host failures are reconstructed
 * from the host's `failure` record. `ERR_JCO_INSPECTOR_ADAPTER_REQUIRED` reports the deny-by-default
 * adapter.
 *
 * The coded-error factory and the `Received ...` clause of `ERR_INVALID_ARG_TYPE` are the shared
 * ones in `../errors/core.js` (which follow nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/internal/errors.js, MIT license). The
 * `ERR_INSPECTOR_*` messages below are verbatim from the same file.
 */

import {
  type CodedError as SharedCodedError,
  codedError,
  invalidArgType as sharedInvalidArgType,
} from "../errors/core.js";

import type { HostError, HostFailure } from "./types.js";

export type CodedError = SharedCodedError<Error, string>;

function coded(code: string, message: string): CodedError {
  return codedError(new Error(message), code);
}

export function notConnected(): CodedError {
  return coded("ERR_INSPECTOR_NOT_CONNECTED", "Session is not connected");
}

export function alreadyConnected(): CodedError {
  return coded("ERR_INSPECTOR_ALREADY_CONNECTED", "The inspector session is already connected");
}

export function notWorker(): CodedError {
  return coded("ERR_INSPECTOR_NOT_WORKER", "Current thread is not a worker");
}

export function alreadyActivated(): CodedError {
  return coded(
    "ERR_INSPECTOR_ALREADY_ACTIVATED",
    "Inspector is already activated. Close it with inspector.close() before activating it again.",
  );
}

export function notActive(): CodedError {
  return coded("ERR_INSPECTOR_NOT_ACTIVE", "Inspector is not active");
}

export function adapterRequired(): CodedError {
  return coded(
    "ERR_JCO_INSPECTOR_ADAPTER_REQUIRED",
    "node:inspector requires an application-provided host adapter; map jco:node/inspector@0.1.0 to one to grant it",
  );
}

/**
 * Node's `ERR_INVALID_ARG_TYPE` for a single expected type.
 *
 * @param name - the argument name, as Node names it
 * @param expected - the expected type word (`string`, `object`, `function`)
 * @param actual - the value received
 */
export function invalidArgType(name: string, expected: string, actual: unknown): CodedError {
  return sharedInvalidArgType(name, expected, actual);
}

/** Reconstruct the `Error` a protocol/host failure should surface as, preserving Node's code. */
export function fromFailure(failure: HostFailure): CodedError {
  return coded(failure.code, failure.message);
}

/**
 * Turn a thrown host `error` variant into the `Error` the guest should surface.
 *
 * The deny adapter and the Node adapter both throw the WIT variant shape; jco lowers it back to the
 * same object on the guest side.
 */
export function fromHostError(error: unknown): CodedError {
  if (isHostError(error)) {
    switch (error.tag) {
      case "denied":
        return adapterRequired();
      case "unavailable":
        return coded("ERR_JCO_INSPECTOR_UNAVAILABLE", error.val);
      case "no-such-session":
        return notConnected();
      case "failed":
        return fromFailure(error.val);
    }
  }
  if (error instanceof Error) {
    return error as CodedError;
  }
  return coded("ERR_JCO_INSPECTOR_HOST", String(error));
}

function isHostError(value: unknown): value is HostError {
  return (
    typeof value === "object" &&
    value !== null &&
    "tag" in value &&
    typeof (value as { tag: unknown }).tag === "string"
  );
}
