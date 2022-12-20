import { readFile } from 'node:fs/promises';
import { exec, jsctPath } from './helpers.js';
import { strictEqual } from 'node:assert';

const eslintPath = 'node_modules/.bin/eslint';
const tscPath = 'node_modules/.bin/tsc';

export async function readFlags (fixture) {
  try {
    var source = await readFile(fixture, 'utf8');
  }
  catch (e) {
    if (e && e.code === 'ENOENT')
      return [];
    throw e;
  }

  const firstLine = source.split('\n')[0];
  if (firstLine.startsWith('// Flags:'))
    return firstLine.slice(9).trim().split(' ');
  return [];
}

export async function codegenTest (fixtures) {
  suite(`Transpiler codegen`, () => {
    for (const fixture of fixtures) {
      const name = fixture.replace('.component.wasm', '');
      test(`${fixture} transpile`, async () => {
        const flags = await readFlags(`test/runtime/${name}.ts`);
        var { stderr } = await exec(jsctPath, 'transpile', `test/fixtures/${fixture}`, '--name', name, ...flags, '-o', `test/output/${name}`);
        strictEqual(stderr, '');
      });
      test(`${fixture} lint`, async () => {
        var { stderr } = await exec(eslintPath, `test/output/${name}/${name}.js`, '-c', 'test/eslintrc.cjs');
        strictEqual(stderr, '');
      });
    }

    // TypeScript tests _must_ run after codegen to complete successfully
    test('TypeScript Compilation', async () => {
      var { stderr } = await exec(tscPath, '-p', 'test/tsconfig.json');
      strictEqual(stderr, '');
    }).timeout(20_000);
  });
}
