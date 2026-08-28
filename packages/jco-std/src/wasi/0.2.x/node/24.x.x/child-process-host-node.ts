import { spawnSync as nodeSpawnSync, type StdioOptions } from "node:child_process";

import type {
  ChildProcessHost,
  HostProcessError,
  HostSpawnOptions,
} from "./child-process/types.js";

function serializeError(error: NodeJS.ErrnoException): HostProcessError {
  const spawnargs = (error as NodeJS.ErrnoException & { spawnargs?: string[] }).spawnargs;
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    errno: typeof error.errno === "number" ? error.errno : undefined,
    syscall: error.syscall,
    path: error.path,
    spawnargs: Array.isArray(spawnargs) ? spawnargs : [],
  };
}

/** Opt-in host adapter that delegates the capability to Node's real child_process module. */
export const spawnSync: ChildProcessHost["spawnSync"] = (
  command,
  args,
  options: HostSpawnOptions,
) => {
  const numericKillSignal = /^\d+$/.test(options.killSignal)
    ? Number(options.killSignal)
    : undefined;
  const result = nodeSpawnSync(command, args, {
    cwd: options.cwdIsUrl && options.cwd ? new URL(options.cwd) : options.cwd,
    env: options.env ? Object.fromEntries(options.env) : undefined,
    input: options.input,
    timeout: Number(options.timeout),
    killSignal: numericKillSignal ?? (options.killSignal as NodeJS.Signals),
    maxBuffer: Number(options.maxBuffer),
    shell: options.shell === "" ? true : options.shell,
    stdio: options.stdio as StdioOptions | undefined,
    windowsHide: options.windowsHide,
    windowsVerbatimArguments: options.windowsVerbatimArguments,
    uid: options.uid,
    gid: options.gid,
    encoding: "buffer",
  });
  return {
    pid: result.pid,
    status: result.status ?? undefined,
    signal: result.signal ?? undefined,
    stdout: result.stdout ?? undefined,
    stderr: result.stderr ?? undefined,
    error: result.error ? serializeError(result.error) : undefined,
  };
};

export default { spawnSync };
