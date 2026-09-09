/** Public value shapes follow @types/node 24.13.3 process.d.ts (MIT).
 * The WIT provider types are Jco-owned and carry no dependency on Node declarations.
 */
import type { HostErrorBase, HostResult } from "../internal/wit-types.js";
export interface ProcessError extends HostErrorBase {
  path?: string;
}
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface ClockTime {
  seconds: number;
  nanoseconds: number;
}
export interface CpuUsage {
  user: number;
  system: number;
}
export interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}
export interface ResourceUsage {
  userCPUTime: number;
  systemCPUTime: number;
  maxRSS: number;
  sharedMemorySize: number;
  unsharedDataSize: number;
  unsharedStackSize: number;
  minorPageFault: number;
  majorPageFault: number;
  swappedOut: number;
  fsRead: number;
  fsWrite: number;
  ipcSent: number;
  ipcReceived: number;
  signalsCount: number;
  voluntaryContextSwitches: number;
  involuntaryContextSwitches: number;
}
// WIT's kebab-case acronym lowering uses Cpu/ Rss rather than Node's CPU/ RSS.
export interface HostResourceUsage extends Omit<
  ResourceUsage,
  "userCPUTime" | "systemCPUTime" | "maxRSS"
> {
  userCpuTime: number;
  systemCpuTime: number;
  maxRss: number;
}
export interface Metadata {
  arch: string;
  platform: string;
  pid: number;
  ppid: number;
  argv: string[];
  argv0: string;
  execArgv: string[];
  execPath: string;
  version: string;
  versions: [string, string][];
  releaseJson: string;
  configJson: string;
  featuresJson: string;
  hasPermission: boolean;
}
export type ProcessFlag =
  | "no-deprecation"
  | "throw-deprecation"
  | "trace-deprecation"
  | "trace-process-warnings";
export type ExitCode = { tag: "number"; val: number } | { tag: "text"; val: string };
export interface ProcessState {
  title: string;
  debugPort: number;
  exitCode?: ExitCode;
  noDeprecation?: boolean;
  throwDeprecation?: boolean;
  traceDeprecation?: boolean;
  traceProcessWarnings?: boolean;
  sourceMapsEnabled: boolean;
  connected?: boolean;
}
export type Identity = "uid" | "euid" | "gid" | "egid";
export type Id = { tag: "number"; val: number } | { tag: "name"; val: string };
export type Signal = Id;
export type Mask = ExitCode;
export type ProcessPath = { tag: "text" | "url"; val: string } | { tag: "bytes"; val: Uint8Array };
export interface Warning {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  detail?: string;
}
export interface WarningOptions {
  type?: string;
  code?: string;
  detail?: string;
  ctor?: (...args: never[]) => unknown;
}
export interface ReportOptions {
  compact: boolean;
  directory: string;
  filename: string;
  signal: string;
  reportOnFatalError: boolean;
  reportOnSignal: boolean;
  reportOnUncaughtException: boolean;
  excludeEnv: boolean;
  excludeNetwork: boolean;
}
export type ReportOption =
  | "compact"
  | "directory"
  | "filename"
  | "signal"
  | "report-on-fatal-error"
  | "report-on-signal"
  | "report-on-uncaught-exception"
  | "exclude-env"
  | "exclude-network";
export type ReportValue = { tag: "boolean"; val: boolean } | { tag: "text"; val: string };
export interface ProcessHost {
  metadata(): Metadata | HostResult<Metadata, ProcessError>;
  getState(): ProcessState | HostResult<ProcessState, ProcessError>;
  setTitle(value: string): void | HostResult<void, ProcessError>;
  setDebugPort(value: number): void | HostResult<void, ProcessError>;
  setExitCode(value: ExitCode | undefined): void | HostResult<void, ProcessError>;
  setFlag(name: ProcessFlag, value: boolean): void | HostResult<void, ProcessError>;
  envEntries(): [string, string][] | HostResult<[string, string][], ProcessError>;
  envGet(name: string): string | undefined | HostResult<string | undefined, ProcessError>;
  envSet(name: string, value: string | undefined): void | HostResult<void, ProcessError>;
  cwd(): string | HostResult<string, ProcessError>;
  chdir(directory: string): void | HostResult<void, ProcessError>;
  cpuUsage(previous: CpuUsage | undefined): CpuUsage | HostResult<CpuUsage, ProcessError>;
  threadCpuUsage(previous: CpuUsage | undefined): CpuUsage | HostResult<CpuUsage, ProcessError>;
  memoryUsage(): MemoryUsage | HostResult<MemoryUsage, ProcessError>;
  rss(): number | HostResult<number, ProcessError>;
  resourceUsage(): HostResourceUsage | HostResult<HostResourceUsage, ProcessError>;
  hrtime(): ClockTime | HostResult<ClockTime, ProcessError>;
  uptime(): number | HostResult<number, ProcessError>;
  availableMemory(): number | HostResult<number, ProcessError>;
  constrainedMemory(): number | HostResult<number, ProcessError>;
  getActiveResourcesInfo(): string[] | HostResult<string[], ProcessError>;
  getId(kind: Identity): number | HostResult<number, ProcessError>;
  setId(kind: Identity, value: Id): void | HostResult<void, ProcessError>;
  getgroups(): number[] | Uint32Array | HostResult<number[] | Uint32Array, ProcessError>;
  setgroups(groups: Id[]): void | HostResult<void, ProcessError>;
  initgroups(user: Id, extraGroup: Id): void | HostResult<void, ProcessError>;
  kill(pid: number, signal: Signal): boolean | HostResult<boolean, ProcessError>;
  umask(mask: Mask): number | HostResult<number, ProcessError>;
  exit(code: ExitCode | undefined): void | HostResult<void, ProcessError>;
  abort(): void | HostResult<void, ProcessError>;
  execve(
    file: string,
    args: string[],
    env: [string, string][] | undefined,
  ): void | HostResult<void, ProcessError>;
  loadEnvFile(path: ProcessPath | undefined): void | HostResult<void, ProcessError>;
  setSourceMapsEnabled(value: boolean): void | HostResult<void, ProcessError>;
  emitWarning(warning: Warning): void | HostResult<void, ProcessError>;
  permissionHas(
    scope: string,
    reference: ProcessPath | undefined,
  ): boolean | HostResult<boolean, ProcessError>;
  getReport(error: Warning | undefined): string | HostResult<string, ProcessError>;
  writeReport(
    filename: string | undefined,
    error: Warning | undefined,
  ): string | HostResult<string, ProcessError>;
  getReportOptions(): ReportOptions | HostResult<ReportOptions, ProcessError>;
  setReportOption(name: ReportOption, value: ReportValue): void | HostResult<void, ProcessError>;
  allowedFlags(): string[] | HostResult<string[], ProcessError>;
  allowedFlag(value: string): boolean | HostResult<boolean, ProcessError>;
}

export type ProcessListener = (...args: never[]) => void;
export interface ProcessEmitter {
  on(event: string | symbol, listener: ProcessListener): this;
  addListener(event: string | symbol, listener: ProcessListener): this;
  once(event: string | symbol, listener: ProcessListener): this;
  prependListener(event: string | symbol, listener: ProcessListener): this;
  prependOnceListener(event: string | symbol, listener: ProcessListener): this;
  off(event: string | symbol, listener: ProcessListener): this;
  removeListener(event: string | symbol, listener: ProcessListener): this;
  removeAllListeners(event?: string | symbol): this;
  emit(event: string | symbol, ...args: unknown[]): boolean;
  listeners(event: string | symbol): ProcessListener[];
  rawListeners(event: string | symbol): ProcessListener[];
  listenerCount(event: string | symbol, listener?: ProcessListener): number;
  eventNames(): (string | symbol)[];
  setMaxListeners(n: number): this;
  getMaxListeners(): number;
}
export interface Hrtime {
  (time?: [number, number]): [number, number];
  bigint(): bigint;
}
export interface MemoryUsageFunction {
  (): MemoryUsage;
  rss(): number;
}
export interface ProcessReport extends ReportOptions {
  getReport(error?: Error): { [key: string]: Json };
  writeReport(filename?: string, error?: Error): string;
  writeReport(error: Error): string;
}
export interface ProcessFeatures {
  cached_builtins: boolean;
  debug: boolean;
  inspector: boolean;
  require_module: boolean;
  tls: boolean;
  typescript: string | false;
  readonly ipv6: never;
  readonly uv: never;
  readonly tls_alpn: never;
  readonly tls_ocsp: never;
  readonly tls_sni: never;
}
export interface ProcessModule extends ProcessEmitter {
  readonly arch: string;
  readonly platform: string;
  readonly pid: number;
  readonly ppid: number;
  argv: string[];
  readonly argv0: string;
  execArgv: string[];
  execPath: string;
  readonly version: string;
  readonly versions: Record<string, string>;
  readonly release: {
    name: string;
    sourceUrl?: string;
    headersUrl?: string;
    libUrl?: string;
    lts?: string;
  };
  readonly config: { target_defaults: Record<string, Json>; variables: Record<string, Json> };
  readonly features: ProcessFeatures;
  env: Record<string, string | undefined>;
  title: string;
  debugPort: number;
  exitCode: string | number | undefined;
  noDeprecation: boolean | undefined;
  throwDeprecation: boolean | undefined;
  traceDeprecation: boolean | undefined;
  traceProcessWarnings: boolean | undefined;
  readonly sourceMapsEnabled: boolean;
  readonly connected: boolean | undefined;
  readonly allowedNodeEnvironmentFlags: ReadonlySet<string>;
  readonly report: ProcessReport;
  readonly permission:
    | { has(scope: string, reference?: string | URL | Uint8Array): boolean }
    | undefined;
  readonly finalization: {
    register(ref: object, callback: (ref: object, event: string) => void): never;
    registerBeforeExit(ref: object, callback: (ref: object, event: string) => void): never;
    unregister(ref: object): never;
  };
  readonly stdin: never;
  readonly stdout: never;
  readonly stderr: never;
  readonly channel: never;
  readonly mainModule: never;
  readonly domain: never;
  cwd(): string;
  chdir(directory: string): void;
  cpuUsage(previous?: CpuUsage): CpuUsage;
  threadCpuUsage(previous?: CpuUsage): CpuUsage;
  memoryUsage: MemoryUsageFunction;
  resourceUsage(): ResourceUsage;
  hrtime: Hrtime;
  uptime(): number;
  availableMemory(): number;
  constrainedMemory(): number;
  getActiveResourcesInfo(): string[];
  getuid(): number;
  geteuid(): number;
  getgid(): number;
  getegid(): number;
  setuid(id: number | string): void;
  seteuid(id: number | string): void;
  setgid(id: number | string): void;
  setegid(id: number | string): void;
  getgroups(): number[];
  setgroups(groups: (number | string)[]): void;
  initgroups(user: number | string, extraGroup: number | string): void;
  kill(pid: number, signal?: number | string): true;
  umask(): never;
  umask(mask: number | string): number;
  exit(code?: number | string): never;
  abort(): never;
  execve(file: string, args?: string[], env?: Record<string, string>): never;
  loadEnvFile(path?: string | URL | Uint8Array): void;
  setSourceMapsEnabled(value: boolean): void;
  nextTick<A extends unknown[]>(callback: (...args: A) => void, ...args: A): void;
  ref(value: unknown): void;
  unref(value: unknown): void;
  emitWarning(warning: string | Error, options?: WarningOptions): void;
  emitWarning(
    warning: string | Error,
    type?: string,
    code?: string,
    ctor?: (...args: never[]) => unknown,
  ): void;
  getBuiltinModule(id: string): never;
  dlopen(module: object, filename: string, flags?: number): never;
  setUncaughtExceptionCaptureCallback(callback: ((error: Error) => void) | null): never;
  hasUncaughtExceptionCaptureCallback(): never;
  disconnect(): never;
  send(...args: unknown[]): never;
  openStdin(): never;
  binding(...args: unknown[]): never;
  assert(...args: unknown[]): never;
}

export type HostCall = <T>(fn: () => T | HostResult<T, ProcessError>) => T;
