export interface HostProcessError {
  name: string;
  message: string;
  code?: string;
  errno?: number;
  syscall?: string;
  path?: string;
  spawnargs: string[];
}

export interface HostSpawnOptions {
  cwd?: string;
  cwdIsUrl: boolean;
  env?: [string, string][];
  input?: Uint8Array;
  timeout: bigint;
  killSignal: string;
  maxBuffer: bigint;
  shell?: string;
  stdio?: string[];
  windowsHide: boolean;
  windowsVerbatimArguments: boolean;
  uid?: number;
  gid?: number;
}

export interface HostSpawnOutput {
  pid?: number;
  status?: number;
  signal?: string;
  stdout?: Uint8Array;
  stderr?: Uint8Array;
  error?: HostProcessError;
}

export interface ChildProcessHost {
  spawnSync(command: string, args: string[], options: HostSpawnOptions): HostSpawnOutput;
}
