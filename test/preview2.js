import { strictEqual } from 'node:assert';
import { readFile, rm, mkdir, writeFile, symlink, chmod, access, constants } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import * as crypto from 'node:crypto';
import { transpile, componentNew, preview1AdapterCommandPath } from '../src/api.js';
import { exec } from './helpers.js';

function getTmpDir (name) {
  return resolve(tmpdir(), crypto.createHash('sha256').update(name).update(Math.random().toString()).digest('hex'));
}

export async function preview2Test () {
  suite('Preview 2', () => {
    test('hello_stdout', async () => {
      const component = await readFile(`test/fixtures/hello_stdout.wasm`);

      const generatedComponent = await componentNew(component, [['wasi_snapshot_preview1', await readFile(preview1AdapterCommandPath())]]);

      const { files } = await transpile(generatedComponent, { name: 'hello_stdout', wasiShim: true });

      const tmpdir = getTmpDir('hello_stdout');
      try {
        await mkdir(resolve(tmpdir, 'node_modules', '@bytecodealliance'), { recursive: true });
        await writeFile(resolve(tmpdir, 'package.json'), JSON.stringify({ type: 'module' }));
        await symlink(resolve('packages/preview2-shim'), resolve(tmpdir, 'node_modules/@bytecodealliance/preview2-shim'), 'dir');

        for (const [name, source] of Object.entries(files)) {
          const path = resolve(tmpdir, name);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, source);
        }

        const runPath = resolve(tmpdir, 'run.js');
        await writeFile(runPath, `
          import { main } from './hello_stdout.js';
          main();
        `);

        await chmod(runPath, 0o777);

        const { stdout, stderr } = await exec(process.argv0, [runPath]);
        strictEqual(stdout, 'writing to stdout: hello, world\n');
        strictEqual(stderr, 'writing to stderr: hello, world\n');
      }
      finally {
        await rm(tmpdir, { recursive: true });
      }
    });
  });
}
