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

interface Component {
    runSync(tag: number, fail: number): number;
    run(tag: number, fail: number): Promise<number>;
    ok(): number;
    _util: { stop(): void; isComponentError(value: unknown): value is ComponentError };
}

/** Compile a consumer that narrows caught errors using the generated predicate. */
async function checkTypes(dir: string, instantiation: 'async' | 'sync' | undefined) {
    const consumer = join(dir, 'consumer.mts');
    await writeFile(
        consumer,
        `import * as component from './component.js';
        declare const getCoreModule: (path: string) => WebAssembly.Module;
        ${instantiation ? `const instance = await component.instantiate(getCoreModule, {});` : 'const instance = component;'}
        // @ts-expect-error The error constructor is private.
        instance._util.ComponentError;
        try {
            instance.runSync(1, 0);
        } catch (error: unknown) {
            if (instance._util.isComponentError(error)) {
                const payload: unknown = error.payload;
                const message: string = error.message;
                // @ts-expect-error A declared error may carry any WIT error payload.
                const number: number = error.payload;
            }
        }`,
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

/** Catch a thrown or rejected value without relying on any error properties. */
async function caught(call: () => unknown): Promise<unknown> {
    try {
        await call();
    } catch (error) {
        return error;
    }
    assert.fail('expected a declared error or trap');
}

for (const instantiation of [undefined, 'sync', 'async'] as const) {
    for (const minify of [false, true]) {
        test.concurrent(`isComponentError identifies declared errors (instantiation=${instantiation}, minify=${minify})`, async () => {
            const dir = await getTmpDir();
            try {
                const wat = await readFile(join(COMPONENT_FIXTURES_DIR, 'post-return-traps/result-async.wat'), 'utf8');
                const { files } = await transpileBytes(await parse(wat), {
                    name: 'component',
                    instantiation,
                    noComponentErrorWrapping: false,
                    minify,
                });
                await writeFiles(files, { baseDir: dir });
                await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                const module = await import(pathToFileURL(join(dir, 'component.js')).href);
                const getCoreModule = (path: string) => new WebAssembly.Module(files[path]);
                const instance: Component = instantiation ? await module.instantiate(getCoreModule, {}) : module;
                const { isComponentError } = instance._util;
                assert.isFunction(isComponentError);
                assert.notProperty(instance._util, 'ComponentError');
                assert.strictEqual(instance.runSync(0, 0), 42);

                const declared = await caught(() => instance.runSync(1, 0));
                assert.isTrue(isComponentError(declared));
                assert.instanceOf(declared, Error);
                if (!isComponentError(declared)) {
                    assert.fail('expected a declared WIT error');
                }
                assert.strictEqual(declared.payload, 42);
                assert.strictEqual(instance.ok(), 42);
                for (const other of [
                    new Error('host failure'),
                    Object.assign(new Error(), { name: 'ComponentError', payload: 42 }),
                    { payload: 42 },
                    undefined,
                    null,
                    false,
                    42,
                ]) {
                    assert.isFalse(isComponentError(other));
                }

                if (typeof WebAssembly.Suspending === 'function') {
                    assert.strictEqual(await instance.run(0, 0), 42);
                    assert.isTrue(isComponentError(await caught(() => instance.run(1, 0))));
                }

                if (instantiation) {
                    const second: Component = await module.instantiate(getCoreModule, {});
                    assert.isFalse(second._util.isComponentError(declared));
                    const secondError = await caught(() => second.runSync(1, 0));
                    assert.isTrue(second._util.isComponentError(secondError));
                    assert.isFalse(isComponentError(secondError));
                    second._util.stop();
                }

                const trap = await caught(() => instance.runSync(1, 1));
                assert.instanceOf(trap, WebAssembly.RuntimeError);
                assert.isFalse(isComponentError(trap));
                instance._util.stop();
                if (!minify) {
                    await checkTypes(dir, instantiation);
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });
    }
}

test.concurrent('raw errors and components without results do not expose isComponentError', async () => {
    const wat = await readFile(join(COMPONENT_FIXTURES_DIR, 'post-return-traps/result-async.wat'), 'utf8');
    for (const [component, noComponentErrorWrapping] of [
        [await parse(wat), true],
        [await parse('(component)'), false],
    ] as const) {
        for (const instantiation of [undefined, 'sync', 'async'] as const) {
            const dir = await getTmpDir();
            try {
                const { files } = await transpileBytes(component, {
                    name: 'component',
                    instantiation,
                    noComponentErrorWrapping,
                });
                await writeFiles(files, { baseDir: dir });
                await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
                const module = await import(pathToFileURL(join(dir, 'component.js')).href);
                const getCoreModule = (path: string) => new WebAssembly.Module(files[path]);
                const instance = instantiation ? await module.instantiate(getCoreModule, {}) : module;
                assert.notProperty(instance._util, 'ComponentError');
                assert.notProperty(instance._util, 'isComponentError');
                assert.notInclude(Buffer.from(files['component.d.ts']).toString(), 'ComponentError');
                if (instance.runSync) {
                    assert.strictEqual(await caught(() => instance.runSync(1, 0)), 42);
                }
                instance._util.stop();
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        }
    }
});
