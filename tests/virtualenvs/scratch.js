import { _setArgs } from "@bytecodealliance/preview2-shim/cli";
import { _setPreopens } from "@bytecodealliance/preview2-shim/filesystem";
import { mkdtemp } from 'node:fs/promises';
import { rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

_setArgs(['_', '/']);

export const testDir = await mkdtemp(tmpdir());
// console.error(testDir);

_setPreopens({ '/': testDir });

process.on('exit', () => {
  rmdirSync(testDir, { recursive: true });
});
