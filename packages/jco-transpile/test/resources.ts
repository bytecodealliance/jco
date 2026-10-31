import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, suite, test } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { transpileBytes } from './transpilation.js';
import { componentEmbed, componentNew, parse } from '../src/wasm-tools.js';
import { getTmpDir, setupAsyncTest } from './helpers.js';
import { LOCAL_TEST_COMPONENTS_DIR } from './common.js';

suite('resources', () => {
    // https://github.com/bytecodealliance/jco/issues/2329
    test.concurrent.each([
        { name: 'plain', useNamespaceObjects: false },
        { name: 'namespace objects', useNamespaceObjects: true },
    ])('same-named interface members stay scoped ($name)', async ({ useNamespaceObjects }) => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'same-named-resources',
                path: fileURLToPath(
                    new URL('./fixtures/components/runtime/same-named-resources/component.wat', import.meta.url),
                ),
            },
            jco: { transpile: { extraArgs: { useNamespaceObjects } } },
        });
        try {
            const FirstToken = instance['example:resources/first'].Token;
            const SecondToken = instance['example:resources/second'].Token;
            assert.notStrictEqual(FirstToken, SecondToken);
            const first = new FirstToken(11);
            const second = new SecondToken(22);
            const madeFirst = FirstToken.make(33);
            const madeSecond = SecondToken.make(44);
            const firstInterface = instance['example:resources/first'];
            const secondInterface = instance['example:resources/second'];
            if (useNamespaceObjects) {
                assert.notStrictEqual(firstInterface.State, secondInterface.State);
                assert.deepEqual(firstInterface.State, { Ready: 'ready', Done: 'done' });
                assert.deepEqual(secondInterface.State, { Ready: 'ready', Done: 'done' });
                assert.notStrictEqual(firstInterface.Permissions, secondInterface.Permissions);
                assert.deepEqual(firstInterface.Permissions, { Read: 1n, Write: 2n });
                assert.deepEqual(secondInterface.Permissions, { Read: 1n, Write: 2n });
                assert.notStrictEqual(firstInterface.Choice, secondInterface.Choice);
                assert.deepEqual(firstInterface.Choice.Some(11), { tag: 'some', val: 11 });
                assert.deepEqual(secondInterface.Choice.Some(22), { tag: 'some', val: 22 });
            }
            assert.strictEqual(firstInterface.getValue(), 33);
            assert.strictEqual(secondInterface.getValue(), 44);
            assert.strictEqual(instance.getValue(), 99);
            for (const [Token, token, value] of [
                [FirstToken, first, 11],
                [SecondToken, second, 22],
                [FirstToken, madeFirst, 33],
                [SecondToken, madeSecond, 44],
            ] as const) {
                assert.instanceOf(token, Token);
                assert.strictEqual(token.value(), value);
                assert.strictEqual(Token.inspect(token), value);
            }
            assert.throws(() => FirstToken.inspect(second), /not a valid/i);
            assert.throws(() => SecondToken.inspect(first), /not a valid/i);
            assert.throws(() => firstInterface.roundtrip(second), /not a valid/i);
            assert.throws(() => secondInterface.roundtrip(first), /not a valid/i);
            const returnedFirst = firstInterface.roundtrip(first);
            const returnedSecond = secondInterface.roundtrip(second);
            assert.instanceOf(returnedFirst, FirstToken);
            assert.instanceOf(returnedSecond, SecondToken);
            assert.strictEqual(returnedFirst.value(), 11);
            assert.strictEqual(returnedSecond.value(), 22);
            assert.throws(() => first.value(), /not a valid/i);
            assert.throws(() => second.value(), /not a valid/i);
            for (const token of [returnedFirst, returnedSecond, madeFirst, madeSecond]) {
                token[Symbol.dispose]();
                assert.throws(() => token.value(), /not a valid/i);
            }
        } finally {
            await cleanup();
        }
    });

    test.each([
        { name: 'inline', cmRuntimeEsModule: undefined },
        {
            name: 'external',
            cmRuntimeEsModule: new URL('../../jco-cm-runtime/dist/', import.meta.url).href,
        },
        {
            name: 'custom',
            cmRuntimeEsModule: new URL('./fixtures/custom-runtime/', import.meta.url).href,
        },
    ])('resource reps survive own and borrow transfers ($name runtime)', async ({ cmRuntimeEsModule }) => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'zero-resource-rep',
                path: fileURLToPath(
                    new URL('./fixtures/components/runtime/zero-resource-rep.component.wat', import.meta.url),
                ),
            },
            jco: { transpile: { extraArgs: { cmRuntimeEsModule } } },
        });

        try {
            const reps = [0, 0, 7, 0x3fffffff, 0x40000000, 0x80000010, 0xc0000010, 0xffffffff];
            for (const [index, rep] of reps.entries()) {
                assert.strictEqual(instance.run(rep), rep);
                assert.strictEqual(instance.last(), rep, 'the destructor receives the original rep');
                assert.strictEqual(instance.count(), index + 1, 'only dropping the owned handle runs the destructor');
            }
        } finally {
            await cleanup();
        }
    });

    test('host resource reps preserve captured identity and disposal', async () => {
        class Thing {
            #value: number;
            disposed = 0;

            constructor(rep: number, value: number) {
                this[Symbol.for('cabiRep')] = rep;
                this.#value = value;
            }

            getValue() {
                return this.#value;
            }

            [Symbol.dispose]() {
                this.disposed++;
            }
        }

        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'zero-host-resource-rep',
                path: fileURLToPath(
                    new URL('./fixtures/components/runtime/zero-host-resource-rep.component.wat', import.meta.url),
                ),
                imports: {
                    'test:zero-rep/api': { Thing },
                    observe: { default: (thing: Thing) => thing.getValue() },
                },
            },
        });

        try {
            // Core Wasm returns i32s as signed JS numbers. Both spellings of a rep
            // must find the captured object when lifting a borrow, an own, or a drop.
            for (const rep of [0, 0x40000000, 0x80000010, -0x7ffffff0, 0xc0000010, -0x3ffffff0, 0xffffffff, -1]) {
                const first = new Thing(rep, 42);
                const second = new Thing(1, 99);
                assert.strictEqual(instance.inspect(first, second), 42);
                assert.strictEqual(instance.roundtrip(first, second), first);
                assert.strictEqual(first.getValue(), 42);
                assert.strictEqual(second.disposed, 1);
                assert.strictEqual(first.disposed, 0);
                instance.drop(first);
                assert.strictEqual(first.disposed, 1);
            }
        } finally {
            await cleanup();
        }
    });

    // Ensure trampoline code is called on external object with relevant `this`.
    // see: https://github.com/bytecodealliance/jco/issues/1313
    test('simple imported resource call', async () => {
        const disposeSymbol = Symbol.dispose || Symbol.for('dispose');
        let disposed = 0;

        class IncrementingExampleResource {
            private id: number;

            constructor(id: number) {
                this.id = id;
            }

            getId() {
                this.id += 1;
                return this.id;
            }

            [disposeSymbol]() {
                disposed += 1;
            }
        }

        const name = 'resource-incrementing-id';
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/resources': { ExampleResource: IncrementingExampleResource },
                },
            },
            // jco: {
            //     transpile: {
            //         extraArgs: {
            //             minify: false,
            //         },
            //     },
            // },
        });

        instance['jco:test-components/local-run'].run();
        assert.strictEqual(disposed, 1, 'dropping the guest-owned import should dispose the host resource once');

        await cleanup();
    });

    test('component-defined resource disposal uses the removed handle representation', async () => {
        const fixture = fileURLToPath(
            new URL('./fixtures/components/runtime/resources.2.component.wat', import.meta.url),
        );
        const { files } = await transpileBytes(await readFile(fixture), {
            name: 'resource-disposal',
            minify: false,
        });
        const source = new TextDecoder().decode(files['resource-disposal.js']);

        assert.match(
            source,
            /const handleEntry = rscTableRemove\(handleTable\d+, handle\d+\);[\s\S]{0,300}?\[['"]0['"]\]\(handleEntry\.rep\);/,
            'explicit disposal should call the destructor with the representation returned while removing the handle',
        );
        assert.notMatch(
            source,
            /rscTableRemove\(handleTable\d+, handle\d+\);[\s\S]{0,300}?handleTable\d+\[\(handle\d+ << 1\) \+ 1\]/,
            'explicit disposal must not read a representation from a removed handle-table entry',
        );
        assert.notMatch(
            source,
            /callResourceDestructor/,
            'a component without context intrinsics should retain lightweight destructor calls',
        );
    });

    // A rep is any u32 the guest chooses, for C and C++ guests the address of the object in linear
    // memory, so every bit must survive the handle table.
    // see: https://github.com/bytecodealliance/jco/issues/2293
    test('component-defined resource reps keep every bit', async () => {
        // The rep of each thing is the number passed to its constructor, and its method returns
        // the rep the guest is given for it
        const coreModule = await parse(`
            (module
                (import "[export]test:resource-rep/api" "[resource-new]thing" (func $new (param i32) (result i32)))
                (memory (export "memory") 0)
                (func (export "test:resource-rep/api#[constructor]thing") (param i32) (result i32)
                    (call $new (local.get 0)))
                (func (export "test:resource-rep/api#[method]thing.rep") (param i32) (result i32)
                    (local.get 0))
                (func (export "test:resource-rep/api#[dtor]thing") (param i32))
            )
        `);
        const component = await componentNew(
            await componentEmbed({
                binary: coreModule,
                witSource: `
                    package test:resource-rep;

                    interface api {
                        resource thing {
                            constructor(rep: u32);
                            rep: func() -> u32;
                        }
                    }

                    world test {
                        export api;
                    }
                `,
            }),
        );

        const componentDir = await getTmpDir();
        const componentPath = join(componentDir, 'resource-rep.wasm');
        await writeFile(componentPath, component);
        const { instance, cleanup } = await setupAsyncTest({ component: { path: componentPath } });

        try {
            const { Thing } = instance['test:resource-rep/api'];
            // Below, at and above bit 30, and with bit 31 set too
            for (const rep of [
                0, 0x10, 0x3fffffff, 0x40000000, 0x40000010, 0x7ffffff0, 0x80000010, 0xc0000010, 0xfffffff0, 0xffffffff,
            ]) {
                const thing = new Thing(rep);
                assert.strictEqual(thing.rep(), rep, `rep 0x${rep.toString(16)}`);
                thing[Symbol.dispose]();
                assert.throws(() => thing.rep(), /not a valid/i, `rep 0x${rep.toString(16)} after disposal`);
            }
        } finally {
            await cleanup();
            await rm(componentDir, { recursive: true, force: true });
        }
    });

    test('component-defined resource without a destructor still releases its handle', async () => {
        const component = await componentNew(
            await componentEmbed({
                dummy: true,
                witSource: `
                    package test:resource-disposal;

                    interface resources {
                        resource no-destructor {
                            constructor();
                        }
                    }

                    world test {
                        export resources;
                    }
                `,
            }),
        );
        const { files } = await transpileBytes(component, {
            name: 'resource-without-destructor',
            minify: false,
        });
        const source = new TextDecoder().decode(files['resource-without-destructor.js']);

        assert.match(
            source,
            /Object\.defineProperty\(rsc\d+, symbolDispose,[\s\S]*?const handleEntry = rscTableRemove\(handleTable\d+, handle\d+\);[\s\S]*?symbolRscHandle\] = undefined;/,
            'explicit disposal should release and invalidate an owned handle even without a guest destructor',
        );
    });
});
