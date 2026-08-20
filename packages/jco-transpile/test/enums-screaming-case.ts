import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from './common.js';
import { setupAsyncTest } from './helpers.js';
import { generateHostTypes } from '../src/typegen.js';

const componentPath = fileURLToPath(
    new URL('./fixtures/components/runtime/enums-screaming-case.component.wat', import.meta.url),
);
const witPath = fileURLToPath(new URL('./fixtures/wit/namespace-objects/namespace-objects.wit', import.meta.url));

suite('screaming-case enums', () => {
    test('preserves WIT enum case strings by default', async () => {
        const runtime = await setupAsyncTest({
            component: {
                name: 'enums-default',
                path: componentPath,
            },
        });

        try {
            assert.strictEqual(runtime.instance.api.roundtrip('value-a'), 'value-a');
            assert.strictEqual(runtime.instance.api.roundtrip('http-error'), 'http-error');
            assert.notProperty(runtime.instance.api, 'Status');
        } finally {
            await runtime.cleanup();
        }
    });

    test('uses SCREAMING_SNAKE_CASE strings when enabled', async () => {
        const runtime = await setupAsyncTest({
            component: {
                name: 'enums-screaming',
                path: componentPath,
            },
            jco: {
                transpile: {
                    extraArgs: { enumValuesScreamingSnakeCase: true },
                },
            },
        });

        try {
            assert.strictEqual(runtime.instance.api.roundtrip('VALUE_A'), 'VALUE_A');
            assert.strictEqual(runtime.instance.api.roundtrip('HTTP_ERROR'), 'HTTP_ERROR');
            assert.throws(() => runtime.instance.api.roundtrip('value-a'), /not one of the cases/);
            assert.notProperty(runtime.instance.api, 'Status');

            const declarations = await readFile(join(runtime.esModuleOutputDir, 'interfaces/api.d.ts'), 'utf8');
            assert.include(declarations, "export type Status = 'VALUE_A' | 'HTTP_ERROR';");
        } finally {
            await runtime.cleanup();
        }
    });

    test('uses screaming-case values in enum namespace objects', async () => {
        const runtime = await setupAsyncTest({
            component: {
                name: 'enums-screaming-namespace',
                path: componentPath,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        enumValuesScreamingSnakeCase: true,
                        useNamespaceObjects: true,
                    },
                },
            },
        });

        try {
            assert.strictEqual(runtime.instance.api.Status.ValueA, 'VALUE_A');
            assert.strictEqual(runtime.instance.api.Status.HttpError, 'HTTP_ERROR');
            assert.strictEqual(
                runtime.instance.api.roundtrip(runtime.instance.api.Status.HttpError),
                runtime.instance.api.Status.HttpError,
            );
        } finally {
            await runtime.cleanup();
        }
    });

    test('uses screaming-case values for async enum payloads', async () => {
        class ExampleResource {
            getId() {
                return 0;
            }
        }

        const runtime = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'enums-screaming-async',
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'future-lower.wasm'),
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: { enumValuesScreamingSnakeCase: true },
                },
            },
        });

        try {
            const instance = await runtime.esModule.instantiate(undefined, {
                ...new WASIShim().getImportObject(),
                'jco:test-components/resources': { ExampleResource },
            });
            const readEnum = instance['jco:test-components/future-lower-async'].readFutureValueEnum;
            assert.strictEqual(await readEnum(Promise.resolve('FIRST')), 'FIRST');
        } finally {
            await runtime.cleanup();
        }
    });

    test('uses screaming-case values for standalone type generation', async () => {
        const files = await generateHostTypes(witPath, {
            enumValuesScreamingSnakeCase: true,
            useNamespaceObjects: true,
        });
        const declarations = Buffer.from(files['interfaces/test-namespace-objects-api.d.ts']).toString();
        assert.include(declarations, "export type Direction = 'NORTH' | 'SOUTH';");
        assert.include(declarations, "readonly North: 'NORTH',");
    });
});
