/**
 * Serialization of errors across the host-backed Node builtin WIT boundary.
 *
 * A Node host adapter runs the real Node API and must hand any thrown error back to the guest as
 * a plain WIT `error` record; the guest then rebuilds an `Error` from it. The record shape and the
 * errno encoding are the same for every builtin, so the conversion lives here once. Builtins with
 * extra fields (`path`/`dest`, `hostname`, `address`/`port`, `info`) spread `serializeHostError`
 * and add them.
 */

import type { HostErrno, HostErrorBase, HostResult } from "./wit-types.js";

/** Narrow an unknown thrown value to a readable record; anything else reads as empty. */
export function errorRecord(error: unknown): Record<string, unknown> {
  return typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
}

/** Read a string-valued field, or `undefined` when it is absent or not a string. */
export function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Encode Node's numeric-or-symbolic `errno` as the WIT `errno` variant. */
export function encodeErrno(value: unknown): HostErrno | undefined {
  if (typeof value === "number") {
    return { tag: "number", val: BigInt(value) };
  }
  if (typeof value === "string") {
    return { tag: "symbolic", val: value };
  }
  return undefined;
}

/** Decode the WIT `errno` variant back to the number-or-string Node exposes. */
export function decodeErrno(value?: HostErrno): number | string | undefined {
  if (!value) {
    return undefined;
  }
  return value.tag === "number" ? Number(value.val) : value.val;
}

/** Serialize the fields every builtin's host error record shares. */
export function serializeHostError(error: unknown): HostErrorBase {
  const value = errorRecord(error);
  return {
    name: stringField(value.name) ?? "Error",
    message: stringField(value.message) ?? String(error),
    code: stringField(value.code),
    errno: encodeErrno(value.errno),
    syscall: stringField(value.syscall),
  };
}

/** Read either representation of a synchronous WIT result without losing its error fields. */
export function callHost<T, E extends HostErrorBase>(
  operation: () => T | HostResult<T, E>,
  makeError: (error: E) => Error,
): T {
  let result: T | HostResult<T, E>;
  try {
    result = operation();
  } catch (error) {
    const record = errorRecord(error);
    const payload = errorRecord(record.payload ?? error);
    // Bindings throw either the WIT error record or a ComponentError carrying it.
    // Ordinary JS errors and runtime traps must retain their identity.
    if (
      (!(error instanceof Error) || record.payload !== undefined) &&
      typeof payload.name === "string" &&
      typeof payload.message === "string"
    ) {
      throw makeError(payload as unknown as E);
    }
    throw error;
  }
  if (result !== null && typeof result === "object" && "tag" in result) {
    if (result.tag === "err") {
      throw makeError((result as { tag: "err"; val: E }).val);
    }
    if (result.tag === "ok") {
      return (result as { tag: "ok"; val: T }).val;
    }
  }
  return result as T;
}

/** Run a synchronous host operation, capturing a thrown error as a serialized `result`. */
export function capture<T, E>(
  operation: () => T,
  serialize: (error: unknown) => E,
): HostResult<T, E> {
  try {
    return { tag: "ok", val: operation() };
  } catch (error) {
    return { tag: "err", val: serialize(error) };
  }
}

/** Run an asynchronous host operation, capturing a rejection as a serialized `result`. */
export async function captureAsync<T, E>(
  operation: () => Promise<T>,
  serialize: (error: unknown) => E,
): Promise<HostResult<T, E>> {
  try {
    return { tag: "ok", val: await operation() };
  } catch (error) {
    return { tag: "err", val: serialize(error) };
  }
}
