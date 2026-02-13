import { fileURLToPath, URL } from 'node:url';

import { suite, test, assert, beforeAll } from 'vitest';

import { transpile, transpileBytes } from '../src/transpile.js';

import { readComponentBytes } from './helpers.js';

// - (2025/02/04) increased due to incoming implementations of async and new flush impl
// - (2025/02/04) increased due to stabilization changes for async tasks
// - (2025/12/16) increased due to additional async impl
const FLAVORFUL_WASM_TRANSPILED_CODE_CHAR_LIMIT = 80_000;

suite('Transpile', () => {
    let flavorfulWasmBytes;

    beforeAll(async () => {
        flavorfulWasmBytes = await readComponentBytes(
            fileURLToPath(new URL(`../../jco/test/fixtures/components/flavorful.component.wasm`, import.meta.url)),
        );
    });

    test('transpile (via API)', async () => {
        const { files } = await transpile(
            fileURLToPath(new URL(`../../jco/test/fixtures/components/flavorful.component.wasm`, import.meta.url)),
        );
        assert.ok(files['flavorful.component.js']);
    });

    test('transpilation', async () => {
        const name = 'flavorful';
        const { files, imports, exports } = await transpileBytes(flavorfulWasmBytes, {
            name,
        });
        assert.strictEqual(imports.length, 4);
        assert.strictEqual(exports.length, 3);
        assert.deepStrictEqual(exports[0], ['test', 'instance']);
        assert.ok(files[name + '.js']);
    });

    test('transpile to JS', async () => {
        const name = 'flavorful';
        const { files, imports, exports } = await transpileBytes(flavorfulWasmBytes, {
            map: {
                'test:flavorful/*': './*.js',
            },
            name,
            validLiftingOptimization: true,
            tlaCompat: true,
            base64Cutoff: 0,
            js: true,
        });
        assert.strictEqual(imports.length, 4);
        assert.strictEqual(exports.length, 3);
        assert.deepStrictEqual(exports[0], ['test', 'instance']);
        assert.deepStrictEqual(exports[1], ['test:flavorful/test', 'instance']);
        assert.deepStrictEqual(exports[2], ['testImports', 'function']);
        const source = Buffer.from(files[name + '.js']).toString();
        assert.ok(source.includes('./test.js'));
        assert.ok(source.includes('FUNCTION_TABLE'));
        for (let i = 0; i < 2; i++) {
            assert.ok(source.includes(exports[i][0]));
        }
    });

    test('map imports', async () => {
        const name = 'flavorful';
        const { files, imports } = await transpileBytes(flavorfulWasmBytes, {
            name,
            map: {
                'test:flavorful/*': '#*import',
            },
        });
        assert.strictEqual(imports.length, 4);
        assert.strictEqual(imports[0], '#testimport');
        const source = Buffer.from(files[name + '.js']).toString();
        assert.ok(source.includes("'#testimport'"));
    });

    test('transpile, optimize, minify', async () => {
        const name = 'flavorful';
        const { files, imports, exports } = await transpileBytes(flavorfulWasmBytes, {
            name,
            minify: true,
            validLiftingOptimization: true,
            tlaCompat: true,
            optimize: true,
            base64Cutoff: 0,
        });
        assert.strictEqual(imports.length, 4);
        assert.strictEqual(exports.length, 3);
        assert.deepStrictEqual(exports[0], ['test', 'instance']);
        assert.ok(files[name + '.js'].length < FLAVORFUL_WASM_TRANSPILED_CODE_CHAR_LIMIT);
    });
});
