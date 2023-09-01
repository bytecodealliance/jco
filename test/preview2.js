import { strictEqual } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import { componentNew, preview1AdapterCommandPath } from '../src/api.js';
import { exec, jcoPath } from './helpers.js';

export async function preview2Test () {
  suite('Preview 2', () => {
    test('hello_stdout', async () => {
      const component = await readFile(`test/fixtures/modules/hello_stdout.wasm`);
      const generatedComponent = await componentNew(component, [['wasi_snapshot_preview1', await readFile(preview1AdapterCommandPath())]]);
      await writeFile('test/output/hello_stdout.component.wasm', generatedComponent);

      const { stdout, stderr } = await exec(jcoPath, 'run', 'test/output/hello_stdout.component.wasm');
      strictEqual(stdout, 'writing to stdout: hello, world\n');
      strictEqual(stderr, 'writing to stderr: hello, world\n');
    });
  });
}
