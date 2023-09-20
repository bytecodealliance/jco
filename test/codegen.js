import { readFile } from 'node:fs/promises';
import { exec, jcoPath } from './helpers.js';
import { strictEqual } from 'node:assert';

const eslintPath = 'node_modules/.bin/eslint';

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
      const name = fixture.replace(/(\.component)?\.(wasm|wat)$/, '');
      test(`${fixture} transpile`, async () => {
        const flags = await readFlags(`test/runtime/${name}.ts`);
        var { stderr } = await exec(jcoPath, 'transpile', `test/fixtures/components/${fixture}`, '--name', name, ...flags, '-o', `test/output/${name}`);
        strictEqual(stderr, '');
      });

      test(`${fixture} lint`, async () => {
        const flags = await readFlags(`test/runtime/${name}.ts`);
        if (flags.includes('--js'))
          return;
        var { stderr } = await exec(eslintPath, `test/output/${name}/${name}.js`, '-c', 'test/eslintrc.cjs');
        strictEqual(stderr, '');
      });
    }
  });
}
