/**
 * Public value shapes follow @types/node 24 wasi.d.ts (MIT). The WIT provider types are Jco-owned
 * and carry no dependency on Node declarations; they must stay identical to the records
 * `jco:node/wasi@0.1.0` declares, since transpiled bindings produce exactly these object shapes.
 */
import type { HostErrorBase, HostImports, HostResult } from "../internal/wit-types.js";
import type { Preview1Syscall } from "./syscalls.js";

/** A WASI snapshot `node:wasi` knows how to bind. */
export type WasiVersion = "unstable" | "preview1";

/** The import namespace `getImportObject()` binds a snapshot under. */
export type WasiBindingName = "wasi_unstable" | "wasi_snapshot_preview1";

/** Options accepted by `new WASI(options)`. */
export interface WASIOptions {
  /** `'unstable'` or `'preview1'`; required, any other string is rejected. */
  version: string;
  args?: string[] | undefined;
  env?: object | undefined;
  preopens?: Readonly<Record<string, string | undefined>> | undefined;
  returnOnExit?: boolean | undefined;
  stdin?: number | undefined;
  stdout?: number | undefined;
  stderr?: number | undefined;
}

/** A WASI preview1 syscall as a module imports it: integer arguments, an errno result. */
export type WasiSyscall = (...args: Array<number | bigint>) => number;

/** The syscall table a WASI instance exposes as `wasiImport`. */
export type WasiImport = Record<Preview1Syscall, WasiSyscall>;

/** What `getImportObject()` returns: the syscall table under the snapshot's namespace. */
export type WasiImportObject = Partial<Record<WasiBindingName, WasiImport>>;

/** The shape `start()` and `initialize()` inspect on the instance they are given. */
export interface WasiInstance {
  exports: Record<PropertyKey, unknown>;
}

export interface FinalizeBindingsOptions {
  /** The memory to bind; defaults to `instance.exports.memory`. */
  memory?: unknown;
}

export interface WASI {
  readonly wasiImport: WasiImport;
  getImportObject(): WasiImportObject;
  start(instance: object): number;
  initialize(instance: object): void;
  finalizeBindings(instance: object, options?: FinalizeBindingsOptions): void;
}

export interface WASIConstructor {
  new (options: WASIOptions): WASI;
  prototype: WASI;
}

export interface WasiModule {
  WASI: WASIConstructor;
}

/** The serialized error record `jco:node/wasi@0.1.0` carries. */
export type WasiError = HostErrorBase;

export type WasiResult<T> = HostResult<T, WasiError>;

/** `new WASI(options)` after validation, as the WIT `options` record. */
export interface WasiHostOptions {
  version: WasiVersion;
  args: string[];
  /** Environment name/value pairs, as the shared `jco:node/types` `env-vars` type lowers. */
  env: [string, string][];
  preopens: [string, string][];
  stdin: number;
  stdout: number;
  stderr: number;
}

/** The `jco:node/wasi@0.1.0` contract, in the tagged-result form the WIT declares. */
export interface WasiHost {
  init(options: WasiHostOptions): WasiResult<void>;
}

/** A provider may return bare values and throw error records, as jco's bindings do. */
export type WasiProvider = HostImports<WasiHost>;
