import { _setArgs, _setEnv } from "@bytecodealliance/preview2-shim/cli";
import { _setPreopens } from "@bytecodealliance/preview2-shim/filesystem";
import { mkdtemp } from 'node:fs/promises';
import { rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { platform } from 'node:process';

const isWindows = platform === 'win32';

_setEnv({
  FS_TIME_PRECISION: "2000",
  NO_DANGLING_FILESYSTEM: "1",
  NO_RENAME_DIR_TO_EMPTY_DIR: isWindows ? "1" : "0"
});

_setArgs(['_', '/']);

export const testDir = await mkdtemp(tmpdir());

_setPreopens({ '/': testDir });

process.on('exit', () => {
  try {
    rmdirSync(testDir, { recursive: true });
  } catch {}
});
