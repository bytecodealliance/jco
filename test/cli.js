import { ok, strictEqual } from 'node:assert';
import { readFile, rm } from 'node:fs/promises';
import { exec, jsctPath } from './helpers.js';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

export async function cliTest (fixtures) {
  suite('CLI', () => {
    const outDir = resolve(tmpdir(), 'out-component-dir');
    const outFile = resolve(tmpdir(), 'out-component-file');

    async function cleanup() {
      try {
        await rm(outDir, { recursive: true });
        await rm(outFile);
      }
      catch {}
    }

    test('Transpile', async () => {
      try {
        const name = fixtures[0].replace('.component.wasm', '');
        const { stderr } = await exec(jsctPath, 'transpile', `test/fixtures/${fixtures[0]}`, '--name', name, '-o', outDir);
        strictEqual(stderr, '');
        const source = await readFile(`${outDir}/${name}.js`);
        ok(source.toString().includes('export function thunk'));
      }
      finally {
        await cleanup();
      }
    });

    test('Transpile & Optimize & Minify', async () => {
      try {
        const name = fixtures[0].replace('.component.wasm', '');
        const { stderr } = await exec(jsctPath, 'transpile', `test/fixtures/${fixtures[0]}`, '--name', name, '--valid-lifting-optimization', '--compat', '--optimize', '--minify', '--base64-cutoff=0', '-o', outDir);
        strictEqual(stderr, '');
        const source = await readFile(`${outDir}/${name}.js`);
        ok(source.toString().includes('export function thunk'));
      }
      finally {
        await cleanup();
      }
    });

    test('Transpile asm.js', async () => {
      try {
        const name = fixtures[1].replace('.component.wasm', '');
        const { stderr } = await exec(jsctPath, 'transpile', `test/fixtures/${fixtures[1]}`, '--name', name, '--map', 'testwasi=./wasi.js', '--valid-lifting-optimization', '--compat', '--asm', '--base64-cutoff=0', '-o', outDir);
        strictEqual(stderr, '');
        const source = await readFile(`${outDir}/${name}.js`, 'utf8');
        ok(source.includes('./wasi.js'));
        ok(source.includes('testwasi'));
        ok(source.includes('FUNCTION_TABLE'));
        ok(source.includes('export const $init'));
      }
      finally {
        await cleanup();
      }
    });

    test('Optimize', async () => {
      try {
        const component = await readFile(`test/fixtures/${fixtures[0]}`);
        const { stderr, stdout } = await exec(jsctPath, 'opt', `test/fixtures/${fixtures[0]}`, '-o', outFile);
        strictEqual(stderr, '');
        ok(stdout.includes('Core Module 1:'));
        const optimizedComponent = await readFile(outFile);
        ok(optimizedComponent.byteLength < component.byteLength);
      }
      finally {
        await cleanup();
      }
    });

    test('Print & Parse', async () => {
      try {
        const { stderr, stdout } = await exec(jsctPath, 'print', `test/fixtures/${fixtures[0]}`);
        strictEqual(stderr, '');
        strictEqual(stdout.slice(0, 10), '(component');
        {
          const { stderr, stdout } = await exec(jsctPath, 'print', `test/fixtures/${fixtures[0]}`, '-o', outFile);
          strictEqual(stderr, '');
          strictEqual(stdout, '');
        }
        {
          const { stderr, stdout } = await exec(jsctPath, 'parse', outFile, '-o', outFile);
          strictEqual(stderr, '');
          strictEqual(stdout, '');
          ok(await readFile(outFile));
        }
      }
      finally {
        await cleanup();
      }
    });

    test('Wit & New', async () => {
      try {
        const { stderr, stdout } = await exec(jsctPath, 'wit', `test/fixtures/${fixtures[0]}`);
        strictEqual(stderr, '');
        ok(stdout.includes('world component {'));

        {
          const { stderr, stdout } = await exec(jsctPath, 'wit', `test/fixtures/${fixtures[0]}`, '-o', outFile);
          strictEqual(stderr, '');
          strictEqual(stdout, '');
        }

        {
          const { stderr, stdout } = await exec(jsctPath, 'new', '--types-only', '--wit', outFile, '-o', outFile);
          strictEqual(stderr, '');
          strictEqual(stdout, '');
        }

        {
          const { stderr, stdout } = await exec(jsctPath, 'print', outFile);
          strictEqual(stderr, '');
          strictEqual(stdout.slice(0, 10), '(component');
        }
      }
      finally {
        await cleanup();
      }
    });

    test('Component new adapt', async () => {
      try {
        const { stderr } = await exec(jsctPath,
            'new',
            'test/fixtures/exitcode.wasm',
            '--adapt',
            'test/fixtures/wasi_snapshot_preview1.wasm',
            '-o', outFile);
        strictEqual(stderr, '');
        {
          const { stderr, stdout } = await exec(jsctPath, 'print', outFile);
          strictEqual(stderr, '');
          strictEqual(stdout.slice(0, 10), '(component');
        }
      }
      finally {
        await cleanup();
      }
    });
  });
}
