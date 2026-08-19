import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';

import { setupAsyncTest } from './helpers.js';

const componentPath = fileURLToPath(
    new URL('./fixtures/components/runtime/flags-bigint.component.wat', import.meta.url),
);

suite('bigint flags', () => {
    test('preserves object flags by default', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'flags-default',
                path: componentPath,
            },
        });

        try {
            const value = instance.api.roundtrip({ read: true, admin: true, flag31: true });
            assert.strictEqual(Object.keys(value).length, 32);
            assert.strictEqual(value.read, true);
            assert.strictEqual(value.admin, true);
            assert.strictEqual(value.flag31, true);
            assert.strictEqual(value.flag30, false);
            assert.notProperty(instance.api, 'Permissions');
        } finally {
            await cleanup();
        }
    });

    test('supports direct ESM bindings', async () => {
        const { esModule, cleanup } = await setupAsyncTest({
            component: {
                name: 'flags-bigint-esm',
                path: componentPath,
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        flagsAsBigInt: true,
                        instantiation: undefined,
                    },
                },
            },
        });

        try {
            await esModule.$init;
            assert.strictEqual(Object.keys(esModule.api.Permissions).length, 32);
            assert.strictEqual(esModule.api.Permissions.Read, 1n);
            assert.strictEqual(esModule.api.Permissions.Flag31, 1n << 31n);
            const value =
                esModule.api.Permissions.Read | esModule.api.Permissions.Admin | esModule.api.Permissions.Flag31;
            assert.strictEqual(esModule.api.roundtrip(value), value);
        } finally {
            await cleanup();
        }
    });
});
