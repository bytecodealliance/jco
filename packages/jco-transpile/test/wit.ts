/* global Buffer */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { transpileBytes, generateHostTypes } from '../src/index.js';
import { componentNew, componentEmbed } from '../src/wasm-tools.js';

import { suite, test, assert } from 'vitest';

export const COMPONENT_FIXTURES_DIR = suite('WIT', async () => {
    const witFixturesPath = fileURLToPath(new URL('./fixtures/wit', import.meta.url));
    const featureGatesWitPath = join(witFixturesPath, 'feature-gates.wit');
    const featureGatesWitContent = await readFile(featureGatesWitPath, 'utf8');

    // (transpile): features marked @unstable should *not* be present when no features are enabled
    //
    // NOTE: this works primarily the features are fed through to the `wit_parser::Resolve` that is used,
    // not due to active filtering on the jco side.
    test.concurrent('Feature gates (no features)', async () => {
        // Build a dummy WIT component
        const generatedComponent = await componentEmbed({
            witSource: featureGatesWitContent,
            dummy: true,
            metadata: [
                ['language', [['javascript', '']]],
                ['processed-by', [['dummy-gen', 'test']]],
            ],
        });
        const component = await componentNew(generatedComponent);

        // Transpile the component
        const { files, imports, exports } = await transpileBytes(component);
        assert.deepStrictEqual(imports, ['test:feature-gates/foo']);
        assert.deepStrictEqual(exports, [
            ['foo', 'instance'],
            ['test:feature-gates/foo@0.2.1', 'instance'],
        ]);
        assert.ok(files['component.js'], 'component js was generated');
        assert.ok(files['component.d.ts'], 'component typings were generated');
        assert.ok(files['interfaces/test-feature-gates-foo.d.ts'], 'interface typings were generated');

        // Check the interfaces file for the right exports
        const interfaces = Buffer.from(files['interfaces/test-feature-gates-foo.d.ts']).toString('utf8');
        assert.ok(interfaces.includes('export function a(): void;'), 'unconstrained export foo/a is present');
        assert.ok(
            interfaces.includes('export function b(): void;'),
            '@since(0.2.1) export foo/b is present (version matches)',
        );
        assert.ok(
            interfaces.includes('export function c(): void;'),
            '@since(0.2.1) export foo/c is present (feature is ignored)',
        );
        assert.ok(
            !interfaces.includes('export function d(): void;'),
            '@unstable(...) export is missing, without the feature specified',
        );
    });

    // (transpile): features marked @unstable should *not* be present when an unrelated feature is enabled
    //
    // NOTE: this works primarily the features are fed through to the `wit_parser::Resolve` that is used,
    // not due to active filtering on the jco side.
    test.concurrent('Feature gates (unrelated feature)', async () => {
        // Build a dummy WIT component
        const generatedComponent = await componentEmbed({
            witSource: featureGatesWitContent,
            dummy: true,
            metadata: [
                ['language', [['javascript', '']]],
                ['processed-by', [['dummy-gen', 'test']]],
            ],
            features: {
                tag: 'list',
                val: ['some-feature'],
            },
        });
        const component = await componentNew(generatedComponent);

        // Transpile the component
        const { files, imports, exports } = await transpileBytes(component);
        assert.deepStrictEqual(imports, ['test:feature-gates/foo']);
        assert.deepStrictEqual(exports, [
            ['foo', 'instance'],
            ['test:feature-gates/foo@0.2.1', 'instance'],
        ]);
        assert.ok(files['component.js'], 'component js was generated');
        assert.ok(files['component.d.ts'], 'component typings were generated');
        assert.ok(files['interfaces/test-feature-gates-foo.d.ts'], 'interface typings were generated');

        // Check the interfaces file for the right exports
        const interfaces = Buffer.from(files['interfaces/test-feature-gates-foo.d.ts']).toString('utf8');
        assert.ok(interfaces.includes('export function a(): void;'), 'unconstrained export foo/a is present');
        assert.ok(
            interfaces.includes('export function b(): void;'),
            '@since(0.2.1) export foo/b is present (version matches)',
        );
        assert.ok(
            interfaces.includes('export function c(): void;'),
            '@since(0.2.1) export foo/c is present (feature is ignored)',
        );
        assert.ok(
            !interfaces.includes('export function d(): void;'),
            '@unstable(...) export is missing, without the feature specified',
        );
    });

    // (transpile): features marked @unstable should be present in exports when only the specific feature is enabled
    //
    // NOTE: this works primarily the features are fed through to the `wit_parser::Resolve` that is used,
    // not due to active filtering on the jco side.
    test.concurrent('Feature gates (single feature enabled)', async () => {
        // Build a dummy WIT component
        const generatedComponent = await componentEmbed({
            witSource: featureGatesWitContent,
            dummy: true,
            metadata: [
                ['language', [['javascript', '']]],
                ['processed-by', [['dummy-gen', 'test']]],
            ],
            features: {
                tag: 'list',
                val: ['fancier-foo'],
            },
        });
        const component = await componentNew(generatedComponent);

        // Transpile the component
        const { files, imports, exports } = await transpileBytes(component);
        assert.deepStrictEqual(imports, ['test:feature-gates/foo']);
        assert.deepStrictEqual(exports, [
            ['foo', 'instance'],
            ['test:feature-gates/foo@0.2.1', 'instance'],
        ]);
        assert.ok(files['component.js'], 'component js was generated');
        assert.ok(files['component.d.ts'], 'component typings were generated');
        assert.ok(files['interfaces/test-feature-gates-foo.d.ts'], 'interface typings were generated');

        // Check the interfaces file for the right exports
        const interfaces = Buffer.from(files['interfaces/test-feature-gates-foo.d.ts']).toString('utf8');
        assert.ok(interfaces.includes('export function a(): void;'), 'unconstrained export foo/a is present');
        assert.ok(
            interfaces.includes('export function b(): void;'),
            '@since(0.2.1) export foo/b is present (version matches)',
        );
        assert.ok(
            interfaces.includes('export function c(): void;'),
            '@since(0.2.1) export foo/c is present (feature is ignored)',
        );
        assert.ok(
            interfaces.includes('export function d(): void;'),
            '@unstable(...) export is present, with all features enabled',
        );
    });

    // (transpile): features marked @unstable should be present in exports when all features are enabled
    //
    // NOTE: this works primarily the features are fed through to the `wit_parser::Resolve` that is used,
    // not due to active filtering on the jco side.
    test.concurrent('Feature gates (all features enabled)', async () => {
        // Build a dummy WIT component
        const generatedComponent = await componentEmbed({
            witSource: featureGatesWitContent,
            dummy: true,
            metadata: [
                ['language', [['javascript', '']]],
                ['processed-by', [['dummy-gen', 'test']]],
            ],
            features: { tag: 'all' },
        });
        const component = await componentNew(generatedComponent);

        // Transpile the component
        const { files, imports, exports } = await transpileBytes(component);
        assert.deepStrictEqual(imports, ['test:feature-gates/foo']);
        assert.deepStrictEqual(exports, [
            ['foo', 'instance'],
            ['test:feature-gates/foo@0.2.1', 'instance'],
        ]);
        assert.ok(files['component.js'], 'component js was generated');
        assert.ok(files['component.d.ts'], 'component typings were generated');
        assert.ok(files['interfaces/test-feature-gates-foo.d.ts'], 'interface typings were generated');

        // Check the interfaces file for the right exports
        const interfaces = Buffer.from(files['interfaces/test-feature-gates-foo.d.ts']).toString('utf8');
        assert.ok(interfaces.includes('export function a(): void;'), 'unconstrained export foo/a is present');
        assert.ok(
            interfaces.includes('export function b(): void;'),
            '@since(0.2.1) export foo/b is present (version matches)',
        );
        assert.ok(
            interfaces.includes('export function c(): void;'),
            '@since(0.2.1) export foo/c is present (feature is ignored)',
        );
        assert.ok(
            interfaces.includes('export function d(): void;'),
            '@unstable(...) export is present, with all features enabled',
        );
    });

    // (`jco types`) features marked @unstable() are missing as imports *and* exports
    test.concurrent('Feature gates - (types, no features enabled)', async () => {
        const files = await generateHostTypes(featureGatesWitPath, {
            worldName: 'import-and-export',
        });
        assert.ok(files['import-and-export.d.ts'], 'component js was generated');
        assert.ok(files['interfaces/test-feature-gates-foo.d.ts'], 'interface typings were generated');

        // Check the interfaces file for the right exports
        const interfaces = Buffer.from(files['interfaces/test-feature-gates-foo.d.ts']).toString('utf8');
        assert.ok(interfaces.includes('export function a(): void;'), 'unconstrained export foo/a is present');
        assert.ok(
            interfaces.includes('export function b(): void;'),
            '@since(0.2.1) export foo/b is present (version matches)',
        );
        assert.ok(
            interfaces.includes('export function c(): void;'),
            '@since(0.2.1) export foo/c is present (feature is ignored)',
        );
        assert.ok(
            !interfaces.includes('export function d(): void;'),
            '@unstable(...) export is missing (no features enabled)',
        );
    });

    // (`jco types`) features marked @unstable(feature = f) should be present when the specific feature is enabled
    test.concurrent('Feature gates (types, single feature enabled)', async () => {
        const files = await generateHostTypes(featureGatesWitPath, {
            worldName: 'import-and-export',
            features: ['fancier-foo'],
        });
        assert.ok(files['import-and-export.d.ts'], 'component js was generated');
        assert.ok(files['interfaces/test-feature-gates-foo.d.ts'], 'interface typings were generated');

        // Check the interfaces file for the right exports
        const interfaces = Buffer.from(files['interfaces/test-feature-gates-foo.d.ts']).toString('utf8');
        assert.ok(interfaces.includes('export function a(): void;'), 'unconstrained export foo/a is present');
        assert.ok(
            interfaces.includes('export function b(): void;'),
            '@since(0.2.1) export foo/b is present (version matches)',
        );
        assert.ok(
            interfaces.includes('export function c(): void;'),
            '@since(0.2.1) export foo/c is present (feature is ignored)',
        );
        assert.ok(
            interfaces.includes('export function d(): void;'),
            '@unstable(...) export is present (single feature enabled)',
        );
    });

    // (`jco types`) features marked @unstable() should be present with all features enabled
    test.concurrent('Feature gates (types, all features enabled)', async () => {
        const files = await generateHostTypes(featureGatesWitPath, {
            worldName: 'import-and-export',
            allFeatures: true,
        });
        assert.ok(files['import-and-export.d.ts'], 'component js was generated');
        assert.ok(files['interfaces/test-feature-gates-foo.d.ts'], 'interface typings were generated');

        // Check the interfaces file for the right exports
        const interfaces = Buffer.from(files['interfaces/test-feature-gates-foo.d.ts']).toString('utf8');
        assert.ok(interfaces.includes('export function a(): void;'), 'unconstrained export foo/a is present');
        assert.ok(
            interfaces.includes('export function b(): void;'),
            '@since(0.2.1) export foo/b is present (version matches)',
        );
        assert.ok(
            interfaces.includes('export function c(): void;'),
            '@since(0.2.1) export foo/c is present (feature is ignored)',
        );
        assert.ok(
            interfaces.includes('export function d(): void;'),
            '@unstable(...) export is present (all features enabled)',
        );
    });

    // (`jco types`) WIT errors are handled gracefully and print useful error messages
    // see: https://github.com/bytecodealliance/jco/issues/442
    test.concurrent('Invalid WIT produce better error messages', async () => {
        try {
            await generateHostTypes(join(witFixturesPath, 'invalid/invalid-fn'), {
                worldName: 'invalid',
                allFeatures: true,
            });
            assert.fail('test should have errored');
        } catch (err) {
            const errMsg = err.toString();
            assert.include(errMsg, 'expected `type`, `resource` or `func`');
            assert.include(errMsg, 'found keyword `static`');
        }
    });

    // (`jco types`) Same-package sibling WIT files can be referred to
    // see: https://github.com/bytecodealliance/jco/issues/442
    test.concurrent('same-package sibling WIT files work', async () => {
        const witPath = join(witFixturesPath, 'valid/no-deps');
        await generateHostTypes(witPath, {
            worldName: 'component',
            allFeatures: true,
        });
    });

    // (`jco types`)  WIT files can be referred to
    // see: https://github.com/bytecodealliance/jco/issues/442
    test.concurrent('different-package sibling WIT files fail w/ good error messages', async () => {
        const witPath = join(witFixturesPath, 'invalid/sibling-diff-pkg');
        try {
            await generateHostTypes(witPath, {
                worldName: 'component',
                allFeatures: true,
            });
        } catch (err) {
            const errMsg = err.toString();
            assert.include(errMsg, 'package identifier `tests:sibling-wit` does not match previous package');
        }
    });

    // see: https://github.com/bytecodealliance/jco/issues/622
    test.concurrent('async-exports', async () => {
        const witPath = join(witFixturesPath, 'async-exports/component.wit');
        const files = await generateHostTypes(witPath, {
            worldName: 'component',
            asyncMode: 'jspi',
            asyncExports: ['example:node-fetch/simple-request#get-json'],
            allFeatures: true,
        });
        assert.strictEqual(Object.keys(files).length, 2);
        assert.deepEqual(Object.keys(files), ['component.d.ts', 'interfaces/example-node-fetch-simple-request.d.ts']);
        assert.ok(
            Buffer.from(files['interfaces/example-node-fetch-simple-request.d.ts']).includes(
                'export function getJson(url: string): Promise<Response>',
            ),
        );
    });
});
