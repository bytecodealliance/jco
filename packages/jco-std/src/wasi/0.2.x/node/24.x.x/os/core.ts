/**
 * Node.js OS compatibility facade.
 *
 * Public shape, validation order, coercion hooks, and record conversion are
 * adapted from nodejs/node v24.20.0 `lib/os.js` at commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01 (MIT license). Native bindings are
 * replaced by a typed, synchronous host provider.
 */
import { Buffer } from "node:buffer";

import { invalidArgType, outOfRange, systemError } from "../errors.js";
import type {
  Architecture,
  CpuInfo,
  NetworkInterfaceInfo,
  NetworkInterfaces,
  OsConstantEntry,
  OsConstants,
  OsErrno,
  OsError,
  OsHost,
  OsHostUserInfoValue,
  OsModule,
  OsResult,
  Platform,
  UserInfo,
  UserInfoOptions,
  UserInfoOptionsWithBufferEncoding,
  UserInfoOptionsWithStringEncoding,
} from "./types.js";

function errnoValue(value?: OsErrno): number | string | undefined {
  return value?.tag === "number" ? Number(value.val) : value?.val;
}

function providerError(data: OsError): Error {
  const info = data.info
    ? {
        errno: errnoValue(data.info.errno),
        code: data.info.code,
        message: data.info.message,
        syscall: data.info.syscall,
      }
    : undefined;
  if (data.name === "SystemError" || data.code === "ERR_SYSTEM_ERROR") {
    const error = systemError({
      message: data.message,
      code: data.code ?? "ERR_SYSTEM_ERROR",
      errno: errnoValue(data.errno),
      syscall: data.syscall,
      info,
    });
    error.name = data.name;
    return error;
  }
  const error =
    data.name === "TypeError"
      ? new TypeError(data.message)
      : data.name === "RangeError"
        ? new RangeError(data.message)
        : new Error(data.message);
  error.name = data.name;
  for (const [name, value] of Object.entries({
    code: data.code,
    errno: errnoValue(data.errno),
    syscall: data.syscall,
    info,
  })) {
    if (value !== undefined) {
      Object.defineProperty(error, name, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return error;
}

function unwrap<T>(result: OsResult<T>): T {
  if (result.tag === "err") {
    throw providerError(result.val);
  }
  return result.val;
}

function constantsRecord(entries: OsConstantEntry[]): Record<string, number> {
  const record = Object.create(null) as Record<string, number>;
  for (const { name, value } of entries) {
    record[name] = Number(value);
  }
  return record;
}

function primitive<T extends string | number>(fn: () => T): () => T {
  Object.assign(fn, { [Symbol.toPrimitive]: () => fn() });
  return fn;
}

function validateInt32(
  value: unknown,
  name: string,
  minimum = -2147483648,
  maximum = 2147483647,
): number {
  if (typeof value !== "number") {
    throw invalidArgType(name, "number", value);
  }
  if (!Number.isInteger(value)) {
    throw outOfRange(name, "an integer", value);
  }
  if (value < minimum || value > maximum) {
    throw outOfRange(name, `>= ${minimum} && <= ${maximum}`, value);
  }
  return value;
}

function userInfoValue(value: OsHostUserInfoValue): string | Buffer {
  return value.tag === "text" ? value.val : Buffer.from(value.val);
}

/** Build a Node-shaped OS module from a synchronous typed host provider. */
export function createOs(host: OsHost): OsModule {
  const staticProperties = unwrap(host.getStaticProperties());
  const constants: OsConstants = Object.assign(Object.create(null), {
    UV_UDP_REUSEADDR: staticProperties.constants.uvUdpReuseaddr,
    dlopen: constantsRecord(staticProperties.constants.dlopen),
    errno: constantsRecord(staticProperties.constants.errno),
    signals: Object.freeze(constantsRecord(staticProperties.constants.signals)),
    priority: constantsRecord(staticProperties.constants.priority),
  });

  const arch = primitive(function arch(): Architecture {
    return unwrap(host.arch());
  });

  const availableParallelism = primitive(function availableParallelism(): number {
    return unwrap(host.availableParallelism());
  });

  function cpus(): CpuInfo[] {
    return unwrap(host.cpus()).map((cpu) => ({
      model: cpu.model,
      speed: cpu.speed,
      times: {
        user: Number(cpu.times.user),
        nice: Number(cpu.times.nice),
        sys: Number(cpu.times.sys),
        idle: Number(cpu.times.idle),
        irq: Number(cpu.times.irq),
      },
    }));
  }

  const endianness = primitive(function endianness(): "BE" | "LE" {
    return unwrap(host.endianness()) === "be" ? "BE" : "LE";
  });

  const freemem = primitive(function freemem(): number {
    return Number(unwrap(host.freemem()));
  });

  function getPriority(pid?: number): number {
    return unwrap(host.getPriority(pid === undefined ? 0 : validateInt32(pid, "pid")));
  }

  const homedir = primitive(function homedir(): string {
    return unwrap(host.homedir());
  });

  const hostname = primitive(function hostname(): string {
    return unwrap(host.hostname());
  });

  function loadavg(): number[] {
    const average = unwrap(host.loadavg());
    return [average.one, average.five, average.fifteen];
  }

  const machine = primitive(function machine(): string {
    return unwrap(host.machine());
  });

  function networkInterfaces(): NetworkInterfaces {
    const result: NetworkInterfaces = {};
    for (const value of unwrap(host.networkInterfaces())) {
      let address: NetworkInterfaceInfo;
      if (value.family === "ipv4") {
        address = {
          address: value.address,
          netmask: value.netmask,
          family: "IPv4",
          mac: value.mac,
          internal: value.internal,
          cidr: value.cidr ?? null,
        };
        if (value.scopeid !== undefined) {
          address.scopeid = value.scopeid;
        }
      } else {
        address = {
          address: value.address,
          netmask: value.netmask,
          family: "IPv6",
          mac: value.mac,
          internal: value.internal,
          scopeid: value.scopeid ?? 0,
          cidr: value.cidr ?? null,
        };
      }
      (result[value.name] ??= []).push(address);
    }
    return result;
  }

  const platform = primitive(function platform(): Platform {
    return unwrap(host.platform());
  });

  const release = primitive(function release(): string {
    return unwrap(host.release());
  });

  function setPriority(priority: number): void;
  function setPriority(pid: number, priority: number): void;
  function setPriority(pidOrPriority: number, priority?: number): void {
    const pid = priority === undefined ? 0 : validateInt32(pidOrPriority, "pid");
    const selectedPriority = validateInt32(
      priority === undefined ? pidOrPriority : priority,
      "priority",
      -20,
      19,
    );
    unwrap(host.setPriority(pid, selectedPriority));
  }

  const tmpdir = primitive(function tmpdir(): string {
    return unwrap(host.tmpdir());
  });

  const totalmem = primitive(function totalmem(): number {
    return Number(unwrap(host.totalmem()));
  });

  const type = primitive(function type(): string {
    return unwrap(host.type());
  });

  const uptime = primitive(function uptime(): number {
    return unwrap(host.uptime());
  });

  function userInfo(options?: UserInfoOptionsWithStringEncoding): UserInfo<string>;
  function userInfo(options: UserInfoOptionsWithBufferEncoding): UserInfo<Buffer>;
  function userInfo(options: UserInfoOptions): UserInfo<string | Buffer>;
  function userInfo(options?: unknown): UserInfo<string | Buffer> {
    let encoding: string | undefined;
    if (typeof options === "object" && options !== null) {
      const candidate = (options as { encoding?: unknown }).encoding;
      encoding = typeof candidate === "string" ? candidate : undefined;
    }
    const value = unwrap(host.userInfo(encoding));
    return {
      username: userInfoValue(value.username),
      uid: Number(value.uid),
      gid: Number(value.gid),
      shell: value.shell ? userInfoValue(value.shell) : null,
      homedir: userInfoValue(value.homedir),
    };
  }

  const version = primitive(function version(): string {
    return unwrap(host.version());
  });

  const os: OsModule = {
    EOL: staticProperties.eol,
    arch,
    availableParallelism,
    constants,
    cpus,
    devNull: staticProperties.devNull,
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
  Object.defineProperties(os, {
    constants: { configurable: false, enumerable: true, writable: false, value: constants },
    EOL: { configurable: true, enumerable: true, writable: false, value: staticProperties.eol },
    devNull: {
      configurable: true,
      enumerable: true,
      writable: false,
      value: staticProperties.devNull,
    },
  });
  return os;
}

export type * from "./types.js";
