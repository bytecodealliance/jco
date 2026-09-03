/**
 * Deny-by-default host providers for host-backed Node builtins.
 *
 * Declaring or injecting a `jco:node/*` WIT import must never grant host access on its own, so
 * every host-backed builtin ships a provider whose every operation refuses. This module owns the
 * three refusal shapes so each `<mod>-host.ts` is only its member list; which shape a builtin uses
 * is dictated by its WIT contract, not by preference:
 *
 * - `denyThrow` -- for interfaces whose functions do not return `result`. The provider throws a
 *   coded `Error`, which jco surfaces to the guest as an exception carrying
 *   `ERR_JCO_<MOD>_ADAPTER_REQUIRED` (child-process, cluster, console, dns, fs, http).
 * - `denyResult` -- for interfaces whose functions return `result<T, error>` and whose guest side
 *   rebuilds errors from the record. The provider *returns* the `err` case rather than throwing,
 *   so the guest reports the refusal through the same path as any other host failure (os).
 * - `denyVariant` -- for interfaces whose functions return `result<T, variant error>` with an
 *   explicit `denied(string)` case. The provider throws the raw variant, which jco lowers back to
 *   the same tagged object guest-side, and the guest maps `denied` to its adapter-required code
 *   (inspector, ffi).
 *
 * The per-member `export const x: XHost["x"] = deny;` lines in each host file are load-bearing:
 * jco binds WIT functions to the module's named ESM exports, which cannot be generated.
 */

import { codedError, type ErrorCode } from "../errors/core.js";

import type { HostResult } from "./wit-types.js";

/** The standard refusal message for a builtin whose host adapter has not been mapped. */
export function adapterRequiredMessage(specifier: string): string {
  return `${specifier} requires an application-provided host adapter`;
}

/** A provider operation that throws a coded `Error` on every call. */
export function denyThrow(code: ErrorCode, message: string): (...args: unknown[]) => never {
  return () => {
    throw codedError(new Error(message), code);
  };
}

/** A provider operation that returns the `err` case of a WIT `result` on every call. */
export function denyResult<E>(error: E): <T>(...args: unknown[]) => HostResult<T, E> {
  return <T>(): HostResult<T, E> => ({ tag: "err", val: error });
}

/** A provider operation that throws the WIT `variant error` `denied` case on every call. */
export function denyVariant(witInterface: string): (...args: unknown[]) => never {
  return () => {
    throw { tag: "denied", val: `map ${witInterface} to a host adapter to grant it` };
  };
}
