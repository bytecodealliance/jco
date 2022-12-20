import { ok, strictEqual } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { transpile, opt, print, parse, componentWit, componentNew } from 'js-component-tools';

// TODO - CLI versions
export async function apiTest (fixtures) {
  suite('API', () => {
    test('Transpile', async () => {
      const component = await readFile(`test/fixtures/${fixtures[0]}`);
      const { files, imports, exports } = await transpile(component, { name: 'exports_only' });
      strictEqual(imports.length, 0);
      strictEqual(exports.length, 1);
      strictEqual(exports[0], 'thunk');
      ok(files['exports_only.js']);
    });

    // TODO
    // test('Transpile & Optimize', async () => {
    //   const component = await readFile(`test/fixtures/${fixtures[0]}`);
    //   const { files, imports, exports } = await transpile(component, { name: 'exports_only' });
    //   strictEqual(imports.length, 0);
    //   strictEqual(exports.length, 1);
    //   strictEqual(exports[0], 'thunk');
    //   ok(files['exports_only.js']);
    // });

    // TODO
    // test('Transpile & Optimize asm.js', async () => {
    //   const component = await readFile(`test/fixtures/${fixtures[0]}`);
    //   const { files, imports, exports } = await transpile(component, { name: 'exports_only' });
    //   strictEqual(imports.length, 0);
    //   strictEqual(exports.length, 1);
    //   strictEqual(exports[0], 'thunk');
    //   ok(files['exports_only.js']);
    // });

    test('Optimize', async () => {
      const component = await readFile(`test/fixtures/${fixtures[0]}`);
      const optimizedComponent = await opt(component);
      ok(optimizedComponent.byteLength < component.byteLength);
    });

    test('Print & Parse', async () => {
      const component = await readFile(`test/fixtures/${fixtures[0]}`);
      const output = await print(component);
      strictEqual(output.slice(0, 10), '(component');

      const componentParsed = await parse(output);
      ok(componentParsed);
    });

    test('Wit & New', async () => {
      const component = await readFile(`test/fixtures/${fixtures[0]}`);
      const wit = await componentWit(component);
      strictEqual(wit.slice(0, 17), 'world component {');

      const generatedComponent = await componentNew(null, { wit, typesOnly: true });
      const output = await print(generatedComponent);
      strictEqual(output.slice(0, 10), '(component');
    });
  });
}
