import type {
  CpuInfo,
  NetworkInterfaces,
  OsConstantEntry,
  OsErrno,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function errnoField(value: unknown): OsErrno | undefined {
  if (typeof value === "number") {
    return { tag: "number", val: BigInt(value) };
  }
  if (typeof value === "string") {
    return { tag: "symbolic", val: value };
  }
  return undefined;
}

function errorInfo(value: unknown): OsErrorInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    errno: errnoField(value.errno),
    code: stringField(value.code),
    message: stringField(value.message),
    syscall: stringField(value.syscall),
  };
}

/** Serialize a thrown provider error into the typed OS component boundary. */
export function serializeOsError(error: unknown): OsError {
  const value = isRecord(error) ? error : {};
  return {
    name: stringField(value.name) ?? "Error",
    message: stringField(value.message) ?? String(error),
    code: stringField(value.code),
    errno: errnoField(value.errno),
    syscall: stringField(value.syscall),
    info: errorInfo(value.info),
  };
}

/** Run a synchronous provider operation and preserve its structured error. */
export function captureOsCall<T>(operation: () => T): OsResult<T> {
  try {
    return { tag: "ok", val: operation() };
  } catch (error) {
    return { tag: "err", val: serializeOsError(error) };
  }
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
