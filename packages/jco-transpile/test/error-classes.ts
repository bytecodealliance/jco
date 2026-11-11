import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { assert, test } from 'vitest';

import { LOCAL_TEST_COMPONENTS_DIR } from './common.js';
import { caught, loadTranspiledComponent, typeCheck } from './helpers.js';

const INTERFACE = 'jco:test-components/result-failures';
const DECLARATIONS = 'interfaces/exports/jco-test-components-result-failures.d.ts';

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
    [INTERFACE]: Failures;
    _util: { stop(): void; isComponentError(value: unknown): value is ComponentError };
}

/**
 * Transpile the test component and load it.
 *
 * @param opts - how the component is instantiated, and whether the errors of results are wrapped
 */
async function load(opts: { instantiation?: 'async' | 'sync'; noComponentErrorWrapping: boolean }) {
    const bytes = await readFile(join(LOCAL_TEST_COMPONENTS_DIR, 'result-error-classes.wasm'));
    const loaded = await loadTranspiledComponent(bytes, opts, new WASIShim().getImportObject());
    const instance: Component = loaded.instance;
    return { ...loaded, instance };
}

/** Compile a consumer that narrows caught errors with the exported error class. */
async function checkTypes(dir: string, instantiation: 'async' | 'sync' | undefined) {
    const consumer = join(dir, 'consumer.mts');
    await writeFile(
        consumer,
        `import * as component from './component.js';
        ${
            instantiation
                ? `declare const getCoreModule: (path: string) => WebAssembly.Module;
        declare const imports: Parameters<typeof component.instantiate>[1];
        const instance = await component.instantiate(getCoreModule, imports);`
                : 'const instance = component;'
        }
        const failures = instance.resultFailures;
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
    assert.deepEqual(typeCheck([consumer]), []);
}

for (const instantiation of [undefined, 'sync', 'async'] as const) {
    test.concurrent(`named result errors are thrown as exported classes (instantiation=${instantiation})`, async () => {
        const { instance, dir, cleanup } = await load({ instantiation, noComponentErrorWrapping: false });
        try {
            const failures = instance[INTERFACE];
            const { ErrorCodeError } = failures;
            assert.isFunction(ErrorCodeError);
            assert.strictEqual(failures.check(false), 42);

            // Each function with the named error type throws the same class.
            for (const [call, payload] of [
                [() => failures.check(true), 'denied'],
                [() => failures.recheck(true), 'not-found'],
            ] as const) {
                const error = await caught(call);
                assert.instanceOf(error, ErrorCodeError);
                assert.instanceOf(error, Error);
                assert.isTrue(instance._util.isComponentError(error));
                assert.strictEqual((error as ComponentError).payload, payload);
            }

            // An error type without a name has no class of its own.
            const unnamed = await caught(() => failures.parse(true));
            assert.notInstanceOf(unnamed, ErrorCodeError);
            assert.isTrue(instance._util.isComponentError(unnamed));
            assert.strictEqual((unnamed as ComponentError).payload, 'bad input');
            assert.strictEqual((unnamed as ComponentError).message, 'bad input');

            instance._util.stop();
            await checkTypes(dir, instantiation);
        } finally {
            await cleanup();
        }
    });
}

test.concurrent('raw result errors have no error classes', async () => {
    const { instance, dir, cleanup } = await load({ noComponentErrorWrapping: true });
    try {
        assert.notProperty(instance[INTERFACE], 'ErrorCodeError');
        assert.strictEqual(await caught(() => instance[INTERFACE].check(true)), 'denied');
        const declarations = await readFile(join(dir, DECLARATIONS), 'utf8');
        assert.notInclude(declarations, 'ErrorCodeError');
        assert.include(declarations, '@throws {ErrorCode} The error of the result.');
    } finally {
        await cleanup();
    }
});
