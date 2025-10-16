import { _setArgs, _setEnv } from "@bytecodealliance/preview2-shim/cli";
import { _setPreopens } from "@bytecodealliance/preview2-shim/filesystem";
import { mkdtemp } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const env = {
  FS_TIME_PRECISION: "2000",
  NO_DANGLING_FILESYSTEM: "1",
};

if (isWindows) {
  env.NO_RENAME_DIR_TO_EMPTY_DIR = "1";
  env.ERRNO_MODE_WINDOWS = "1";
}
else if (isMac) {
  env.ERRNO_MODE_MACOS = "1";
} else {
  env.ERRNO_MODE_UNIX = "1";
}

_setEnv(env);

_setArgs(['_', '/']);

export const testDir = await mkdtemp('./tests/output/');

_setPreopens({ '/': testDir });

process.on('exit', () => {
  try {
    rmSync(testDir, { recursive: true });
  } catch { }
});
