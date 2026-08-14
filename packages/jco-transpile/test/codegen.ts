import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

import { HTTPServer } from '@bytecodealliance/preview2-shim/http';

import { transpile, transpileBytes, writeFiles } from '../src/index.js';
import { parse } from '../src/wasm-tools.js';
import { componentNew, componentEmbed } from '../src/wasm-tools.js';

import { suite, test, assert, describe } from 'vitest';

import { readFixtureFlags, getTmpDir, getRandomPort } from './helpers.js';

import { getDefaultComponentFixtures, COMPONENT_FIXTURES_DIR } from './common.js';

suite('codegen', async () => {
    // NOTE: the codegen tests *must* run first and generate outputs for other tests to use
    describe('codegen', async () => {
        const fixtures = await getDefaultComponentFixtures();
        for (const fixture of fixtures) {
            const testName = fixture.replace(/(\.component)?\.(wasm|wat)$/, '');
            test.concurrent(`${testName} transpile & lint`, async () => {
                const transpileOpts = await readFixtureFlags(
                    fileURLToPath(new URL(`./runtime/${testName}.ts`, import.meta.url)),
                );
                await transpile(fileURLToPath(new URL(`./fixtures/components/${fixture}`, import.meta.url)), {
                    name: testName,
                    ...transpileOpts,
                    ouputDir: fileURLToPath(new URL(`./output/${testName}`, import.meta.url)),
                });
            });
        }
    });

    test.concurrent('incoming composed', async () => {
        const outDir = await getTmpDir();

        // Transpile the component
        const { files } = await transpile(
            fileURLToPath(new URL('./fixtures/components/hello-world.wasm', import.meta.url)),
            { outDir },
        );
        await writeFiles(files);

        // Run the component as a HTTP server
        const { incomingHandler } = await import(`${pathToFileURL(outDir)}/hello-world.js`);
        const server = new HTTPServer(incomingHandler);
        // NOTE: we can't use a properly random port here (0), because there is not
        // yet callback support in the server that is started on the other side of
        // the io redirection worker
        const port = await getRandomPort();
        server.listen(port);

        const res = await (await fetch(`http://localhost:${port}`)).text();
        assert.strictEqual(res, 'Hello from Typescript!\n');

        server.stop();

        try {
            await rm(outDir, { recursive: true });
        } catch {}
    });
});

suite(`Naming`, () => {
    test.concurrent(`Resource deduping`, async () => {
        const bytes = await componentNew(
            await componentEmbed({
                witSource: await readFile(
                    fileURLToPath(new URL(`./fixtures/wit/resource-naming/resource-naming.wit`, import.meta.url)),
                    'utf8',
                ),
                dummy: true,
                metadata: [
                    ['language', [['javascript', '']]],
                    ['processed-by', [['dummy-gen', 'test']]],
                ],
            }),
        );

        const { files } = await transpileBytes(bytes, {
            name: 'resource-naming',
        });

        const bindingsSource = new TextDecoder().decode(files['resource-naming.js']);

        assert.isOk(bindingsSource.includes('class Thing$1{'));
        assert.isOk(bindingsSource.includes('Thing: Thing$1'));
    });
});

suite('Directive Prologue', () => {
    test.concurrent('shows directive', async () => {
        const bytes = await readFile(join(COMPONENT_FIXTURES_DIR, 'adder.component.wasm'));
        const { files } = await transpileBytes(bytes, { name: 'adder' });
        const bindingsSource = new TextDecoder().decode(files['adder.js']);
        assert.isOk(bindingsSource.includes('"use components";'));
    });
});

suite('Trap detection', () => {
    test.concurrent.skipIf(typeof WebAssembly.Suspending !== 'function')(
        'identifies a bindgen trap with the documented TrapError class',
        async () => {
            const outDir = await getTmpDir();
            const wat = await readFile(join(COMPONENT_FIXTURES_DIR, 'p3', 'trap-error.wat'), 'utf8');
            const { files } = await transpileBytes(await parse(wat), {
                name: 'trap-error',
                outDir,
                instantiation: 'async',
                asyncMode: 'jspi',
                strict: true,
            });

            try {
                await writeFiles(files);
                await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));

                const esModule = await import(pathToFileURL(join(outDir, 'trap-error.js')).href);
                const instance = await esModule.instantiate(undefined, {});

                assert.throws(() => instance.takeU32(-1), TypeError);
                assert.strictEqual(instance.ok(), 42, 'argument validation must not trap the instance');

                let trap;
                try {
                    await instance.trap();
                } catch (err) {
                    trap = err;
                }

                assert.instanceOf(trap, esModule._util.TrapError);
                assert.match(trap.message, /futures must not be dropped before being completed/);

                let subsequentCallError;
                try {
                    instance.ok();
                } catch (err) {
                    subsequentCallError = err;
                }
                assert.strictEqual(
                    subsequentCallError,
                    trap,
                    'a trapped component instance must reject subsequent calls',
                );
            } finally {
                await rm(outDir, { recursive: true });
            }
        },
    );
});

// see: https://github.com/bytecodealliance/jco/issues/1400
suite('--strict', () => {
    test.concurrent('does not add checks when disabled', async () => {
        const bytes = await readFile(join(COMPONENT_FIXTURES_DIR, 'adder.component.wasm'));
        const { files } = await transpileBytes(bytes, { name: 'adder' });
        const bindingsSource = new TextDecoder().decode(files['adder.js']);
        assert.isFalse(
            bindingsSource.includes("_requireValidNumericPrimitive('u32', val)"),
            'numeric primitive check shoudl not be included',
        );
    });

    test.concurrent('adds checks when enabled', async () => {
        const bytes = await readFile(join(COMPONENT_FIXTURES_DIR, 'adder.component.wasm'));
        const { files } = await transpileBytes(bytes, { name: 'adder', strict: true });
        const bindingsSource = new TextDecoder().decode(files['adder.js']);
        // Somewhat brittle, but we're looking for a *specific* call in the body of `toUint32(val)` below:
        assert.isOk(
            bindingsSource.includes(
                "_requireValidNumericPrimitive('u32', val)",
                'numeric primitive check should be included',
            ),
        );
    });
});
