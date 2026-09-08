import { adapterRequiredMessage } from "./internal/deny-host.js";
import { POSIX_STATIC_PROPERTIES } from "./os/constants.js";
import type { OsError, OsHost as TaggedOsHost } from "./os/types.js";
import type { HostImports } from "./internal/wit-types.js";

type OsHost = HostImports<TaggedOsHost>;

/**
 * JS bindings lower thrown records into the `err` case of WIT `result<T, error>`.
 * The guest reconstructs the same structured error used by the explicit Node host.
 */
const denied = (): never => {
  throw {
    name: "Error",
    message: adapterRequiredMessage("node:os"),
    code: "ERR_JCO_OS_ADAPTER_REQUIRED",
  } satisfies OsError;
};

/**
 * Static POSIX/WASI module values reveal no machine state and allow importing
 * the deny-by-default module. Every inspecting or mutating operation below is
 * denied until the application maps an explicit provider.
 */
export const getStaticProperties: OsHost["getStaticProperties"] = () => POSIX_STATIC_PROPERTIES;

export const arch: OsHost["arch"] = denied;

export const availableParallelism: OsHost["availableParallelism"] = denied;

export const cpus: OsHost["cpus"] = denied;

export const endianness: OsHost["endianness"] = denied;

export const freemem: OsHost["freemem"] = denied;

export const getPriority: OsHost["getPriority"] = denied;

export const homedir: OsHost["homedir"] = denied;

export const hostname: OsHost["hostname"] = denied;

export const loadavg: OsHost["loadavg"] = denied;

export const machine: OsHost["machine"] = denied;

export const networkInterfaces: OsHost["networkInterfaces"] = denied;

export const platform: OsHost["platform"] = denied;

export const release: OsHost["release"] = denied;

export const setPriority: OsHost["setPriority"] = denied;

export const tmpdir: OsHost["tmpdir"] = denied;

export const totalmem: OsHost["totalmem"] = denied;

export const type: OsHost["type"] = denied;

export const uptime: OsHost["uptime"] = denied;

export const userInfo: OsHost["userInfo"] = denied;

export const version: OsHost["version"] = denied;

const host: OsHost = {
  getStaticProperties,
  arch,
  availableParallelism,
  cpus,
  endianness,
  freemem,
  getPriority,
  homedir,
  hostname,
  loadavg,
  machine,
  networkInterfaces,
  platform,
  release,
  setPriority,
  tmpdir,
  totalmem,
  type,
  uptime,
  userInfo,
  version,
};

export default host;
