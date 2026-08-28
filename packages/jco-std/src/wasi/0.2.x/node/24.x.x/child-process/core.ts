import { Buffer } from "node:buffer";

import type {
  ChildProcessHost,
  HostProcessError,
  HostSpawnOptions,
  HostSpawnOutput,
} from "./types.js";

type Encoding = BufferEncoding | "buffer" | null | undefined;
type StdioOption = "pipe" | "ignore" | "inherit";

export interface CommonOptions {
  cwd?: string | URL;
  env?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
  killSignal?: string | number;
  uid?: number;
  gid?: number;
  windowsHide?: boolean;
  windowsVerbatimArguments?: boolean;
  shell?: boolean | string;
  stdio?: StdioOption | readonly StdioOption[];
}

export interface SpawnSyncOptions extends CommonOptions {
  input?: string | ArrayBufferView;
  encoding?: Encoding;
  maxBuffer?: number;
}

export interface SpawnSyncReturns<T> {
  pid: number;
  output: [null, T | null, T | null];
  stdout: T | null;
  stderr: T | null;
  status: number | null;
  signal: string | null;
  error?: Error & Record<string, unknown>;
}

function unsupported(api: string): never {
  const error = new Error(`${api} is not supported by the Jco child_process adapter`);
  Object.assign(error, { code: "ERR_JCO_UNSUPPORTED_NODE_API" });
  throw error;
}

function requireString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(
      `The \"${name}\" argument must be of type string. Received ${String(value)}`,
    );
  }
  if (value.length === 0) {
    throw new TypeError(`The argument '${name}' cannot be empty. Received ''`);
  }
}

function normalizeArgs(
  command: string,
  argsOrOptions?: readonly string[] | SpawnSyncOptions,
  maybeOptions?: SpawnSyncOptions,
) {
  requireString(command, "file");
  let args: readonly string[] = [];
  let options: SpawnSyncOptions = {};
  if (Array.isArray(argsOrOptions)) {
    args = argsOrOptions;
    options = maybeOptions ?? {};
  } else if (argsOrOptions !== undefined) {
    if (argsOrOptions === null || typeof argsOrOptions !== "object") {
      throw new TypeError('The "options" argument must be of type object');
    }
    options = argsOrOptions as SpawnSyncOptions;
  }
  for (const arg of args) {
    requireString(arg, "args");
  }
  return { args: [...args], options };
}

function normalizeStdio(stdio: SpawnSyncOptions["stdio"]): string[] | undefined {
  if (stdio === undefined || stdio === "pipe") {
    return undefined;
  }
  if (typeof stdio === "string") {
    if (stdio !== "ignore" && stdio !== "inherit") {
      throw new TypeError(`Invalid stdio option: ${stdio}`);
    }
    return [stdio, stdio, stdio];
  }
  if (!Array.isArray(stdio) || stdio.length > 3) {
    unsupported("child_process stdio descriptors");
  }
  const values = [...stdio];
  for (const value of values) {
    if (value !== "pipe" && value !== "ignore" && value !== "inherit") {
      unsupported("child_process stdio descriptors");
    }
  }
  while (values.length < 3) {
    values.push("pipe");
  }
  return values;
}

function toBytes(input: SpawnSyncOptions["input"]): Uint8Array | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (typeof input === "string") {
    return Buffer.from(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError('The "options.input" property must be of type string or an ArrayBufferView');
}

function hostOptions(options: SpawnSyncOptions): HostSpawnOptions {
  const timeout = options.timeout ?? 0;
  const maxBuffer = options.maxBuffer ?? 1024 * 1024;
  if (!Number.isSafeInteger(timeout) || timeout < 0) {
    throw new RangeError('The value of "timeout" is out of range');
  }
  if (!Number.isSafeInteger(maxBuffer) || maxBuffer < 0) {
    throw new RangeError('The value of "maxBuffer" is out of range');
  }
  const cwd = options.cwd === undefined ? undefined : String(options.cwd);
  const env: [string, string][] | undefined = options.env
    ? Object.entries(options.env).flatMap(([key, value]): [string, string][] =>
        value === undefined ? [] : [[key, String(value)]],
      )
    : undefined;
  const killSignal = options.killSignal === undefined ? "SIGTERM" : String(options.killSignal);
  return {
    cwd,
    cwdIsUrl: options.cwd instanceof URL,
    env,
    input: toBytes(options.input),
    timeout: BigInt(timeout),
    killSignal,
    maxBuffer: BigInt(maxBuffer),
    shell:
      options.shell === true ? "" : typeof options.shell === "string" ? options.shell : undefined,
    stdio: normalizeStdio(options.stdio),
    windowsHide: options.windowsHide ?? false,
    windowsVerbatimArguments: options.windowsVerbatimArguments ?? false,
    uid: options.uid,
    gid: options.gid,
  };
}

function processError(value: HostProcessError, output?: HostSpawnOutput) {
  const error = new Error(value.message);
  error.name = value.name;
  Object.assign(
    error,
    value,
    output && {
      status: output.status ?? null,
      signal: output.signal ?? null,
      stdout: output.stdout ? Buffer.from(output.stdout) : null,
      stderr: output.stderr ? Buffer.from(output.stderr) : null,
      output: [
        null,
        output.stdout ? Buffer.from(output.stdout) : null,
        output.stderr ? Buffer.from(output.stderr) : null,
      ],
    },
  );
  return error;
}

function decode(data: Uint8Array | undefined, encoding: Encoding): Buffer | string | null {
  if (data === undefined) {
    return null;
  }
  const buffer = Buffer.from(data);
  return encoding === undefined || encoding === null || encoding === "buffer"
    ? buffer
    : buffer.toString(encoding);
}

function completionError(output: HostSpawnOutput, command: string) {
  if (output.error) {
    return processError(output.error, output);
  }
  if ((output.status ?? 0) === 0 && output.signal === undefined) {
    return undefined;
  }
  const error = new Error(
    `Command failed${output.status === undefined ? ` due to ${output.signal}` : ` with exit code ${output.status}`}: ${command}`,
  );
  return Object.assign(error, {
    code: output.status ?? null,
    killed: output.signal !== undefined,
    signal: output.signal ?? null,
    status: output.status ?? null,
    stdout: output.stdout ? Buffer.from(output.stdout) : null,
    stderr: output.stderr ? Buffer.from(output.stderr) : null,
  });
}

export function createChildProcess(host: ChildProcessHost) {
  function spawnSync(
    command: string,
    argsOrOptions?: readonly string[] | SpawnSyncOptions,
    maybeOptions?: SpawnSyncOptions,
  ): SpawnSyncReturns<Buffer | string> {
    const { args, options } = normalizeArgs(command, argsOrOptions, maybeOptions);
    const output = host.spawnSync(command, args, hostOptions(options));
    const encoding = options.encoding;
    const stdout = decode(output.stdout, encoding);
    const stderr = decode(output.stderr, encoding);
    const result: SpawnSyncReturns<Buffer | string> = {
      pid: output.pid ?? 0,
      output: [null, stdout, stderr],
      stdout,
      stderr,
      status: output.status ?? null,
      signal: output.signal ?? null,
    };
    if (output.error) {
      result.error = processError(output.error) as Error & Record<string, unknown>;
    }
    return result;
  }

  function execFileSync(
    file: string,
    argsOrOptions?: readonly string[] | SpawnSyncOptions,
    maybeOptions?: SpawnSyncOptions,
  ) {
    const { args, options } = normalizeArgs(file, argsOrOptions, maybeOptions);
    const output = host.spawnSync(file, args, hostOptions(options));
    const error = completionError(output, [file, ...args].join(" "));
    if (error) {
      throw error;
    }
    return decode(output.stdout, options.encoding) ?? (options.encoding ? "" : Buffer.alloc(0));
  }

  function execSync(command: string, options: SpawnSyncOptions = {}) {
    requireString(command, "command");
    return execFileSync(command, { ...options, shell: options.shell ?? true });
  }

  class ChildProcess {
    constructor() {
      unsupported("child_process.ChildProcess");
    }
  }

  function spawn(
    command: string,
    argsOrOptions?: readonly string[] | SpawnSyncOptions,
    maybeOptions?: SpawnSyncOptions,
  ) {
    void command;
    void argsOrOptions;
    void maybeOptions;
    // A synchronous WIT call cannot preserve Node's asynchronous event and
    // interactive stdio semantics. Do not return a misleading completed child.
    unsupported("child_process.spawn and asynchronous process lifecycle events");
  }

  type Callback = (error: Error | null, stdout: Buffer | string, stderr: Buffer | string) => void;

  function execFile(
    file: string,
    argsOrOptions?: readonly string[] | SpawnSyncOptions | Callback,
    optionsOrCallback?: SpawnSyncOptions | Callback,
    maybeCallback?: Callback,
  ) {
    void file;
    void argsOrOptions;
    void optionsOrCallback;
    void maybeCallback;
    unsupported("child_process.execFile callbacks");
  }

  function exec(
    command: string,
    optionsOrCallback?: SpawnSyncOptions | Callback,
    maybeCallback?: Callback,
  ) {
    void command;
    void optionsOrCallback;
    void maybeCallback;
    unsupported("child_process.exec callbacks");
  }

  function fork(): never {
    return unsupported("child_process.fork and IPC");
  }

  return { ChildProcess, exec, execFile, execFileSync, execSync, fork, spawn, spawnSync };
}
