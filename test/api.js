import { ok, strictEqual } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { transpile, opt, print, parse, componentWit, componentNew } from 'js-component-tools';

export async function apiTest (fixtures) {
  suite('API', () => {
    test('Transpile', async () => {
      const name = fixtures[0].replace('.component.wasm', '');
      const component = await readFile(`test/fixtures/${fixtures[0]}`);
      const { files, imports, exports } = await transpile(component, { name });
      strictEqual(imports.length, 0);
      strictEqual(exports.length, 1);
      strictEqual(exports[0], 'thunk');
      ok(files[name + '.js']);
    });

    test('Transpile & Optimize & Minify', async () => {
      const name = fixtures[0].replace('.component.wasm', '');
      const component = await readFile(`test/fixtures/${fixtures[0]}`);
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
      strictEqual(exports[0], 'thunk');
      ok(files[name + '.js'].length < 8000);
    });

    test('Transpile asm.js', async () => {
      const name = fixtures[1].replace('.component.wasm', '');
      const component = await readFile(`test/fixtures/${fixtures[1]}`);
      const { files, imports, exports } = await transpile(component, {
        map: {
          'testwasi': './wasi.js'
        },
        name,
        validLiftingOptimization: true,
        tlaCompat: true,
        base64Cutoff: 0,
        asm: true,
      });
      strictEqual(imports.length, 2);
      strictEqual(exports.length, 10);
      strictEqual(exports[0], 'testImports');
      const source = Buffer.from(files[name + '.js']).toString();
      ok(source.includes('./wasi.js'));
      ok(source.includes('testwasi'));
      ok(source.includes('FUNCTION_TABLE'));
      for (let i = 0; i < 10; i++)
        ok(source.includes(exports[i]));
    });

    test('Optimize', async () => {
      const component = await readFile(`test/fixtures/${fixtures[0]}`);
      const { component: optimizedComponent } = await opt(component);
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

    test('Component new adapt', async () => {
      const component = await readFile(`test/fixtures/exitcode.wasm`);

      const generatedComponent = await componentNew(component, {
        adapters: [['wasi_snapshot_preview1', await readFile('test/fixtures/wasi_snapshot_preview1.wasm')]]
      });

      await print(generatedComponent);
    });
  });
}
