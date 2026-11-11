import { Buffer } from 'node:buffer';
import { copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { suite, test, assert } from 'vitest';
import ts from 'typescript-compiler-api';

import { getTmpDir, JCO_WIT_FIXTURE_DIR, WIT_FIXTURE_DIR } from './helpers.js';

import { generateGuestTypes, generateHostTypes } from '../src/typegen.js';
import { writeFiles } from '../src/common.js';

/**
 * Type-check generated declaration files with the TypeScript compiler.
 *
 * @param files - generated declaration files, keyed by relative path
 * @returns the messages of the diagnostics the compiler reports, if any
 */
async function typeCheckDeclarations(files: Record<string, Uint8Array>): Promise<string[]> {
    const dir = await getTmpDir();
    try {
        await writeFiles(files, { baseDir: dir });

        const program = ts.createProgram(
            Object.keys(files).map((file) => join(dir, file)),
            {
                noEmit: true,
                strict: true,
                types: [],
                target: ts.ScriptTarget.ESNext,
                module: ts.ModuleKind.NodeNext,
            },
        );

        return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

suite('Type Generation', () => {
    test.concurrent.each(
        [
            { wit: `${JCO_WIT_FIXTURE_DIR}/flavorful`, worldName: 'test:flavorful/flavorful' },
            { wit: `${WIT_FIXTURE_DIR}/issue-926`, worldName: 'test:issue-926/issue-926' },
            { wit: `${WIT_FIXTURE_DIR}/js-reserved-word.wit`, worldName: 'fixtures:js-reserved-word/imports' },
            { wit: `${WIT_FIXTURE_DIR}/js-reserved-word.wit`, worldName: 'fixtures:js-reserved-word/exports' },
            { wit: `${WIT_FIXTURE_DIR}/named-async-types.wit`, worldName: 'test:named-async-types/named-async-types' },
            { wit: `${WIT_FIXTURE_DIR}/declaration-names`, worldName: 'test:declaration-names/shadowed-globals-world' },
            {
                wit: `${WIT_FIXTURE_DIR}/declaration-names`,
                worldName: 'test:declaration-names/variant-case-names-world',
            },
            { wit: `${WIT_FIXTURE_DIR}/declaration-names`, worldName: 'test:declaration-names/function-names-world' },
            { wit: `${WIT_FIXTURE_DIR}/declaration-names`, worldName: 'test:declaration-names/versions-world' },
            { wit: `${WIT_FIXTURE_DIR}/declaration-names`, worldName: 'test:declaration-names/world-imports-world' },
        ].flatMap((fixture) => [
            { ...fixture, name: 'host', generate: generateHostTypes },
            { ...fixture, name: 'guest', generate: generateGuestTypes },
        ]),
    )('declarations type-check ($worldName, $name)', async ({ wit, worldName, generate }) => {
        const files = await generate(wit, { worldName });
        assert.deepStrictEqual(await typeCheckDeclarations(files), []);
    });

    test.concurrent.each([
        { name: 'host', generate: generateHostTypes },
        { name: 'guest', generate: generateGuestTypes },
    ])('interfaces differing only in version each have a declaration file ($name)', async ({ generate }) => {
        const files = await generate(`${WIT_FIXTURE_DIR}/declaration-names`, {
            worldName: 'test:declaration-names/versions-world',
        });
        assert.sameMembers(Object.keys(files), [
            'versions-world.d.ts',
            'interfaces/test-versioned-api-1-0-0.d.ts',
            'interfaces/test-versioned-api-1-1-0.d.ts',
            'interfaces/test-versioned-api-2-0-0.d.ts',
        ]);
        const latest = Buffer.from(files['interfaces/test-versioned-api-2-0-0.d.ts']).toString();
        assert.include(latest, 'id: bigint,');
    });

    test.concurrent.each([
        { name: 'host', generate: generateHostTypes },
        { name: 'guest', generate: generateGuestTypes },
    ])('globals shadowed by WIT type names are referenced through globalThis ($name)', async ({ generate }) => {
        const files = await generate(`${WIT_FIXTURE_DIR}/declaration-names`, {
            worldName: 'test:declaration-names/shadowed-globals-world',
        });
        const source = Buffer.from(files['interfaces/test-declaration-names-shadowed-globals.d.ts']).toString();
        assert.include(source, 'export function bytes(bytes: globalThis.Uint8Array): globalThis.Uint8Array;');
        assert.include(source, 'strings: globalThis.Array<string>, array: Array');
        assert.include(source, 'entries: globalThis.Map<string, number>, sizes: Map');
        assert.include(source, 'nested: Option_<number | undefined>, choice: Option');
        assert.include(source, "export type Option_<T> = { tag: 'none' } | { tag: 'some', val: T };");
        assert.include(source, 'outcome: Result): globalThis.Array<Result_<number, string>>');
    });

    test.concurrent.each([
        { name: 'host', generate: generateHostTypes },
        { name: 'guest', generate: generateGuestTypes },
    ])('WIT item stability is documented with JSDoc tags ($name)', async ({ generate }) => {
        const files = await generate(`${WIT_FIXTURE_DIR}/stability.wit`, {
            worldName: 'test:stability/stability',
            allFeatures: true,
        });
        // Compare without indentation, which differs between host and guest declarations
        const source = Buffer.from(files['interfaces/test-stability-items.d.ts'])
            .toString()
            .split('\n')
            .map((line) => line.trim())
            .join('\n');

        assert.include(
            source,
            '/**\n* Reads the record.\n*\n* @since 0.1.0\n*/\nexport function read(): StableRecord;',
        );
        assert.include(source, '/**\n* @since 0.1.0\n* @deprecated since 0.2.0\n*/\nexport function old(): OldEnum;');
        assert.include(
            source,
            '/**\n* @experimental Gated by the WIT feature `experimental-items`.\n*/\nexport function experimental(): void;',
        );
        assert.include(source, '/**\n* A stable record.\n*\n* @since 0.1.0\n*/\nexport interface StableRecord {');
        assert.include(source, '* @since 0.1.0\n* @deprecated since 0.2.0\n*/\nexport type OldEnum = "first";');
        assert.notMatch(source, /\*\/\nexport function plain\(\): void;/);
        assert.deepStrictEqual(await typeCheckDeclarations(files), []);
    });

    test('world-level function imports are declared as default exports for guests', async () => {
        const files = await generateGuestTypes(`${WIT_FIXTURE_DIR}/declaration-names`, {
            worldName: 'test:declaration-names/world-imports-world',
        });
        const source = Buffer.from(files['world-imports-world.d.ts']).toString();
        assert.include(
            source,
            [
                "declare module 'lookup-entry' {",
                "  import type { Operation, Entry } from 'test:declaration-names/world-imports-world';",
                '  export { _default as default };',
                '  function _default(key: string): Entry;',
                '}',
            ].join('\n'),
        );

        // A guest module importing each function must type-check against the declarations.
        const dir = await getTmpDir();
        try {
            await writeFiles(files, { baseDir: dir });
            const testFile = join(dir, 'world-imports.mts');
            await copyFile(new URL('./fixtures/typescript/world-imports.mts', import.meta.url), testFile);
            const program = ts.createProgram([testFile, join(dir, 'world-imports-world.d.ts')], {
                noEmit: true,
                strict: true,
                types: [],
                target: ts.ScriptTarget.ESNext,
                module: ts.ModuleKind.NodeNext,
            });
            assert.deepStrictEqual(
                ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
                [],
            );
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test('host declarations leave world-level function imports to the import object', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/declaration-names`, {
            worldName: 'test:declaration-names/world-imports-world',
        });
        assert.notInclude(Buffer.from(files['world-imports-world.d.ts']).toString(), 'declare module');
    });

    test('resource functions named constructor are declared as computed members', async () => {
        const files = await generateGuestTypes(`${WIT_FIXTURE_DIR}/declaration-names`, {
            worldName: 'test:declaration-names/function-names-world',
        });
        const source = Buffer.from(files['interfaces/test-declaration-names-function-names.d.ts']).toString();
        assert.include(source, 'constructor(name: string)');
        assert.include(source, '["constructor"](): number;');
        assert.include(source, 'static ["constructor"](): number;');
    });

    test('variant cases named like other declarations are inlined', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/declaration-names`, {
            worldName: 'test:declaration-names/variant-case-names-world',
        });
        const source = Buffer.from(files['interfaces/test-declaration-names-variant-case-names.d.ts']).toString();

        // `shape.round-circle` and `shape-round.circle` would both be `ShapeRoundCircle`
        assert.notInclude(source, 'ShapeRoundCircle');
        assert.include(
            source,
            "export type Shape =\n  | {\n    tag: 'round-circle',\n    val: number,\n  }\n  | ShapeSquare;",
        );
        assert.include(source, "export type ShapeRound =\n  | {\n    tag: 'circle',\n    val: number,\n  };");
        assert.strictEqual(source.match(/export interface OperationCreate/g)?.length, 1);
        assert.include(source, 'export interface OperationCancel');
    });
    test.concurrent.each([
        { name: 'host', generate: generateHostTypes },
        { name: 'guest', generate: generateGuestTypes },
    ])('same-named interface types and functions stay scoped ($name)', async ({ generate }) => {
        const witPath = fileURLToPath(
            new URL('./fixtures/components/runtime/same-named-resources/world.wit', import.meta.url),
        );
        const files = await generate(witPath, { worldName: 'example:resources/resources' });
        for (const name of ['first', 'second']) {
            const source = Buffer.from(files[`interfaces/example-resources-${name}.d.ts`]).toString();
            assert.include(source, 'export type Value = number;');
            assert.include(source, 'export type ValueAlias = Value;');
            assert.include(source, 'export type TokenAlias = Token;');
            assert.include(source, 'export interface Payload');
            assert.include(source, 'export type State = ');
            assert.include(source, 'export interface Permissions');
            assert.include(source, 'export type Choice = ');
            assert.include(source, 'export class Token');
            assert.include(source, 'export function getValue(): Value;');
            assert.include(source, 'export function roundtrip(other: TokenAlias): TokenAlias;');
        }
    });

    test.concurrent.each([
        { name: 'host', generate: generateHostTypes, specifier: './example-resources-bridge.js' },
        { name: 'guest', generate: generateGuestTypes, specifier: 'example:resources/bridge' },
    ])(
        'renamed aliases keep their defining interface through alias chains ($name)',
        async ({ generate, specifier }) => {
            const witPath = fileURLToPath(
                new URL('./fixtures/components/runtime/same-named-resources/world.wit', import.meta.url),
            );
            const files = await generate(witPath, { worldName: 'example:resources/alias-chains' });
            const source = Buffer.from(files['interfaces/example-resources-forwarded.d.ts']).toString();
            assert.include(source, `export type Token = import('${specifier}').FirstToken;`);
            assert.include(source, `export type OtherToken = import('${specifier}').SecondToken;`);
            assert.include(source, `export type Value = import('${specifier}').FirstValue;`);
        },
    );

    test('type generation (host)', async () => {
        const files = await generateHostTypes(`${JCO_WIT_FIXTURE_DIR}/flavorful`, {
            worldName: 'test:flavorful/flavorful',
        });
        assert.strictEqual(Object.keys(files).length, 2);
        assert.strictEqual(Object.keys(files)[0], 'flavorful.d.ts');
        assert.strictEqual(Object.keys(files)[1], 'interfaces/test-flavorful-test.d.ts');
        assert.ok(
            Buffer.from(files[Object.keys(files)[0]]).includes(
                "export * as test from './interfaces/test-flavorful-test.js'",
            ),
        );
        assert.ok(Buffer.from(files[Object.keys(files)[1]]).includes('export type ListInAlias = '));
    });

    test('type generation (guest)', async () => {
        const files = await generateGuestTypes(`${JCO_WIT_FIXTURE_DIR}/flavorful`, {
            worldName: 'test:flavorful/flavorful',
            guest: true,
        });
        assert.strictEqual(Object.keys(files).length, 2);
        assert.strictEqual(Object.keys(files)[1], 'interfaces/test-flavorful-test.d.ts');
        assert.ok(Buffer.from(files[Object.keys(files)[0]]).includes("declare module 'test:flavorful/flavorful' {"));
        assert.ok(Buffer.from(files[Object.keys(files)[1]]).includes("declare module 'test:flavorful/test' {"));
    });

    // https://github.com/bytecodealliance/jco/issues/624
    test('invalid js identifiers (guest import)', async () => {
        const files = await generateGuestTypes(`${WIT_FIXTURE_DIR}/js-reserved-word.wit`, {
            worldName: 'fixtures:js-reserved-word/imports',
        });

        assert.strictEqual(Object.keys(files).length, 2);
        assert.strictEqual(Object.keys(files)[1], 'interfaces/fixtures-js-reserved-word-example.d.ts');

        const [worldDeclaration, interfaceDeclaration] = Object.values(files);
        const worldDeclarationContent = Buffer.from(worldDeclaration);
        const interfaceDeclarationContent = Buffer.from(interfaceDeclaration);

        assert.ok(worldDeclarationContent.includes("declare module 'fixtures:js-reserved-word/imports' {"));
        assert.ok(interfaceDeclarationContent.includes("declare module 'fixtures:js-reserved-word/example' {"));
        assert(interfaceDeclarationContent.includes('export { _delete as delete };'));
        assert(interfaceDeclarationContent.includes('function _delete'));
    });

    // https://github.com/bytecodealliance/jco/issues/624
    test('invalid js identifiers (host import)', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/js-reserved-word.wit`, {
            worldName: 'fixtures:js-reserved-word/imports',
        });

        assert.strictEqual(Object.keys(files).length, 2);
        assert.strictEqual(Object.keys(files)[1], 'interfaces/fixtures-js-reserved-word-example.d.ts');

        const [worldDeclaration, interfaceDeclaration] = Object.values(files);
        const worldDeclarationContent = Buffer.from(worldDeclaration);
        const interfaceDeclarationContent = Buffer.from(interfaceDeclaration);

        assert(worldDeclarationContent.includes('export type * as FixturesJsReservedWordExample'));
        assert(interfaceDeclarationContent.includes('@module Interface fixtures:js-reserved-word/example'));

        assert(interfaceDeclarationContent.includes('export { _delete as delete };'));
        assert(interfaceDeclarationContent.includes('function _delete'));
    });

    // https://github.com/bytecodealliance/jco/issues/627
    test('bare exports with ancillary types', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/bare-export-with-result.wit`, {
            worldName: 'fixtures:bare-export-with-result/component',
            guest: true,
        });

        assert.strictEqual(Object.keys(files).length, 1);
        assert.strictEqual(Object.keys(files)[0], 'component.d.ts');

        const [worldDeclaration] = Object.values(files);
        const worldDeclarationContent = new TextDecoder().decode(worldDeclaration);

        assert.include(worldDeclarationContent, 'export type Result<T, E>');
        assert.include(worldDeclarationContent, 'declare module');
    });

    // Labeled imports via the component model `implements` feature alias
    // each label to the shared interface module.
    test('labeled imports (implements) alias each label', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/implements`, {
            worldName: 'test:implements/imports-labeled',
        });
        const worldDtsKey = Object.keys(files).find((f) => f.endsWith('imports-labeled.d.ts'));
        assert.ok(worldDtsKey, 'world d.ts was generated');
        const worldDts = Buffer.from(files[worldDtsKey]).toString();
        assert.include(worldDts, "export type * as Primary from './interfaces/test-implements-logger.js'");
        assert.include(worldDts, "export type * as Secondary from './interfaces/test-implements-logger.js'");
        assert.include(worldDts, "export type * as Kv from './interfaces/test-implements-store.js'");
        // The shared interface module is generated once
        assert.ok(files['interfaces/test-implements-logger.d.ts']);
    });

    test('worlds with external-ids', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/implements`, {
            worldName: 'test:implements/with-external-ids',
        });
        const worldDtsKey = Object.keys(files).find((f) => f.endsWith('with-external-ids.d.ts'));
        assert.ok(worldDtsKey, 'world d.ts was generated');
        const worldDts = Buffer.from(files[worldDtsKey]).toString();
        assert.include(worldDts, 'export type * as Primary');
        assert.include(worldDts, 'export type * as Secondary');
    });

    test('named stream and future types', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/named-async-types.wit`, {
            worldName: 'test:named-async-types/named-async-types',
        });

        // Check the public type contract without depending on declaration formatting
        // or spelling (for example, intersections that add optional disposal).
        const dir = await getTmpDir();
        try {
            await writeFiles(files, { baseDir: dir });
            const testFile = join(dir, 'named-async-types.mts');
            await copyFile(new URL('./fixtures/typescript/named-async-types.mts', import.meta.url), testFile);
            const program = ts.createProgram([testFile], {
                noEmit: true,
                strict: true,
                types: [],
                target: ts.ScriptTarget.ESNext,
                module: ts.ModuleKind.NodeNext,
            });
            assert.deepStrictEqual(
                ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
                [],
            );
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    // https://github.com/bytecodealliance/jco/issues/926
    test('preserves named variant case interfaces that do not collide by default', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/issue-926`, {
            worldName: 'test:issue-926/issue-926',
        });
        const declaration = Buffer.from(files['interfaces/test-issue-926-operations.d.ts']).toString();

        // The `create` and `edit` cases would be declared as `OperationCreate` and
        // `OperationEdit`, the names of the records they carry, so they are inlined.
        assert.include(
            declaration,
            `export type Operation =\n  | {\n    /**\n     * Creates an operation.\n     */\n    tag: 'create',\n    val: OperationCreate,\n  }\n  | {\n    tag: 'edit',\n    val: OperationEdit,\n  }\n  | OperationCancel;`,
        );
        assert.strictEqual(declaration.match(/export interface OperationCreate/g)?.length, 1);
        assert.strictEqual(declaration.match(/export interface OperationEdit/g)?.length, 1);
        assert.strictEqual(declaration.match(/export interface OperationCancel/g)?.length, 1);
    });

    test('can inline variant cases to avoid WIT type name collisions', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/issue-926`, {
            worldName: 'test:issue-926/issue-926',
            variantsInlineCases: true,
        });
        const declaration = Buffer.from(files['interfaces/test-issue-926-operations.d.ts']).toString();

        assert.include(
            declaration,
            `export type Operation =\n  | {\n    /**\n     * Creates an operation.\n     */\n    tag: 'create',\n    val: OperationCreate,\n  }\n  | {\n    tag: 'edit',\n    val: OperationEdit,\n  }\n  | {\n    tag: 'cancel',\n  };`,
        );
        assert.strictEqual(declaration.match(/export interface OperationCreate/g)?.length, 1);
        assert.strictEqual(declaration.match(/export interface OperationEdit/g)?.length, 1);
        assert.notInclude(declaration, 'export interface OperationCancel');
    });
});
