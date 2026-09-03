import type { Buffer } from "node:buffer";

import type { HostErrno, HostErrorBase, HostResult } from "../internal/wit-types.js";

export type Architecture =
  | "arm"
  | "arm64"
  | "ia32"
  | "loong64"
  | "mips"
  | "mipsel"
  | "ppc64"
  | "riscv64"
  | "s390x"
  | "x64";

export type Platform =
  | "aix"
  | "android"
  | "cygwin"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "netbsd"
  | "openbsd"
  | "sunos"
  | "win32";

export type OsEncoding =
  | "ascii"
  | "base64"
  | "base64url"
  | "binary"
  | "hex"
  | "latin1"
  | "ucs-2"
  | "ucs2"
  | "utf-8"
  | "utf16le"
  | "utf8"
  | "utf-16le";

export interface CpuInfo {
  model: string;
  speed: number;
  times: {
    user: number;
    nice: number;
    sys: number;
    idle: number;
    irq: number;
  };
}

export interface NetworkInterfaceBase {
  address: string;
  netmask: string;
  mac: string;
  internal: boolean;
  cidr: string | null;
  scopeid?: number;
}

export interface NetworkInterfaceInfoIPv4 extends NetworkInterfaceBase {
  family: "IPv4";
}

export interface NetworkInterfaceInfoIPv6 extends NetworkInterfaceBase {
  family: "IPv6";
  scopeid: number;
}

export type NetworkInterfaceInfo = NetworkInterfaceInfoIPv4 | NetworkInterfaceInfoIPv6;
export type NetworkInterfaces = Record<string, NetworkInterfaceInfo[] | undefined>;

export interface UserInfo<T> {
  username: T;
  uid: number;
  gid: number;
  shell: T | null;
  homedir: T;
}

export interface UserInfoOptions {
  encoding?: OsEncoding | "buffer";
}

export interface UserInfoOptionsWithBufferEncoding extends UserInfoOptions {
  encoding: "buffer";
}

export interface UserInfoOptionsWithStringEncoding extends UserInfoOptions {
  encoding?: OsEncoding;
}

export interface OsConstants {
  UV_UDP_REUSEADDR: number;
  dlopen: Record<string, number>;
  errno: Record<string, number>;
  signals: Record<string, number>;
  priority: {
    PRIORITY_LOW: number;
    PRIORITY_BELOW_NORMAL: number;
    PRIORITY_NORMAL: number;
    PRIORITY_ABOVE_NORMAL: number;
    PRIORITY_HIGH: number;
    PRIORITY_HIGHEST: number;
    [name: string]: number;
  };
}

export interface OsModule {
  readonly EOL: string;
  readonly devNull: string;
  readonly constants: OsConstants;
  arch(): Architecture;
  availableParallelism(): number;
  cpus(): CpuInfo[];
  endianness(): "BE" | "LE";
  freemem(): number;
  getPriority(pid?: number): number;
  homedir(): string;
  hostname(): string;
  loadavg(): number[];
  machine(): string;
  networkInterfaces(): NetworkInterfaces;
  platform(): Platform;
  release(): string;
  setPriority(priority: number): void;
  setPriority(pid: number, priority: number): void;
  tmpdir(): string;
  totalmem(): number;
  type(): string;
  uptime(): number;
  userInfo(options?: UserInfoOptionsWithStringEncoding): UserInfo<string>;
  userInfo(options: UserInfoOptionsWithBufferEncoding): UserInfo<Buffer>;
  userInfo(options: UserInfoOptions): UserInfo<string | Buffer>;
  version(): string;
}

export type OsErrno = HostErrno;

export interface OsErrorInfo {
  errno?: OsErrno;
  code?: string;
  message?: string;
  syscall?: string;
}

export interface OsError extends HostErrorBase {
  info?: OsErrorInfo;
}

export type OsResult<T> = HostResult<T, OsError>;

export interface OsConstantEntry {
  name: string;
  value: bigint;
}

export interface OsHostConstants {
  uvUdpReuseaddr: number;
  dlopen: OsConstantEntry[];
  errno: OsConstantEntry[];
  signals: OsConstantEntry[];
  priority: OsConstantEntry[];
}

export interface OsStaticProperties {
  eol: string;
  devNull: string;
  constants: OsHostConstants;
}

export interface OsHostCpuInfo {
  model: string;
  speed: number;
  times: {
    user: bigint;
    nice: bigint;
    sys: bigint;
    idle: bigint;
    irq: bigint;
  };
}

export interface OsHostLoadAverage {
  one: number;
  five: number;
  fifteen: number;
}

export interface OsHostNetworkInterface {
  name: string;
  address: string;
  netmask: string;
  family: "ipv4" | "ipv6";
  mac: string;
  internal: boolean;
  scopeid?: number;
  cidr?: string;
}

export type OsHostUserInfoValue = { tag: "text"; val: string } | { tag: "bytes"; val: Uint8Array };

export interface OsHostUserInfo {
  username: OsHostUserInfoValue;
  uid: bigint;
  gid: bigint;
  shell?: OsHostUserInfoValue;
  homedir: OsHostUserInfoValue;
}

export interface OsHost {
  getStaticProperties(): OsResult<OsStaticProperties>;
  arch(): OsResult<Architecture>;
  availableParallelism(): OsResult<number>;
  cpus(): OsResult<OsHostCpuInfo[]>;
  endianness(): OsResult<"be" | "le">;
  freemem(): OsResult<bigint>;
  getPriority(pid: number): OsResult<number>;
  homedir(): OsResult<string>;
  hostname(): OsResult<string>;
  loadavg(): OsResult<OsHostLoadAverage>;
  machine(): OsResult<string>;
  networkInterfaces(): OsResult<OsHostNetworkInterface[]>;
  platform(): OsResult<Platform>;
  release(): OsResult<string>;
  setPriority(pid: number, priority: number): OsResult<void>;
  tmpdir(): OsResult<string>;
  totalmem(): OsResult<bigint>;
  type(): OsResult<string>;
  uptime(): OsResult<number>;
  userInfo(encoding?: string): OsResult<OsHostUserInfo>;
  version(): OsResult<string>;
}
