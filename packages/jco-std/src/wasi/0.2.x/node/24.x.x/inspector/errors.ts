/**
 * Node-faithful errors for the `node:inspector` shim.
 *
 * State errors (`ERR_INSPECTOR_*`) and argument errors (`ERR_INVALID_ARG_TYPE`) are raised
 * guest-side before any host call, so their codes and messages match Node's exactly without a
 * round trip. Protocol errors (`ERR_INSPECTOR_COMMAND`) and other host failures are reconstructed
 * from the host's `failure` record. `ERR_JCO_INSPECTOR_ADAPTER_REQUIRED` reports the deny-by-default
 * adapter.
 *
 * The `Received ...` clause reproduces Node's internal `determineSpecificType`
 * (`lib/internal/errors.js`, Node 24.20.0) so `ERR_INVALID_ARG_TYPE` messages are byte-identical.
 */

import type { HostError, HostFailure } from "./types.js";

export interface CodedError extends Error {
  code: string;
}

function coded(code: string, message: string): CodedError {
  const error = new Error(message) as CodedError;
  error.code = code;
  return error;
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
 * Node's `determineSpecificType`: the `Received ...` tail of an `ERR_INVALID_ARG_TYPE` message.
 */
function receivedType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  const type = typeof value;
  if (type === "function") {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" && name.length > 0 ? `function ${name}` : "function";
  }
  if (type === "object") {
    const constructor = (value as object).constructor;
    const name = typeof constructor === "function" ? constructor.name : undefined;
    return name ? `an instance of ${name}` : "an instance of Object";
  }
  let rendered: string;
  if (type === "bigint") {
    rendered = `${String(value)}n`;
  } else if (type === "string") {
    let inner = value as string;
    if (inner.length > 25) {
      inner = `${inner.slice(0, 25)}...`;
    }
    rendered = `'${inner}'`;
  } else {
    rendered = String(value);
  }
  return `type ${type} (${rendered})`;
}

/**
 * Node's `ERR_INVALID_ARG_TYPE` for a single expected type.
 *
 * @param name - the argument name, as Node names it
 * @param expected - the expected type word (`string`, `object`, `function`)
 * @param actual - the value received
 */
export function invalidArgType(name: string, expected: string, actual: unknown): CodedError {
  return coded(
    "ERR_INVALID_ARG_TYPE",
    `The "${name}" argument must be of type ${expected}. Received ${receivedType(actual)}`,
  );
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
