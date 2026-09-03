import { denyVariant } from "../24.x.x/internal/deny-host.js";
import type { FfiHost } from "./ffi/types.js";

/**
 * The default adapter grants no FFI capability.
 *
 * Applications must select a host implementation explicitly, such as `ffi-host-node.ts`. This is
 * the most consequential of Jco's deny-by-default hosts: granting it lets a component load native
 * libraries and read and write arbitrary host memory, so declaring the WIT import deliberately
 * grants nothing on its own.
 *
 * The refusal is thrown in the shape of the WIT `variant error`, so the guest reports it the same
 * way it reports any other host failure.
 */
const denied = denyVariant("jco:node/ffi@0.1.0");

export const suffix: FfiHost["suffix"] = denied;
export const open: FfiHost["open"] = denied;
export const close: FfiHost["close"] = denied;
export const symbol: FfiHost["symbol"] = denied;
export const define: FfiHost["define"] = denied;
export const call: FfiHost["call"] = denied;
export const read: FfiHost["read"] = denied;
export const write: FfiHost["write"] = denied;
export const readText: FfiHost["readText"] = denied;
export const readBytes: FfiHost["readBytes"] = denied;
export const writeBytes: FfiHost["writeBytes"] = denied;
export const writeText: FfiHost["writeText"] = denied;
export const currentEventLoop: FfiHost["currentEventLoop"] = denied;

export default {
  call,
  close,
  currentEventLoop,
  define,
  open,
  read,
  readBytes,
  readText,
  suffix,
  symbol,
  write,
  writeBytes,
  writeText,
};
