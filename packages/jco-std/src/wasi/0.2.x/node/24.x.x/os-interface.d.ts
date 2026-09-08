import type {
  Architecture,
  OsHostCpuInfo,
  OsHostLoadAverage,
  OsHostNetworkInterface,
  OsHostUserInfo,
  OsStaticProperties,
  Platform,
} from "./os/types.js";

export function getStaticProperties(): OsStaticProperties;
export function arch(): Architecture;
export function availableParallelism(): number;
export function cpus(): OsHostCpuInfo[];
export function endianness(): "be" | "le";
export function freemem(): bigint;
export function getPriority(pid: number): number;
export function homedir(): string;
export function hostname(): string;
export function loadavg(): OsHostLoadAverage;
export function machine(): string;
export function networkInterfaces(): OsHostNetworkInterface[];
export function platform(): Platform;
export function release(): string;
export function setPriority(pid: number, priority: number): void;
export function tmpdir(): string;
export function totalmem(): bigint;
export function type(): string;
export function uptime(): number;
export function userInfo(encoding?: string): OsHostUserInfo;
export function version(): string;
