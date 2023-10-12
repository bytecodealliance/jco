import { transpile } from './transpile.js';
import { tmpdir } from 'node:os';
import { rm, stat, mkdir, writeFile, symlink, chmod } from 'node:fs/promises';
import { basename, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { argv0, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import * as crypto from 'node:crypto';
import c from 'chalk-template';

function getTmpDir (name) {
  return resolve(tmpdir(), crypto.createHash('sha256').update(name).update(Math.random().toString()).digest('hex'));
}

export async function run (componentPath, args) {
  const name = basename(componentPath.slice(0, -extname(componentPath).length || Infinity));
  const outDir = resolve(getTmpDir(name));
  let cp;
  try {
    try {
      await transpile(componentPath, {
        name,
        quiet: true,
        noTypescript: true,
        wasiShim: true,
        outDir
      });
    }
    catch (e) {
      console.error(c`{red ERR}: Unable to transpile command for execution`);
      throw e;
    }

    await mkdir(resolve(outDir, 'node_modules', '@bytecodealliance'), { recursive: true });
    await writeFile(resolve(outDir, 'package.json'), JSON.stringify({ type: 'module' }));

    let preview2ShimPath = fileURLToPath(new URL('../../node_modules/@bytecodealliance/preview2-shim', import.meta.url));
    while (true) {
      try {
        if ((await stat(preview2ShimPath)).isDirectory()) {
          break;
        }
      }
      catch {}
      let len = preview2ShimPath.length;
      preview2ShimPath = resolve(preview2ShimPath, '../../../node_modules/@bytecodealliance/preview2-shim');
      if (preview2ShimPath.length === len) {
        console.error(c`{red ERR}: Unable to locate the {bold @bytecodealliance/preview2-shim} package, make sure it is installed.`);
        return;
      }
    }

    await symlink(preview2ShimPath, resolve(outDir, 'node_modules/@bytecodealliance/preview2-shim'), 'dir');

    const runPath = resolve(outDir, '_run.js');
    await writeFile(runPath, `
      function logInvalidCommand () {
        console.error('Not a valid command component to execute, make sure it was built to a command adapter and with the same version.');
      }
      try {
        const mod = await import('./${name}.js');
        if (!mod.run || !mod.run.run) {
          logInvalidCommand();
          process.exit(1);
        }
        try {
          mod.run.run();
        }
        catch (e) {
          console.error(e);
          process.exit(1);
        }
      }
      catch (e) {
        logInvalidCommand();
        throw e;
      }
    `);
    await chmod(runPath, 0o777);

    cp = spawn(argv0, [runPath, ...args], { stdio: 'inherit' });
  }
  finally {
    if (!cp) {
      try {
        await rm(outDir, { recursive: true });
      } catch {}
    }
  }

  const exitCode = await new Promise((resolve, reject) => {
    cp.on('error', reject);
    cp.on('exit', resolve);
  });
  try {
    await rm(outDir, { recursive: true });
  } catch {}
  exit(exitCode);
}
