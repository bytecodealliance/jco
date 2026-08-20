import { writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { assert, expect, suite, test } from 'vitest';

import { transpileBytes } from '../src/transpile.js';
import { generateHostTypes } from '../src/typegen.js';
import { componentEmbed, componentNew } from '../src/wasm-tools.js';
import { getTmpDir, setupAsyncTest } from './helpers.js';

const witPath = fileURLToPath(new URL('./fixtures/wit/namespace-objects/namespace-objects.wit', import.meta.url));

suite('namespace objects', async () => {
    const component = await componentNew(await componentEmbed({ witPath, dummy: true }));

    test('exports namespace objects for variants, enums, and flags', async () => {
        const defaultResult = await transpileBytes(component, { name: 'default' });
        const defaultSource = Buffer.from(defaultResult.files['default.js']).toString();
        assert.notInclude(defaultSource, 'const Direction = Object.freeze({');
        assert.notInclude(defaultSource, 'const Y = Object.freeze({');
        assert.notInclude(defaultSource, 'const Permissions = Object.freeze({');

        const result = await transpileBytes(component, {
            name: 'namespace-objects',
            useNamespaceObjects: true,
        });
        const source = Buffer.from(result.files['namespace-objects.js']).toString();
        const declarations = Buffer.from(result.files['interfaces/test-namespace-objects-api.d.ts']).toString();

        assert.include(source, 'const Y = Object.freeze({');
        assert.include(source, "Text: (val) => ({ tag: 'text', val }),");
        assert.include(source, "Empty: () => ({ tag: 'empty' }),");
        assert.include(source, 'const X = Y;');
        assert.include(source, 'const Direction = Object.freeze({');
        assert.include(source, "North: 'north',");
        assert.include(source, 'const Permissions = Object.freeze({');
        assert.include(source, 'Read: 1n << 0n,');
        const api = source.match(/const api = \{[\s\S]*?\n\};/)?.[0] ?? '';
        assert.include(api, 'X: X,');
        assert.include(api, 'Y: Y,');
        assert.include(api, 'Direction: Direction,');
        assert.include(api, 'Permissions: Permissions,');

        assert.include(declarations, 'export const X: {');
        assert.include(declarations, "readonly Text: (val: string) => Extract<X, { tag: 'text' }>,");
        assert.include(declarations, "readonly Empty: () => Extract<X, { tag: 'empty' }>,");
        assert.include(declarations, 'export const Y: {');
        assert.include(declarations, 'export const Direction: {');
        assert.include(declarations, "readonly North: 'north',");
        assert.include(declarations, 'export type Permissions = bigint;');
        assert.include(declarations, 'export const Permissions: {');
        assert.include(declarations, 'readonly Read: bigint,');

        const componentDir = await getTmpDir();
        const componentPath = join(componentDir, 'namespace-objects.wasm');
        await writeFile(componentPath, component);
        const runtime = await setupAsyncTest({
            component: {
                name: 'namespace-objects-runtime',
                path: componentPath,
            },
            jco: {
                transpile: {
                    extraArgs: { useNamespaceObjects: true },
                },
            },
        });

        try {
            assert.strictEqual(runtime.instance.api.X, runtime.instance.api.Y);
            assert.isTrue(Object.isFrozen(runtime.instance.api.Y));
            assert.deepEqual(runtime.instance.api.Y.Text('hello'), { tag: 'text', val: 'hello' });
            assert.deepEqual(runtime.instance.api.Y.Empty(), { tag: 'empty' });
            assert.strictEqual(runtime.instance.api.Direction.North, 'north');
            assert.strictEqual(runtime.instance.api.Permissions.Read, 1n);
            assert.strictEqual(runtime.instance.api.Permissions.Write, 2n);
        } finally {
            await runtime.cleanup();
            await rm(componentDir, { recursive: true });
        }
    });

    test('rejects variant namespace objects with inline variant cases', async () => {
        const conflictingOptions = {
            name: 'conflict',
            useNamespaceObjects: true,
            variantsInlineCases: true,
        };
        await expect(transpileBytes(component, conflictingOptions)).rejects.toThrow(
            /useNamespaceObjects.*variantsInlineCases/,
        );
        await expect(generateHostTypes(witPath, conflictingOptions)).rejects.toThrow(
            /useNamespaceObjects.*variantsInlineCases/,
        );
    });
});
