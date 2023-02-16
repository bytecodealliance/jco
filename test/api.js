import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { transpile, opt, print, parse, componentWit, componentNew, componentEmbed, metadataShow, metadataAdd } from '../src/api.js';

export async function apiTest (fixtures) {
  suite('API', () => {
    test('Transpile', async () => {
      const name = 'flavorful';
      const component = await readFile(`test/fixtures/${name}.component.wasm`);
      const { files, imports, exports } = await transpile(component, { name });
      strictEqual(imports.length, 2);
      strictEqual(exports.length, 2);
      deepStrictEqual(exports[0], ['exports', 'instance']);
      ok(files[name + '.js']);
    });

    test('Transpile & Optimize & Minify', async () => {
      const name = 'flavorful';
      const component = await readFile(`test/fixtures/${name}.component.wasm`);
      const { files, imports, exports } = await transpile(component, {
        name,
        minify: true,
        validLiftingOptimization: true,
        tlaCompat: true,
        optimize: true,
        base64Cutoff: 0,
      });
      strictEqual(imports.length, 2);
      strictEqual(exports.length, 2);
      deepStrictEqual(exports[0], ['exports', 'instance']);
      ok(files[name + '.js'].length < 11_000);
    });

    test('Transpile to JS', async () => {
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
      const component = await readFile(`test/fixtures/flavorful.component.wasm`);
      const { component: optimizedComponent } = await opt(component);
      ok(optimizedComponent.byteLength < component.byteLength);
    });

    test('Print & Parse', async () => {
      const component = await readFile(`test/fixtures/flavorful.component.wasm`);
      const output = await print(component);
      strictEqual(output.slice(0, 10), '(component');

      const componentParsed = await parse(output);
      ok(componentParsed);
    });

    test('Wit & New', async () => {
      const component = await readFile(`test/fixtures/flavorful.component.wasm`);
      const wit = await componentWit(component);

      strictEqual(wit.slice(0, 19), 'interface imports {');

      const generatedComponent = await componentEmbed(null, wit, {
        dummy: true,
        metadata: [['language', [['javascript', '']]], ['processed-by', [['dummy-gen', 'test']]]]
      });
      {
        const output = await print(generatedComponent);
        strictEqual(output.slice(0, 7), '(module');
      }

      const newComponent = await componentNew(generatedComponent);
      {
        const output = await print(newComponent);
        strictEqual(output.slice(0, 10), '(component');
      }

      const meta = metadataShow(newComponent);
      deepStrictEqual(meta[0].metaType, {
        tag: 'component',
        val: 4
      });
      deepStrictEqual(meta[1].producers, [['processed-by', [['wit-component', '0.7.0'], ['dummy-gen', 'test']]], ['language', [['javascript', '']]]])
    });

    test('Component new adapt', async () => {
      const component = await readFile(`test/fixtures/exitcode.wasm`);

      const generatedComponent = await componentNew(component, [['wasi_snapshot_preview1', await readFile('test/fixtures/wasi_snapshot_preview1.wasm')]]);

      await print(generatedComponent);
    });

    test('Extract metadata', async () => {
      const component = await readFile(`test/fixtures/exitcode.wasm`);

      const meta = metadataShow(component);

      deepStrictEqual(meta, [{
        metaType: { tag: 'module' },
        producers: [],
        name: null
      }]);
    });
  });
}
