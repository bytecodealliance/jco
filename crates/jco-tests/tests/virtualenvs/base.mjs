import { _setEnv } from "@bytecodealliance/preview2-shim/cli";
import { _setPreopens } from "@bytecodealliance/preview2-shim/filesystem";
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { platform } from 'node:process';
import process from 'node:process';

await mkdir("tests/output", { recursive: true });

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

const env = {};

if (platform === 'darwin') {
  env['ERRNO_MODE_MACOS'] = "1";
} else if (platform === 'win32') {
  env['ERRNO_MODE_WINDOWS'] = "1";
} else {
  env['ERRNO_MODE_UNIX'] = "1";
}

_setEnv(env);

process.on('exit', () => {
  rmSync(testDir, { recursive: true });
});
