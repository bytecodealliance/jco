import type {
  Architecture,
  OsHostCpuInfo,
  OsHostLoadAverage,
  OsHostNetworkInterface,
  OsHostUserInfo,
  OsResult,
  OsStaticProperties,
  Platform,
} from "./os/types.js";

export function getStaticProperties(): OsResult<OsStaticProperties>;
export function arch(): OsResult<Architecture>;
export function availableParallelism(): OsResult<number>;
export function cpus(): OsResult<OsHostCpuInfo[]>;
export function endianness(): OsResult<"be" | "le">;
export function freemem(): OsResult<bigint>;
export function getPriority(pid: number): OsResult<number>;
export function homedir(): OsResult<string>;
export function hostname(): OsResult<string>;
export function loadavg(): OsResult<OsHostLoadAverage>;
export function machine(): OsResult<string>;
export function networkInterfaces(): OsResult<OsHostNetworkInterface[]>;
export function platform(): OsResult<Platform>;
export function release(): OsResult<string>;
export function setPriority(pid: number, priority: number): OsResult<void>;
export function tmpdir(): OsResult<string>;
export function totalmem(): OsResult<bigint>;
export function type(): OsResult<string>;
export function uptime(): OsResult<number>;
export function userInfo(encoding?: string): OsResult<OsHostUserInfo>;
export function version(): OsResult<string>;
