import { _setArgs, _setEnv } from "@bytecodealliance/preview2-shim/cli";
import { _setPreopens } from "@bytecodealliance/preview2-shim/filesystem";
import { mkdtemp } from 'node:fs/promises';
import { rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

_setEnv({
  NO_ACCURATE_TIME: "1"
});

_setArgs(['_', '/']);

export const testDir = await mkdtemp(tmpdir());
// console.error(testDir);

_setPreopens({ '/': testDir });

process.on('exit', () => {
  rmdirSync(testDir, { recursive: true });
});
