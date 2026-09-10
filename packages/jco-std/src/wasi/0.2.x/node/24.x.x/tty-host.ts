import { adapterRequiredMessage } from "./internal/deny-host.js";
import type { TtyError, TtyProvider } from "./tty/types.js";

/**
 * JS bindings lower thrown records into the `err` case of WIT `result<T, error>`.
 * The guest reconstructs the same structured error used by the explicit Node host.
 */
const denied = (): never => {
  throw {
    name: "Error",
    message: adapterRequiredMessage("node:tty"),
    code: "ERR_JCO_TTY_ADAPTER_REQUIRED",
  } satisfies TtyError;
};

/**
 * The default adapter intentionally grants no terminal. Every operation, including
 * `isatty` on an in-range descriptor, is denied until the application maps a provider.
 */
export const isTty: TtyProvider["isTty"] = denied;

export const open: TtyProvider["open"] = denied;

export const close: TtyProvider["close"] = denied;

export const windowSize: TtyProvider["windowSize"] = denied;

export const setRawMode: TtyProvider["setRawMode"] = denied;

export const read: TtyProvider["read"] = denied;

export const write: TtyProvider["write"] = denied;

export const environment: TtyProvider["environment"] = denied;

const host: TtyProvider = {
  isTty,
  open,
  close,
  windowSize,
  setRawMode,
  read,
  write,
  environment,
};

export default host;
