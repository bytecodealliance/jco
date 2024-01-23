import { _setEnv } from "@bytecodealliance/preview2-shim/cli";
import { _setPreopens } from "@bytecodealliance/preview2-shim/filesystem";
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { rmdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const testDir = await mkdtemp('./tests/output/base');

_setPreopens({ "/": testDir });

await mkdir(resolve(testDir, "sub"));

await Promise.all([
  writeFile(resolve(testDir, 'bar.txt'), `And stood awhile in thought`),
  writeFile(resolve(testDir, 'foo.txt'), `foo`),
  writeFile(resolve(testDir, 'baz.txt'), `baz`),
  writeFile(resolve(testDir, 'sub/wow.txt'), `wow`),
  writeFile(resolve(testDir, 'sub/yay.txt'), `yay`),
]);

_setEnv({
  callooh: "callay",
  frabjous: "day",
});

process.on('exit', () => {
  rmdirSync(testDir, { recursive: true });
});
