import type {
  CpuInfo,
  NetworkInterfaces,
  OsConstantEntry,
  OsError,
  OsErrorInfo,
  OsHostConstants,
  OsHostCpuInfo,
  OsHostNetworkInterface,
  OsHostUserInfo,
  OsHostUserInfoValue,
  OsResult,
  OsStaticProperties,
  UserInfo,
} from "./types.js";
import {
  capture,
  encodeErrno,
  errorRecord,
  serializeHostError,
  stringField,
} from "../internal/host-error.js";

function errorInfo(value: unknown): OsErrorInfo | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = errorRecord(value);
  return {
    errno: encodeErrno(record.errno),
    code: stringField(record.code),
    message: stringField(record.message),
    syscall: stringField(record.syscall),
  };
}

/** Serialize a thrown provider error into the typed OS component boundary. */
export function serializeOsError(error: unknown): OsError {
  return { ...serializeHostError(error), info: errorInfo(errorRecord(error).info) };
}

/** Run a synchronous provider operation and preserve its structured error. */
export function captureOsCall<T>(operation: () => T): OsResult<T> {
  return capture(operation, serializeOsError);
}

function constantEntries(values: object): OsConstantEntry[] {
  return Object.entries(values).map(([name, value]) => ({ name, value: BigInt(value) }));
}

/** Convert Node-shaped constants to the platform-neutral WIT representation. */
export function serializeOsConstants(constants: {
  UV_UDP_REUSEADDR: number;
  dlopen: object;
  errno: object;
  signals: object;
  priority: object;
}): OsHostConstants {
  return {
    uvUdpReuseaddr: constants.UV_UDP_REUSEADDR,
    dlopen: constantEntries(constants.dlopen),
    errno: constantEntries(constants.errno),
    signals: constantEntries(constants.signals),
    priority: constantEntries(constants.priority),
  };
}

/** Build the eager snapshot required by Node's value-valued OS exports. */
export function serializeOsStaticProperties(
  eol: string,
  devNull: string,
  constants: Parameters<typeof serializeOsConstants>[0],
): OsStaticProperties {
  return { eol, devNull, constants: serializeOsConstants(constants) };
}

/** Convert Node CPU number fields to WIT's lossless integer representation. */
export function serializeOsCpus(cpus: CpuInfo[]): OsHostCpuInfo[] {
  return cpus.map((cpu) => ({
    model: cpu.model,
    speed: cpu.speed,
    times: {
      user: BigInt(cpu.times.user),
      nice: BigInt(cpu.times.nice),
      sys: BigInt(cpu.times.sys),
      idle: BigInt(cpu.times.idle),
      irq: BigInt(cpu.times.irq),
    },
  }));
}

/** Flatten Node's dynamic interface-name dictionary into typed WIT records. */
export function serializeNetworkInterfaces(
  interfaces: NetworkInterfaces,
): OsHostNetworkInterface[] {
  const result: OsHostNetworkInterface[] = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      result.push({
        name,
        address: address.address,
        netmask: address.netmask,
        family: address.family === "IPv4" ? "ipv4" : "ipv6",
        mac: address.mac,
        internal: address.internal,
        scopeid: address.scopeid,
        cidr: address.cidr ?? undefined,
      });
    }
  }
  return result;
}

function serializeUserInfoValue(value: string | Uint8Array): OsHostUserInfoValue {
  return typeof value === "string" ? { tag: "text", val: value } : { tag: "bytes", val: value };
}

/** Convert Node user information, including Buffer-valued fields, to WIT. */
export function serializeUserInfo(value: UserInfo<string | Uint8Array>): OsHostUserInfo {
  return {
    username: serializeUserInfoValue(value.username),
    uid: BigInt(value.uid),
    gid: BigInt(value.gid),
    shell: value.shell === null ? undefined : serializeUserInfoValue(value.shell),
    homedir: serializeUserInfoValue(value.homedir),
  };
}
