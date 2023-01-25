import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { transpile, opt, print, parse, componentWit, componentNew } from 'js-component-tools';

export async function apiTest (fixtures) {
  suite('API', () => {
    test('Transpile', async () => {
      const name = 'exports_only';
      const component = await readFile(`test/fixtures/${name}.component.wasm`);
      const { files, imports, exports } = await transpile(component, { name });
      strictEqual(imports.length, 0);
      strictEqual(exports.length, 1);
      deepStrictEqual(exports[0], ['thunk', 'function']);
      ok(files[name + '.js']);
    });

    test('Transpile & Optimize & Minify', async () => {
      const name = 'exports_only';
      const component = await readFile(`test/fixtures/${name}.component.wasm`);
      const { files, imports, exports } = await transpile(component, {
        name,
        minify: true,
        validLiftingOptimization: true,
        tlaCompat: true,
        optimize: true,
        base64Cutoff: 0,
      });
      strictEqual(imports.length, 0);
      strictEqual(exports.length, 1);
      deepStrictEqual(exports[0], ['thunk', 'function']);
      ok(files[name + '.js'].length < 8000);
    });

    test.skip('Transpile to JS', async () => {
      const name = 'flavorful';
      const component = await readFile(`test/fixtures/${name}.component.wasm`);
      const { files, imports, exports } = await transpile(component, {
        map: {
          'testwasi': './wasi.js'
        },
        name,
        validLiftingOptimization: true,
        tlaCompat: true,
        base64Cutoff: 0,
        js: true,
      });
      strictEqual(imports.length, 2);
      strictEqual(exports.length, 2);
      deepStrictEqual(exports[0], ['exports', 'instance']);
      deepStrictEqual(exports[1], ['testImports', 'function']);
      const source = Buffer.from(files[name + '.js']).toString();
      ok(source.includes('./wasi.js'));
      ok(source.includes('testwasi'));
      ok(source.includes('FUNCTION_TABLE'));
      for (let i = 0; i < 2; i++)
        ok(source.includes(exports[i][0]));
    });

    test('Optimize', async () => {
      const component = await readFile(`test/fixtures/exports_only.component.wasm`);
      const { component: optimizedComponent } = await opt(component);
      ok(optimizedComponent.byteLength < component.byteLength);
    });

    test('Print & Parse', async () => {
      const component = await readFile(`test/fixtures/exports_only.component.wasm`);
      const output = await print(component);
      strictEqual(output.slice(0, 10), '(component');

      const componentParsed = await parse(output);
      ok(componentParsed);
    });

    test('Wit & New', async () => {
      const component = await readFile(`test/fixtures/exports_only.component.wasm`);
      const wit = await componentWit(component);
      strictEqual(wit.slice(0, 25), 'default world component {');

      // TODO: reenable when dummy is supported
      // const generatedComponent = await componentNew(null, { wit });
      // const output = await print(generatedComponent);
      // strictEqual(output.slice(0, 10), '(component');
    });

    test('Component new adapt', async () => {
      const component = await readFile(`test/fixtures/exitcode.wasm`);

      const generatedComponent = await componentNew(component, [['wasi_snapshot_preview1', await readFile('test/fixtures/wasi_snapshot_preview1.wasm')]]);

      await print(generatedComponent);
    });
  });
}
