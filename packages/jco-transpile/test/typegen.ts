import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

import { suite, test, assert } from 'vitest';

import { JCO_WIT_FIXTURE_DIR, typeCheckGenerated, WIT_FIXTURE_DIR } from './helpers.js';

import { generateGuestTypes, generateHostTypes } from '../src/typegen.js';

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
                worldName: 'test:declaration-names/shadowed-world-globals-world',
            },
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
        assert.deepStrictEqual(await typeCheckGenerated(files), []);
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
        assert.include(
            source,
            '/**\n* A stable resource.\n*\n* @since 0.1.0\n* @deprecated since 0.2.0\n*/\nexport class Handle',
        );

        // A type used from another interface carries the tags of the `use`, and
        // nothing else of the interface takes them instead.
        const trim = (name: string) =>
            Buffer.from(files[name])
                .toString()
                .split('\n')
                .map((line) => line.trim())
                .join('\n');
        const users = trim('interfaces/test-stability-users.d.ts');
        assert.include(users, '/**\n* @since 0.2.0\n*/\nexport type OldEnum = import(');
        assert.strictEqual(users.split('@since').length - 1, 1);

        // A type of the world itself is documented once, with its tags.
        const world = trim('stability.d.ts');
        assert.include(world, '/**\n* @since 0.1.0\n* @deprecated since 0.2.0\n*/\nexport interface Legacy {');
        assert.strictEqual(world.split('@deprecated').length - 1, 1);
        assert.deepStrictEqual(await typeCheckGenerated(files), []);
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
                '  /**',
                '  * @throws {Error & { payload: string }} The error of the result, as the `payload` of the thrown error.',
                '  */',
                '  function _default(key: string): Entry;',
                '}',
            ].join('\n'),
        );

        // A guest module importing each function must type-check against the declarations.
        assert.deepStrictEqual(await typeCheckGenerated(files, ['world-imports.mts']), []);
    });

    test('generic code narrows the Result helper type by default', async () => {
        const files = await generateGuestTypes(`${WIT_FIXTURE_DIR}/result-payloads.wit`, {
            worldName: 'test:result-payloads/result-payloads',
        });
        const source = Buffer.from(files['interfaces/test-result-payloads-payloads.d.ts']).toString();
        assert.include(source, "export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };");
        assert.include(source, 'onlyErr: Result<void, string>,');
        assert.deepStrictEqual(await typeCheckGenerated(files, ['result-generic.mts']), []);
    });

    test('result arms without a payload do not require a value when their payloads are optional', async () => {
        const files = await generateGuestTypes(`${WIT_FIXTURE_DIR}/result-payloads.wit`, {
            worldName: 'test:result-payloads/result-payloads',
            optionalResultPayloads: true,
        });
        const source = Buffer.from(files['interfaces/test-result-payloads-payloads.d.ts']).toString();
        assert.include(source, 'neither: Result<void, void>,');
        assert.include(source, 'onlyErr: Result<void, string>,');
        assert.include(source, 'onlyOk: Result<number, void>,');
        assert.include(source, "([T] extends [void] ? { tag: 'ok', val?: T } : { tag: 'ok', val: T })");
        assert.include(source, "([E] extends [void] ? { tag: 'err', val?: E } : { tag: 'err', val: E })");

        // A guest module building such results must type-check against the declarations.
        assert.deepStrictEqual(await typeCheckGenerated(files, ['result-payloads.mts']), []);
    });

    test.concurrent.each([
        {
            name: 'host',
            generate: generateHostTypes,
            // Specifiers of the types interface, as seen from each side of another interface
            typesFromImportSide: './test-interface-sides-types.js',
            typesFromExportSide: './test-interface-sides-types.js',
            importedTypesFromExportSide: '../test-interface-sides-types.js',
            sinkReexport: './exports/test-interface-sides-sink.js',
            disposableSide: 'interfaces/exports/test-interface-sides-types.d.ts',
            implementedSide: 'interfaces/test-interface-sides-types.d.ts',
        },
        {
            name: 'guest',
            generate: generateGuestTypes,
            typesFromImportSide: 'test:interface-sides/types',
            typesFromExportSide: 'jco:exports/test:interface-sides/types',
            importedTypesFromExportSide: 'test:interface-sides/types',
            sinkReexport: 'jco:exports/test:interface-sides/sink',
            disposableSide: 'interfaces/test-interface-sides-types.d.ts',
            implementedSide: 'interfaces/exports/test-interface-sides-types.d.ts',
        },
    ])('the import and export sides of an interface are declared separately ($name)', async (sides) => {
        const fixture = `${WIT_FIXTURE_DIR}/interface-sides.wit`;
        const read = (files: Record<string, Uint8Array>, name: string) => Buffer.from(files[name]).toString();

        const both = await sides.generate(fixture, { worldName: 'test:interface-sides/both-sides' });
        assert.sameMembers(Object.keys(both), [
            'both-sides.d.ts',
            'interfaces/test-interface-sides-types.d.ts',
            'interfaces/test-interface-sides-store.d.ts',
            'interfaces/exports/test-interface-sides-types.d.ts',
            'interfaces/exports/test-interface-sides-store.d.ts',
        ]);
        // Only the side that receives resources from the component model disposes of them.
        assert.include(read(both, sides.disposableSide), 'export class Shape implements Disposable {');
        assert.include(read(both, sides.implementedSide), 'export class Shape {');
        // Each side of an interface uses the types of the same side of another.
        assert.include(
            read(both, 'interfaces/test-interface-sides-store.d.ts'),
            `export type Shape = import('${sides.typesFromImportSide}').Shape;`,
        );
        assert.include(
            read(both, 'interfaces/exports/test-interface-sides-store.d.ts'),
            `export type Shape = import('${sides.typesFromExportSide}').Shape;`,
        );
        assert.deepStrictEqual(await typeCheckGenerated(both), []);

        // An exported interface uses the import side of an interface that the world does not export.
        const exportOnly = await sides.generate(fixture, { worldName: 'test:interface-sides/export-only' });
        assert.include(
            read(exportOnly, 'interfaces/exports/test-interface-sides-sink.d.ts'),
            `export type Shape = import('${sides.importedTypesFromExportSide}').Shape;`,
        );
        // The export side of an interface that the world only exports stays
        // reachable where the declaration of the interface used to be.
        assert.include(
            read(exportOnly, 'interfaces/test-interface-sides-sink.d.ts'),
            `export * from '${sides.sinkReexport}';`,
        );
        assert.deepStrictEqual(await typeCheckGenerated(exportOnly), []);
    });

    test('resources that the bindings provide are nominal types', async () => {
        const opts = { worldName: 'test:interface-sides/both-sides' };
        const fixture = `${WIT_FIXTURE_DIR}/interface-sides.wit`;
        const read = (files: Record<string, Uint8Array>, name: string) => Buffer.from(files[name]).toString();
        const brand = "readonly $brand: 'test:interface-sides/types#shape';";

        const host = await generateHostTypes(fixture, opts);
        assert.include(read(host, 'interfaces/exports/test-interface-sides-types.d.ts'), brand);
        assert.notInclude(read(host, 'interfaces/test-interface-sides-types.d.ts'), brand);

        const guest = await generateGuestTypes(fixture, opts);
        assert.include(read(guest, 'interfaces/test-interface-sides-types.d.ts'), brand);
        assert.notInclude(read(guest, 'interfaces/exports/test-interface-sides-types.d.ts'), brand);

        // A host module must type-check against the declarations, apart from
        // the look-alike resources that it marks as errors.
        assert.deepStrictEqual(await typeCheckGenerated(host, ['resource-brands.mts']), []);
    });

    test('resources of semver compatible versions of an interface are the same type', async () => {
        const host = await generateHostTypes(`${WIT_FIXTURE_DIR}/resource-versions.wit`, {
            worldName: 'test:resource-versions/versions',
        });
        const read = (name: string) => Buffer.from(host[name]).toString();
        const brand = "readonly $brand: 'test:versioned/things@0.2#thing';";
        assert.include(read('interfaces/exports/test-versioned-things-0-2-3.d.ts'), brand);
        assert.include(read('interfaces/exports/test-versioned-things-0-2-6.d.ts'), brand);
        assert.include(
            read('interfaces/exports/test-versioned-things-0-3-0.d.ts'),
            "readonly $brand: 'test:versioned/things@0.3#thing';",
        );

        // Only one of the versions is exported under the short name of the interface.
        const world = read('versions.d.ts');
        assert.include(world, "export * as things from './interfaces/exports/test-versioned-things-0-2-3.js';");
        assert.strictEqual(world.split('export * as things ').length - 1, 1);

        assert.deepStrictEqual(await typeCheckGenerated(host, ['resource-versions.mts']), []);
    });

    test('the errors of results are documented and typed', async () => {
        const opts = { worldName: 'test:result-errors/result-errors' };
        const fixture = `${WIT_FIXTURE_DIR}/result-errors.wit`;
        const read = (files: Record<string, Uint8Array>, name: string) => Buffer.from(files[name]).toString();
        const importSide = 'interfaces/test-result-errors-failures.d.ts';
        const exportSide = 'interfaces/exports/test-result-errors-failures.d.ts';
        const caught = 'The error of the result, as the `payload` of the thrown error.';
        const thrown = 'To return the error of the result, throw it, or an `Error` that has it as its `payload`.';

        // A host catches the errors of the functions that the component exports.
        const host = await generateHostTypes(fixture, opts);
        const hostExports = read(host, exportSide);
        assert.include(
            hostExports,
            ['/**', ' * Looks a key up.', ' *', ` * @throws {ErrorCodeError} ${caught}`, ' */'].join('\n'),
        );
        assert.include(hostExports, `@throws {Error & { payload: string }} ${caught}`);
        assert.include(hostExports, `@throws {Error & { payload: undefined }} ${caught}`);
        assert.include(
            hostExports,
            [
                'export class ErrorCodeError extends Error {',
                '  constructor(payload: ErrorCode);',
                '  readonly payload: ErrorCode;',
                '}',
            ].join('\n'),
        );
        // The type `problem-error` already has the name of the class that `problem` would get.
        assert.include(hostExports, `@throws {Error & { payload: Problem }} ${caught}`);
        assert.notInclude(hostExports, 'export class ProblemError');
        assert.include(read(host, 'result-errors.d.ts'), `@throws {Error & { payload: string }} ${caught}`);

        // A host throws to return the errors of the functions that the component imports.
        const hostImports = read(host, importSide);
        assert.include(hostImports, `@throws {ErrorCode} ${thrown}`);
        assert.include(hostImports, `@throws {undefined} ${thrown}`);
        assert.notInclude(hostImports, 'export class ErrorCodeError');
        assert.deepStrictEqual(await typeCheckGenerated(host), []);

        // A guest has no error classes, as its runtime provides none.
        const guest = await generateGuestTypes(fixture, opts);
        assert.include(read(guest, importSide), `@throws {Error & { payload: ErrorCode }} ${caught}`);
        assert.include(read(guest, exportSide), `@throws {ErrorCode} ${thrown}`);
        assert.notInclude(read(guest, importSide), 'export class ErrorCodeError');
        assert.deepStrictEqual(await typeCheckGenerated(guest), []);

        // No function without a result has the tag.
        for (const source of [hostExports, hostImports]) {
            assert.notMatch(source, /@throws[^\n]*\n \*\/\nexport function plain/);
            assert.include(source, '\nexport function plain(): number;');
        }
    });

    test('globals shadowed by world-level types are referenced through globalThis', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/declaration-names`, {
            worldName: 'test:declaration-names/shadowed-world-globals-world',
            instantiation: 'async',
        });
        const source = Buffer.from(files['shadowed-world-globals-world.d.ts']).toString();
        // The world's own types keep their names...
        assert.include(source, 'export interface Promise {');
        assert.include(source, 'settle(promise: Promise, record: Record): Promise,');
        // ...while the declarations that every world has refer to the globals.
        assert.include(source, 'whenIdle(): globalThis.Promise<void>;');
        assert.include(source, 'value is globalThis.Error & { readonly payload: unknown }');
        assert.include(source, 'imports: globalThis.Record<string, any>');
        assert.include(source, '): ShadowedWorldGlobalsWorld | globalThis.Promise<ShadowedWorldGlobalsWorld>;');
        assert.deepStrictEqual(await typeCheckGenerated(files), []);
    });

    test('async functions that return a future document their two awaitable layers', async () => {
        const opts = { worldName: 'test:async-futures/async-futures' };
        const fixture = `${WIT_FIXTURE_DIR}/async-futures.wit`;
        // Compare without indentation, which differs between the declarations of a world and of an interface
        const read = (files: Record<string, Uint8Array>, name: string) =>
            Buffer.from(files[name])
                .toString()
                .split('\n')
                .map((line) => line.trim())
                .join('\n');
        const note = [
            '* @returns A promise of the future, not of its value: each `await` unwraps one of the two layers.',
            '* TypeScript types the first `await` as the value already, whereas `.then()` is typed layer by layer.',
            '*/',
        ].join('\n');

        // The note is for the functions that a host calls on the component.
        const host = await generateHostTypes(fixture, opts);
        const hostExports = read(host, 'interfaces/exports/test-async-futures-deliveries.d.ts');
        assert.include(hostExports, `${note}\nexport function later(): Promise<PromiseLike<string>`);
        assert.include(read(host, 'async-futures.d.ts'), `${note}\nexport function later(): `);
        // Neither a function that returns no future, nor one that is not async, has two layers.
        assert.strictEqual(hostExports.split('@returns').length - 1, 1);
        assert.notInclude(read(host, 'interfaces/test-async-futures-deliveries.d.ts'), '@returns');
        assert.deepStrictEqual(await typeCheckGenerated(host), []);

        const guest = await generateGuestTypes(fixture, opts);
        for (const source of Object.values(guest)) {
            assert.notInclude(Buffer.from(source).toString(), '@returns');
        }
    });

    test('the import object declares the helper types of world-level function imports', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/declaration-names`, {
            worldName: 'test:declaration-names/world-imports-world',
            instantiation: 'async',
        });
        const source = Buffer.from(files['world-imports-world.d.ts']).toString();
        assert.include(source, 'export interface ImportObject {');
        assert.include(source, 'export type Option<T> = ');
        assert.include(source, 'export type Result<T, E> = ');
        assert.deepStrictEqual(await typeCheckGenerated(files), []);
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
            const source = Buffer.from(files[`interfaces/exports/example-resources-${name}.d.ts`]).toString();
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
        { name: 'guest', generate: generateGuestTypes, specifier: 'jco:exports/example:resources/bridge' },
    ])(
        'renamed aliases keep their defining interface through alias chains ($name)',
        async ({ generate, specifier }) => {
            const witPath = fileURLToPath(
                new URL('./fixtures/components/runtime/same-named-resources/world.wit', import.meta.url),
            );
            const files = await generate(witPath, { worldName: 'example:resources/alias-chains' });
            const source = Buffer.from(files['interfaces/exports/example-resources-forwarded.d.ts']).toString();
            assert.include(source, `export type Token = import('${specifier}').FirstToken;`);
            assert.include(source, `export type OtherToken = import('${specifier}').SecondToken;`);
            assert.include(source, `export type Value = import('${specifier}').FirstValue;`);
        },
    );

    test('type generation (host)', async () => {
        const files = await generateHostTypes(`${JCO_WIT_FIXTURE_DIR}/flavorful`, {
            worldName: 'test:flavorful/flavorful',
        });
        assert.sameMembers(Object.keys(files), [
            'flavorful.d.ts',
            'interfaces/test-flavorful-test.d.ts',
            'interfaces/exports/test-flavorful-test.d.ts',
        ]);
        assert.ok(
            Buffer.from(files['flavorful.d.ts']).includes(
                "export * as test from './interfaces/exports/test-flavorful-test.js'",
            ),
        );
        for (const file of ['interfaces/test-flavorful-test.d.ts', 'interfaces/exports/test-flavorful-test.d.ts']) {
            assert.ok(Buffer.from(files[file]).includes('export type ListInAlias = '));
        }
    });

    test('type generation (guest)', async () => {
        const files = await generateGuestTypes(`${JCO_WIT_FIXTURE_DIR}/flavorful`, {
            worldName: 'test:flavorful/flavorful',
            guest: true,
        });
        assert.sameMembers(Object.keys(files), [
            'flavorful.d.ts',
            'interfaces/test-flavorful-test.d.ts',
            'interfaces/exports/test-flavorful-test.d.ts',
        ]);
        assert.ok(Buffer.from(files['flavorful.d.ts']).includes("declare module 'test:flavorful/flavorful' {"));
        assert.ok(
            Buffer.from(files['interfaces/test-flavorful-test.d.ts']).includes(
                "declare module 'test:flavorful/test' {",
            ),
        );
        assert.ok(
            Buffer.from(files['interfaces/exports/test-flavorful-test.d.ts']).includes(
                "declare module 'jco:exports/test:flavorful/test' {",
            ),
        );
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
        assert.deepStrictEqual(await typeCheckGenerated(files, ['named-async-types.mts']), []);
    });

    // https://github.com/bytecodealliance/jco/issues/926
    test('preserves named variant case interfaces that do not collide by default', async () => {
        const files = await generateHostTypes(`${WIT_FIXTURE_DIR}/issue-926`, {
            worldName: 'test:issue-926/issue-926',
        });
        const declaration = Buffer.from(files['interfaces/exports/test-issue-926-operations.d.ts']).toString();

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
        const declaration = Buffer.from(files['interfaces/exports/test-issue-926-operations.d.ts']).toString();

        assert.include(
            declaration,
            `export type Operation =\n  | {\n    /**\n     * Creates an operation.\n     */\n    tag: 'create',\n    val: OperationCreate,\n  }\n  | {\n    tag: 'edit',\n    val: OperationEdit,\n  }\n  | {\n    tag: 'cancel',\n  };`,
        );
        assert.strictEqual(declaration.match(/export interface OperationCreate/g)?.length, 1);
        assert.strictEqual(declaration.match(/export interface OperationEdit/g)?.length, 1);
        assert.notInclude(declaration, 'export interface OperationCancel');
    });
});
