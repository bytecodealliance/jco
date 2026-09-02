import { POSIX_STATIC_PROPERTIES } from "./os/constants.js";
import type { OsHost, OsResult } from "./os/types.js";

function denied<T>(): OsResult<T> {
  return {
    tag: "err",
    val: {
      name: "Error",
      message: "node:os requires an application-provided host adapter",
      code: "ERR_JCO_OS_ADAPTER_REQUIRED",
    },
  };
}

/**
 * Static POSIX/WASI module values reveal no machine state and allow importing
 * the deny-by-default module. Every inspecting or mutating operation below is
 * denied until the application maps an explicit provider.
 */
export const getStaticProperties: OsHost["getStaticProperties"] = () => ({
  tag: "ok",
  val: POSIX_STATIC_PROPERTIES,
});

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
