import { mkdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { assert, expect, test } from 'vitest';

import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';

const fixture = fileURLToPath(new URL('../fixtures/components/p3/context-resource-drop.wat', import.meta.url));
const coreUrl = new URL('intrinsics/core.js', defaultRuntimeUrl).href;
const execAsync = promisify(execFile);

async function writeProvider(dir: string, core: string) {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    await mkdir(join(dir, 'provider/intrinsics'), { recursive: true });
    await writeFile(join(dir, 'provider/runtime.js'), 'export const CM_RUNTIME_API_VERSION = 1;');
    for (const suffix of [
        'conversion',
        'js-helper',
        'string',
        'webidl',
        'resource',
        'component',
        'waitable',
        'error-context',
        'async-task',
        'host',
        'lift',
        'lower',
        'future',
        'stream',
    ]) {
        await writeFile(
            join(dir, 'provider/intrinsics/' + suffix + '.js'),
            'export * from ' + JSON.stringify(new URL('intrinsics/' + suffix + '.js', defaultRuntimeUrl).href) + ';',
        );
    }
    await writeFile(join(dir, 'provider/intrinsics/core.js'), core);
}

function providerSource() {
    return `import * as defaults from ${JSON.stringify(coreUrl)};
export * from ${JSON.stringify(coreUrl)};
export const registers = [], constructors = [], errors = [], calls = [];
export function initializeTaskRegisters() {
  const owner = defaults.initializeTaskRegisters(); registers.push(owner); return owner;
}
export function initializeRepTableClass(context) {
  if (Object.keys(context).join() !== 'RuntimeError') throw new Error('broad constructor context');
  const constructor = defaults.initializeRepTableClass(context); constructors.push(constructor); return constructor;
}
export function initializeComponentErrorClass() {
  const constructor = defaults.initializeComponentErrorClass(); errors.push(constructor); return constructor;
}
export function withCurrentTaskMeta(owner, args) {
  if (this !== undefined) throw new Error('unexpected core receiver');
  if (!registers.includes(owner)) throw new Error('detached task register owner');
  calls.push('withCurrentTaskMeta'); return defaults.withCurrentTaskMeta(owner, args);
}
export function instantiateCore(platform, module, imports) {
  calls.push('instantiateCore'); return defaults.instantiateCore(platform, module, imports);
}`;
}

for (const instantiation of ['sync', 'async', undefined] as const) {
    test.concurrent.each([false, true])(`core provider (${instantiation ?? 'direct'}, minify=%s)`, async (minify) => {
        const dir = await getTmpDir();
        try {
            await writeProvider(dir, providerSource());
            const { files } = await transpile(fixture, {
                name: 'core',
                instantiation,
                minify,
                cmRuntimeEsModule: './provider/',
            });
            await writeFiles(files, { baseDir: dir });
            if (!minify) {
                const source = new TextDecoder().decode(files['core.js']);
                assert.notInclude(source, 'class RepTable');
                assert.notInclude(source, 'function _withGlobalCurrentTaskMeta(');
                assert.notInclude(source, 'const CURRENT_TASK_META = {}');
                assert.include(source, 'initializeTaskRegisters');
                assert.include(source, 'initializeRepTableClass');
            }
            const bindings = await import(pathToFileURL(join(dir, 'core.js')).href);
            const provider = await import(pathToFileURL(join(dir, 'provider/intrinsics/core.js')).href);
            let hostInstantiations = 0;
            const instantiateCore = (module: WebAssembly.Module, imports: WebAssembly.Imports) => {
                hostInstantiations++;
                return new WebAssembly.Instance(module, imports);
            };
            const instantiate = () =>
                bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {}, instantiateCore);
            const instances = instantiation ? [await instantiate(), await instantiate()] : [bindings];
            assert.lengthOf(provider.registers, instances.length);
            assert.lengthOf(provider.constructors, instances.length);
            for (const [index, instance] of instances.entries()) {
                instance.run();
                const resource: Disposable = instance.api.make();
                resource[Symbol.dispose]();
                assert.strictEqual(instance.drops(), 2);
                assert.isNull(provider.registers[index].current);
            }
            assert.include(provider.calls, 'withCurrentTaskMeta');
            if (instantiation) {
                assert.isAbove(hostInstantiations, 0);
                assert.notInclude(provider.calls, 'instantiateCore');
                assert.notStrictEqual(provider.registers[0], provider.registers[1]);
                assert.notStrictEqual(provider.constructors[0], provider.constructors[1]);
                assert.notStrictEqual(provider.constructors[0].FREE, provider.constructors[1].FREE);
            } else {
                assert.include(provider.calls, 'instantiateCore');
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test.concurrent.each([false, true])(
        `ComponentError preserves store constructor identity (${instantiation ?? 'direct'}, minify=%s)`,
        async (minify) => {
            const dir = await getTmpDir();
            try {
                await writeProvider(dir, providerSource());
                const input = join(dir, 'error.wat');
                await writeFile(
                    input,
                    `(component
                  (core module $m
                    (memory (export "memory") 1)
                    (data (i32.const 0) "\\01\\00\\00\\00\\2a\\00\\00\\00")
                    (func (export "fail") (result i32) i32.const 0))
                  (core instance $i (instantiate $m))
                  (type $result (result u32 (error u32)))
                  (func (export "fail") (result $result)
                    (canon lift (core func $i "fail") (memory (core memory $i "memory")))))`,
                );
                const { files } = await transpile(input, {
                    name: 'error',
                    instantiation,
                    minify,
                    noComponentErrorWrapping: false,
                    cmRuntimeEsModule: './provider/',
                });
                await writeFiles(files, { baseDir: dir });
                const bindings = await import(pathToFileURL(join(dir, 'error.js')).href);
                const provider = await import(pathToFileURL(join(dir, 'provider/intrinsics/core.js')).href);
                const instantiate = () =>
                    bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
                const instances = instantiation ? [await instantiate(), await instantiate()] : [bindings];
                assert.lengthOf(provider.errors, instances.length);
                for (const [index, instance] of instances.entries()) {
                    let caught: unknown;
                    try {
                        instance.fail();
                    } catch (error) {
                        caught = error;
                    }
                    assert.instanceOf(caught, provider.errors[index]);
                    assert.strictEqual((caught as { payload: unknown }).payload, 42);
                    if (instances.length === 2) {
                        assert.notInstanceOf(caught, provider.errors[1 - index]);
                    }
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        },
    );
}

test.concurrent.each(['initializeRepTableClass', 'withCurrentTaskMeta'])(
    'native ESM rejects a missing selected core export: %s',
    async (missing) => {
        const dir = await getTmpDir();
        try {
            const exports = Object.keys(await import(coreUrl)).filter((name) => name !== missing);
            await writeProvider(dir, `export { ${exports.join(', ')} } from ${JSON.stringify(coreUrl)};`);
            const { files } = await transpile(fixture, {
                name: 'missing',
                instantiation: 'sync',
                cmRuntimeEsModule: './provider/',
            });
            await writeFiles(files, { baseDir: dir });
            // Use the native loader: Vitest's module runner emulates missing exports.
            await expect(execAsync(process.execPath, [join(dir, 'missing.js')])).rejects.toThrow(missing);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);
