import { Buffer } from 'node:buffer';

import { suite, test, assert } from 'vitest';

import { WIT_FIXTURE_DIR } from './helpers.js';

import { generateGuestTypes, generateHostTypes } from '../src/typegen.js';

suite('Type Generation', () => {
    test('type generation (host)', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/flavorful`, {
            worldName: 'test:flavorful/flavorful',
        });
        assert.strictEqual(Object.keys(files).length, 2);
        assert.strictEqual(Object.keys(files)[0], 'flavorful.d.ts');
        assert.strictEqual(
            Object.keys(files)[1],
            'interfaces/test-flavorful-test.d.ts'
        );
        assert.ok(
            Buffer.from(files[Object.keys(files)[0]]).includes(
                "export * as test from './interfaces/test-flavorful-test.js'"
            )
        );
        assert.ok(
            Buffer.from(files[Object.keys(files)[1]]).includes(
                'export type ListInAlias = '
            )
        );
    });

    test('type generation (guest)', async () => {
        const files = await generateGuestTypes(`${WIT_FIXTURE_DIR}/flavorful`, {
            worldName: 'test:flavorful/flavorful',
            guest: true,
        });
        assert.strictEqual(Object.keys(files).length, 2);
        assert.strictEqual(
            Object.keys(files)[1],
            'interfaces/test-flavorful-test.d.ts'
        );
        assert.ok(
            Buffer.from(files[Object.keys(files)[0]]).includes(
                "declare module 'test:flavorful/flavorful' {"
            )
        );
        assert.ok(
            Buffer.from(files[Object.keys(files)[1]]).includes(
                "declare module 'test:flavorful/test' {"
            )
        );
    });
});
