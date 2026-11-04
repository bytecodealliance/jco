import { assert, expect, afterAll, beforeAll, suite, test, vi } from 'vitest';

const emptyComponent = new TextEncoder().encode('(component)');
const wit = 'package test:recovery; world recovery { export run: func(); }';

suite('bindgen component recovery', () => {
    let bindgen: typeof import('../src/component.js');
    let transpileBytes: typeof import('../src/transpile.js').transpileBytes;
    let trapExport: string | undefined;
    let generations = 0;
    let compileCount: number;
    let compileSpy;
    let instanceSpy;

    beforeAll(async () => {
        // Inject a native Wasm trap at a core export, inside the real generated
        // component bindings. This poisons the instance without relying on an
        // unfixed Rust panic or a particular unsupported component shape.
        const NativeInstance = WebAssembly.Instance;
        const { trap } = new NativeInstance(
            new WebAssembly.Module(
                new Uint8Array([
                    0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 7, 8, 1, 4, 116, 114, 97, 112, 0, 0, 10,
                    5, 1, 3, 0, 0, 11,
                ]),
            ),
        ).exports;
        compileSpy = vi.spyOn(WebAssembly, 'compile');
        const nativeInstantiate = WebAssembly.instantiate;
        instanceSpy = vi.spyOn(WebAssembly, 'instantiate').mockImplementation(async function (module, imports) {
            const instance = await nativeInstantiate(module, imports);
            if (!('generate' in instance.exports)) {
                return instance;
            }
            generations++;
            const exports = Object.fromEntries(
                Object.entries(instance.exports).map(([name, value]) => [
                    name,
                    typeof value !== 'function'
                        ? value
                        : (...args: unknown[]) => {
                              if (trapExport === name) {
                                  trapExport = undefined;
                                  (trap as () => never)();
                              }
                              return value(...args);
                          },
                ]),
            );
            return { exports } as WebAssembly.Instance;
        });
        bindgen = await import('../src/component.js');
        ({ transpileBytes } = await import('../src/transpile.js'));
        await bindgen.$init;
        await (
            await import('../vendor/wasm-tools.js')
        ).$init;
        compileCount = compileSpy.mock.calls.length;
    });

    afterAll(() => {
        instanceSpy?.mockRestore();
        compileSpy?.mockRestore();
    });

    const calls = [
        ['generate', () => bindgen.generate(emptyComponent, { name: 'recovery' })],
        ['generate-types', () => bindgen.generateTypes('recovery', { wit: { tag: 'source', val: wit } })],
        ['unpack-wit', () => bindgen.unpackWit(undefined, emptyComponent)],
        ['local:js-component-bindgen/scripts#create-world', () => bindgen.scripts.createWorld([], 'quickjs')],
        [
            'local:js-component-bindgen/scripts#create-component',
            () =>
                bindgen.scripts.createComponent({
                    name: 'recovery',
                    source: '',
                    engineWorld: 'test:engine/world',
                    exports: [],
                }),
        ],
    ] as const;

    test.each(calls)('recovers after a trap in %s', async (name, call) => {
        const previousGeneration = generations;
        trapExport = name;
        assert.throws(call, WebAssembly.RuntimeError, /unreachable/);

        // Existing references to the facade's functions must use the replacement.
        await bindgen.$init;
        const result = bindgen.generate(emptyComponent, { name: 'recovery' });
        assert.isNotEmpty(result.files);
        assert.notInstanceOf(result, Promise);
        assert.strictEqual(generations, previousGeneration + 1);

        assert.isNotEmpty(bindgen.generateTypes('recovery', { wit: { tag: 'source', val: wit } }));
        assert.property((await transpileBytes(emptyComponent, { name: 'recovery' })).files, 'recovery.js');
        assert.strictEqual(generations, previousGeneration + 1);
        assert.strictEqual(compileSpy.mock.calls.length, compileCount, 'compiled core modules should be reused');
    });

    test('concurrent requests continue after the first request traps', async () => {
        const previousGeneration = generations;
        trapExport = 'generate';
        const results = await Promise.allSettled([
            transpileBytes(emptyComponent, { name: 'trapping' }),
            transpileBytes(emptyComponent, { name: 'following' }),
            transpileBytes(emptyComponent, { name: 'also-following' }),
        ]);
        assert.strictEqual(results[0].status, 'rejected');
        assert.instanceOf((results[0] as PromiseRejectedResult).reason, WebAssembly.RuntimeError);
        assert.strictEqual(results[1].status, 'fulfilled');
        assert.strictEqual(results[2].status, 'fulfilled');
        assert.strictEqual(generations, previousGeneration + 1);
    });

    test('ordinary input errors preserve the healthy instance', async () => {
        const previousGeneration = generations;
        await expect(transpileBytes(new Uint8Array([0]), { name: 'invalid' })).rejects.toThrow();
        assert.property((await transpileBytes(emptyComponent, { name: 'valid' })).files, 'valid.js');
        assert.strictEqual(generations, previousGeneration);
    });
});
