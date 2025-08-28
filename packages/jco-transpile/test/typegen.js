import { Buffer } from 'node:buffer';

import { suite, test, assert } from 'vitest';

import { WIT_FIXTURE_DIR, LOCAL_WIT_FIXTURE_DIR } from './helpers.js';

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

    // https://github.com/bytecodealliance/jco/issues/624
    test('invalid js identifiers (guest import)', async () => {
        const files = await generateGuestTypes(`${LOCAL_WIT_FIXTURE_DIR}/js-reserved-word.wit`, {
            worldName: 'fixtures:js-reserved-word/imports',
        });

        assert.strictEqual(Object.keys(files).length, 2);
        assert.strictEqual(
            Object.keys(files)[1],
            'interfaces/fixtures-js-reserved-word-example.d.ts'
        );

        const [ worldDeclaration, interfaceDeclaration ] = Object.values(files);
        const worldDeclarationContent = Buffer.from(worldDeclaration);
        const interfaceDeclarationContent = Buffer.from(interfaceDeclaration);

        assert.ok(
            worldDeclarationContent.includes(
                "declare module 'fixtures:js-reserved-word/imports' {"
            )
        );
        assert.ok(
            interfaceDeclarationContent.includes(
                "declare module 'fixtures:js-reserved-word/example' {"
            )
        );
        assert(interfaceDeclarationContent.includes('export { _delete as delete };'));
        assert(interfaceDeclarationContent.includes('function _delete'));

    });

    // https://github.com/bytecodealliance/jco/issues/624
    test('invalid js identifiers (host import)', async () => {
        const files = await generateHostTypes(`${LOCAL_WIT_FIXTURE_DIR}/js-reserved-word.wit`, {
            worldName: 'fixtures:js-reserved-word/imports',
        });

        assert.strictEqual(Object.keys(files).length, 2);
        assert.strictEqual(
            Object.keys(files)[1],
            'interfaces/fixtures-js-reserved-word-example.d.ts'
        );

        const [ worldDeclaration, interfaceDeclaration ] = Object.values(files);
        const worldDeclarationContent = Buffer.from(worldDeclaration);
        const interfaceDeclarationContent = Buffer.from(interfaceDeclaration);

        assert(
            worldDeclarationContent.includes(
                "export type * as FixturesJsReservedWordExample"
            ), 
        );
        assert(
            interfaceDeclarationContent.includes(
                "@module Interface fixtures:js-reserved-word/example"
            ),
        );

        assert(interfaceDeclarationContent.includes('export { _delete as delete };'));
        assert(interfaceDeclarationContent.includes('function _delete'));

    });
});
