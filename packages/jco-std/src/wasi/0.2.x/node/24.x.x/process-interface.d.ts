import type {
  ClockTime,
  Metadata,
  ProcessState,
  ProcessFlag,
  ExitCode,
  CpuUsage,
  MemoryUsage,
  HostResourceUsage,
  Identity,
  Id,
  Signal,
  Mask,
  ProcessPath,
  Warning,
  ReportOptions,
  ReportOption,
  ReportValue,
} from "./process/types.js";
export function metadata(): Metadata;
export function getState(): ProcessState;
export function setTitle(value: string): void;
export function setDebugPort(value: number): void;
export function setExitCode(value: ExitCode | undefined): void;
export function setFlag(name: ProcessFlag, value: boolean): void;
export function envEntries(): [string, string][];
export function envGet(name: string): string | undefined;
export function envSet(name: string, value: string | undefined): void;
export function cwd(): string;
export function chdir(directory: string): void;
export function cpuUsage(previous: CpuUsage | undefined): CpuUsage;
export function threadCpuUsage(previous: CpuUsage | undefined): CpuUsage;
export function memoryUsage(): MemoryUsage;
export function rss(): number;
export function resourceUsage(): HostResourceUsage;
export function hrtime(): ClockTime;
export function uptime(): number;
export function availableMemory(): number;
export function constrainedMemory(): number;
export function getActiveResourcesInfo(): string[];
export function getId(kind: Identity): number;
export function setId(kind: Identity, value: Id): void;
export function getgroups(): Uint32Array;
export function setgroups(groups: Id[]): void;
export function initgroups(user: Id, extraGroup: Id): void;
export function kill(pid: number, signal: Signal): boolean;
export function umask(mask: Mask): number;
export function exit(code: ExitCode | undefined): void;
export function abort(): void;
export function execve(file: string, args: string[], env: [string, string][] | undefined): void;
export function loadEnvFile(path: ProcessPath | undefined): void;
export function setSourceMapsEnabled(value: boolean): void;
export function emitWarning(warning: Warning): void;
export function permissionHas(scope: string, reference: ProcessPath | undefined): boolean;
export function getReport(error: Warning | undefined): string;
export function writeReport(filename: string | undefined, error: Warning | undefined): string;
export function getReportOptions(): ReportOptions;
export function setReportOption(name: ReportOption, value: ReportValue): void;
export function allowedFlags(): string[];
export function allowedFlag(value: string): boolean;
