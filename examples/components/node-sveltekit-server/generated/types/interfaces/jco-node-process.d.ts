/** @module Interface jco:node/process@0.1.0 **/
export function metadata(): ProcessMetadata;
export function getState(): State;
export function setTitle(value: string): void;
export function setDebugPort(value: number): void;
export function setExitCode(value: ExitCode | undefined): void;
export function setFlag(name: Flag, value: boolean): void;
export function envEntries(): Array<[string, string]>;
export function envGet(name: string): string | undefined;
export function envSet(name: string, value: string | undefined): void;
export function cwd(): string;
export function chdir(directory: string): void;
export function cpuUsage(previous: CpuUsageRecord | undefined): CpuUsageRecord;
export function threadCpuUsage(previous: CpuUsageRecord | undefined): CpuUsageRecord;
export function memoryUsage(): MemoryUsageRecord;
export function rss(): number;
export function resourceUsage(): ResourceUsageRecord;
export function hrtime(): ClockTime;
export function uptime(): number;
export function availableMemory(): number;
export function constrainedMemory(): number;
export function getActiveResourcesInfo(): Array<string>;
export function getId(kind: Identity): number;
export function setId(kind: Identity, value: Id): void;
export function getgroups(): Uint32Array;
export function setgroups(groups: Array<Id>): void;
export function initgroups(user: Id, extraGroup: Id): void;
export function kill(pid: number, signal: Signal): boolean;
export function umask(mask: Mask): number;
export function exit(code: ExitCode | undefined): void;
export function abort(): void;
export function execve(file: string, args: Array<string>, env: Array<[string, string]> | undefined): void;
export function loadEnvFile(path: Path | undefined): void;
export function setSourceMapsEnabled(value: boolean): void;
export function emitWarning(warning: Warning): void;
export function permissionHas(scope: string, reference: Path | undefined): boolean;
export function getReport(error: Warning | undefined): string;
export function writeReport(filename: string | undefined, error: Warning | undefined): string;
export function getReportOptions(): ReportOptions;
export function setReportOption(name: ReportOption, value: ReportValue): void;
export function allowedFlags(): Array<string>;
export function allowedFlag(value: string): boolean;
export type Errno = ErrnoNumber | ErrnoSymbolic;
export interface ErrnoNumber {
  tag: 'number',
  val: bigint,
}
export interface ErrnoSymbolic {
  tag: 'symbolic',
  val: string,
}
export interface Error {
  name: string,
  message: string,
  code?: string,
  errno?: Errno,
  syscall?: string,
  path?: string,
}
export interface ProcessMetadata {
  arch: string,
  platform: string,
  pid: number,
  ppid: number,
  argv: Array<string>,
  argv0: string,
  execArgv: Array<string>,
  execPath: string,
  version: string,
  versions: Array<[string, string]>,
  releaseJson: string,
  configJson: string,
  featuresJson: string,
  hasPermission: boolean,
}
/**
 * # Variants
 * 
 * ## `"no-deprecation"`
 * 
 * ## `"throw-deprecation"`
 * 
 * ## `"trace-deprecation"`
 * 
 * ## `"trace-process-warnings"`
 */
export type Flag = 'no-deprecation' | 'throw-deprecation' | 'trace-deprecation' | 'trace-process-warnings';
export type ExitCode = ExitCodeNumber | ExitCodeText;
export interface ExitCodeNumber {
  tag: 'number',
  val: number,
}
export interface ExitCodeText {
  tag: 'text',
  val: string,
}
export interface State {
  title: string,
  debugPort: number,
  exitCode?: ExitCode,
  noDeprecation?: boolean,
  throwDeprecation?: boolean,
  traceDeprecation?: boolean,
  traceProcessWarnings?: boolean,
  sourceMapsEnabled: boolean,
  connected?: boolean,
}
/**
 * # Variants
 * 
 * ## `"uid"`
 * 
 * ## `"euid"`
 * 
 * ## `"gid"`
 * 
 * ## `"egid"`
 */
export type Identity = 'uid' | 'euid' | 'gid' | 'egid';
export type Id = IdNumber | IdName;
export interface IdNumber {
  tag: 'number',
  val: number,
}
export interface IdName {
  tag: 'name',
  val: string,
}
export type Signal = SignalNumber | SignalName;
export interface SignalNumber {
  tag: 'number',
  val: number,
}
export interface SignalName {
  tag: 'name',
  val: string,
}
export type Mask = MaskNumber | MaskText;
export interface MaskNumber {
  tag: 'number',
  val: number,
}
export interface MaskText {
  tag: 'text',
  val: string,
}
export type Path = PathText | PathUrl | PathBytes;
export interface PathText {
  tag: 'text',
  val: string,
}
export interface PathUrl {
  tag: 'url',
  val: string,
}
export interface PathBytes {
  tag: 'bytes',
  val: Uint8Array,
}
export interface Warning {
  name: string,
  message: string,
  stack?: string,
  code?: string,
  detail?: string,
}
export interface ReportOptions {
  compact: boolean,
  directory: string,
  filename: string,
  signal: string,
  reportOnFatalError: boolean,
  reportOnSignal: boolean,
  reportOnUncaughtException: boolean,
  excludeEnv: boolean,
  excludeNetwork: boolean,
}
/**
 * # Variants
 * 
 * ## `"compact"`
 * 
 * ## `"directory"`
 * 
 * ## `"filename"`
 * 
 * ## `"signal"`
 * 
 * ## `"report-on-fatal-error"`
 * 
 * ## `"report-on-signal"`
 * 
 * ## `"report-on-uncaught-exception"`
 * 
 * ## `"exclude-env"`
 * 
 * ## `"exclude-network"`
 */
export type ReportOption = 'compact' | 'directory' | 'filename' | 'signal' | 'report-on-fatal-error' | 'report-on-signal' | 'report-on-uncaught-exception' | 'exclude-env' | 'exclude-network';
export type ReportValue = ReportValueBoolean | ReportValueText;
export interface ReportValueBoolean {
  tag: 'boolean',
  val: boolean,
}
export interface ReportValueText {
  tag: 'text',
  val: string,
}
export interface CpuUsageRecord {
  user: number,
  system: number,
}
export interface MemoryUsageRecord {
  rss: number,
  heapTotal: number,
  heapUsed: number,
  external: number,
  arrayBuffers: number,
}
export interface ResourceUsageRecord {
  userCpuTime: number,
  systemCpuTime: number,
  maxRss: number,
  sharedMemorySize: number,
  unsharedDataSize: number,
  unsharedStackSize: number,
  minorPageFault: number,
  majorPageFault: number,
  swappedOut: number,
  fsRead: number,
  fsWrite: number,
  ipcSent: number,
  ipcReceived: number,
  signalsCount: number,
  voluntaryContextSwitches: number,
  involuntaryContextSwitches: number,
}
/**
 * Split the clock to avoid engines that lift WIT u64 as an imprecise JS number.
 */
export interface ClockTime {
  seconds: number,
  nanoseconds: number,
}
