import { readFile } from 'node:fs/promises';
import { exec, jcoPath } from './helpers.js';
import { strictEqual } from 'node:assert';
import { componentNew, componentEmbed, transpile } from '@bytecodealliance/jco';
import { ok } from 'node:assert';

const eslintPath = `node_modules/eslint/bin/eslint.js`;

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

  suite(`Naming`, () => {
    test(`Resource deduping`, async () => {
      const component = await componentNew(await componentEmbed({
        witSource: await readFile(`test/fixtures/wits/resource-naming/resource-naming.wit`, 'utf8'),
        dummy: true,
        metadata: [['language', [['javascript', '']]], ['processed-by', [['dummy-gen', 'test']]]]
      }));

      const { files } = await transpile(component, { name: 'resource-naming' });

      const bindingsSource = new TextDecoder().decode(files['resource-naming.js']);

      ok(bindingsSource.includes('const Thing$1 = class Thing'));
      ok(bindingsSource.includes('Thing: Thing$1'));
    });
  });
}
