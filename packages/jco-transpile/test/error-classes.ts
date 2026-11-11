import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';
import ts from 'typescript-compiler-api';

import { COMPONENT_FIXTURES_DIR } from './common.js';
import { getTmpDir } from './helpers.js';
import { transpileBytes, writeFiles } from './transpilation.js';
import { parse } from '../src/wasm-tools.js';

interface ComponentError extends Error {
    readonly payload: unknown;
}

interface Failures {
    check(fail: boolean): number;
    recheck(fail: boolean): void;
    parse(fail: boolean): number;
    ErrorCodeError?: new (payload: string) => ComponentError;
}

interface Component {
    failures: Failures;
    _util: { stop(): void; isComponentError(value: unknown): value is ComponentError };
}

/** Transpile the fixture component into `dir` and load it. */
async function load(
    dir: string,
    opts: { instantiation?: 'async' | 'sync'; noComponentErrorWrapping: boolean },
): Promise<Component> {
    const wat = await readFile(join(COMPONENT_FIXTURES_DIR, 'error-classes/component.wat'), 'utf8');
    const { files } = await transpileBytes(await parse(wat), { name: 'component', ...opts });
    await writeFiles(files, { baseDir: dir });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    const module = await import(pathToFileURL(join(dir, 'component.js')).href);
    const getCoreModule = (path: string) => new WebAssembly.Module(files[path]);
    return opts.instantiation ? await module.instantiate(getCoreModule, {}) : module;
}

/** Compile a consumer that narrows caught errors with the exported error class. */
async function checkTypes(dir: string, instantiation: 'async' | 'sync' | undefined) {
    const consumer = join(dir, 'consumer.mts');
    await writeFile(
        consumer,
        `import * as component from './component.js';
        declare const getCoreModule: (path: string) => WebAssembly.Module;
        ${instantiation ? `const instance = await component.instantiate(getCoreModule, {});` : 'const instance = component;'}
        const { failures } = instance;
        try {
            failures.check(true);
        } catch (error: unknown) {
            if (error instanceof failures.ErrorCodeError) {
                const payload: 'not-found' | 'denied' = error.payload;
                const message: string = error.message;
                // @ts-expect-error The payload has the error type of the result.
                const number: number = error.payload;
            }
        }
        // @ts-expect-error A function with an unnamed error type has no error class.
        failures.StringError;`,
    );
    const program = ts.createProgram([consumer], {
        noEmit: true,
        strict: true,
        types: [],
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
    });
    assert.deepEqual(
        ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
        [],
    );
}

/** Catch a thrown value without relying on any error properties. */
function caught(call: () => unknown): unknown {
    try {
        call();
    } catch (error) {
        return error;
    }
    assert.fail('expected a declared error');
}

for (const instantiation of [undefined, 'sync', 'async'] as const) {
    test.concurrent(`named result errors are thrown as exported classes (instantiation=${instantiation})`, async () => {
        const dir = await getTmpDir();
        try {
            const instance = await load(dir, { instantiation, noComponentErrorWrapping: false });
            const { failures } = instance;
            const { ErrorCodeError } = failures;
            assert.isFunction(ErrorCodeError);
            assert.strictEqual(failures.check(false), 42);

            // Each function with the named error type throws the same class.
            for (const [call, payload] of [
                [() => failures.check(true), 'denied'],
                [() => failures.recheck(true), 'not-found'],
            ] as const) {
                const error = caught(call);
                assert.instanceOf(error, ErrorCodeError);
                assert.instanceOf(error, Error);
                assert.isTrue(instance._util.isComponentError(error));
                assert.strictEqual((error as ComponentError).payload, payload);
            }

            // An error type without a name has no class of its own.
            const unnamed = caught(() => failures.parse(true));
            assert.notInstanceOf(unnamed, ErrorCodeError);
            assert.isTrue(instance._util.isComponentError(unnamed));
            assert.strictEqual((unnamed as ComponentError).payload, 'bad input');
            assert.strictEqual((unnamed as ComponentError).message, 'bad input');

            instance._util.stop();
            await checkTypes(dir, instantiation);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
}

test.concurrent('raw result errors have no error classes', async () => {
    const dir = await getTmpDir();
    try {
        const instance = await load(dir, { noComponentErrorWrapping: true });
        assert.notProperty(instance.failures, 'ErrorCodeError');
        assert.strictEqual(
            caught(() => instance.failures.check(true)),
            'denied',
        );
        const declarations = await readFile(join(dir, 'interfaces/exports/test-error-classes-failures.d.ts'), 'utf8');
        assert.notInclude(declarations, 'ErrorCodeError');
        assert.include(declarations, '@throws {ErrorCode} The error of the result.');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
