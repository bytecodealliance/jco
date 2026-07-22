/* global Buffer */
import { join, dirname } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { suite, test, assert } from 'vitest';

import { WIT_FIXTURE_DIR, getTmpDir, setupAsyncTest } from '../helpers.js';
import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { transpileBytes } from '../../src/index.js';
import { componentEmbed, componentNew, componentWit, print } from '../../src/wasm-tools.js';

const IMPLEMENTS_WIT_DIR = join(WIT_FIXTURE_DIR, 'implements');

async function buildDummyComponent(worldName: string): Promise<Uint8Array> {
    const embedded = await componentEmbed({
        dummy: true,
        witPath: IMPLEMENTS_WIT_DIR,
        world: worldName,
    });
    return await componentNew(embedded);
}

/** Write a transpiled file map plus extra stub modules into a fresh tmp dir
 * and dynamically import the given entrypoint, running its instantiation. */
async function importTranspiled(
    files: Record<string, Uint8Array>,
    stubs: Record<string, string>,
    entrypoint: string,
    run: (mod: Record<string, unknown>) => void | Promise<void>,
) {
    const dir = await getTmpDir();
    try {
        for (const [name, bytes] of Object.entries(files)) {
            const path = join(dir, name);
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, bytes);
        }
        for (const [name, source] of Object.entries(stubs)) {
            await writeFile(join(dir, name), source);
        }
        const mod = await import(pathToFileURL(join(dir, entrypoint)).href);
        await run(mod);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

const STORE_STUB = `export class Bucket { get(k) { return undefined; } set(k, v) {} }
export function open(name) { return new Bucket(); }`;

suite('Implements (labeled imports/exports)', () => {
    test.concurrent('labeled imports & exports (e2e)', async () => {
        const { cleanup, instance } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'implements-labels.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    first: { echo: (msg: string) => `first:${msg}` },
                    second: { echo: (msg: string) => `second:${msg}` },
                },
            },
        });

        // Each labeled import routes to its own implementation
        assert.deepEqual(instance.echoBoth('hello'), ['first:hello', 'second:hello']);
        // The labeled export relays through the `first` labeled import
        assert.strictEqual(instance.relay.echo('hi'), 'first:hi');

        await cleanup();
    });

    test.concurrent('binary encoding carries implements annotations', async () => {
        const component = await buildDummyComponent('imports-labeled');
        const output = await print(component);
        assert.ok(
            output.includes('(import "primary" (implements "test:implements/logger")'),
            'labeled import `primary` carries an implements annotation',
        );
        assert.ok(
            output.includes('(import "secondary" (implements "test:implements/logger")'),
            'the same interface may be imported under a second label',
        );
        assert.ok(
            output.includes('(import "kv" (implements "test:implements/store")'),
            'resource-bearing labeled import carries an implements annotation',
        );
        assert.ok(
            output.includes('"events" (implements "test:implements/logger")'),
            'labeled export carries an implements annotation',
        );
    });

    test.concurrent('transpile labeled imports', async () => {
        const component = await buildDummyComponent('imports-labeled');
        const { files, imports, exports } = await transpileBytes(component, {
            name: 'labeled',
        });
        assert.deepStrictEqual([...imports].sort(), ['kv', 'primary', 'secondary']);
        assert.deepStrictEqual(exports, [['events', 'instance']]);
        const source = Buffer.from(files['labeled.js']).toString();
        assert.ok(source.includes("from 'primary'"));
        assert.ok(source.includes("from 'secondary'"));
        // The bucket resource binds to the `kv` label import
        assert.ok(source.includes("from 'kv'"));
    });

    test.concurrent('transpile labeled imports with interface-id mapping', async () => {
        const component = await buildDummyComponent('imports-labeled');
        const { files, imports } = await transpileBytes(component, {
            name: 'labeled',
            map: {
                'test:implements/logger': './my-logger.js',
                secondary: './secondary.js',
            },
        });
        // A mapping for the implemented interface id applies to labeled
        // imports of that interface, while a label-specific mapping wins.
        assert.ok(imports.includes('./my-logger.js'));
        assert.ok(imports.includes('./secondary.js'));
        assert.ok(!imports.includes('primary'));
        const source = Buffer.from(files['labeled.js']).toString();
        assert.ok(source.includes("from './my-logger.js'"));
        assert.ok(source.includes("from './secondary.js'"));
    });

    test.concurrent('transpile same resource interface under multiple labels', async () => {
        const component = await buildDummyComponent('multi-label-stores');
        const { files, imports } = await transpileBytes(component, {
            name: 'multistore',
            emitTypescriptDeclarations: false,
            map: {
                a: './a-store.js',
                b: './b-store.js',
            },
        });
        assert.deepStrictEqual([...imports].sort(), ['./a-store.js', './b-store.js']);
        const source = Buffer.from(files['multistore.js']).toString();
        // Each label binds its own resource class from its own module
        const aImport = source.match(/import \{([^}]*)\} from '\.\/a-store\.js'/);
        const bImport = source.match(/import \{([^}]*)\} from '\.\/b-store\.js'/);
        assert.ok(aImport && bImport, 'both labels are imported');
        const bucketEntries = (importList: string) =>
            importList.split(',').filter((entry) => entry.trim().startsWith('Bucket')).length;
        assert.strictEqual(bucketEntries(aImport[1]), 1, 'label `a` imports exactly one Bucket class binding');
        assert.strictEqual(bucketEntries(bImport[1]), 1, 'label `b` imports exactly one Bucket class binding');
        // The generated module parses and instantiates with per-label stubs
        await importTranspiled(
            files,
            { 'a-store.js': STORE_STUB, 'b-store.js': STORE_STUB },
            'multistore.js',
            (mod) => {
                assert.ok(mod, 'module instantiated');
            },
        );
    });

    test.concurrent('instantiates labeled imports at runtime', async () => {
        const component = await buildDummyComponent('imports-labeled');
        const { files } = await transpileBytes(component, {
            name: 'labeled',
            emitTypescriptDeclarations: false,
            map: {
                primary: './log.js',
                secondary: './log.js',
                kv: './store.js',
            },
        });
        await importTranspiled(
            files,
            {
                'log.js': 'export function log(msg) {}',
                'store.js': STORE_STUB,
            },
            'labeled.js',
            (mod) => {
                assert.deepStrictEqual(Object.keys(mod), ['events']);
                assert.strictEqual(typeof (mod.events as Record<string, unknown>).log, 'function');
            },
        );
    });
});

suite('External IDs', () => {
    test.concurrent('binary encoding carries external-id annotations', async () => {
        const component = await buildDummyComponent('with-external-ids');
        const output = await print(component);
        assert.ok(output.includes('(external-id "com.example:ids/primary")'), 'labeled import carries its external-id');
        assert.ok(output.includes('(external-id "com.example:ids/events")'), 'labeled export carries its external-id');
    });

    test.concurrent('external-id round-trips through embed/new/wit', async () => {
        const component = await buildDummyComponent('with-external-ids');
        // Both explicitly-annotated items keep their IDs; the unannotated
        // sibling import has none.
        const output = await print(component);
        assert.strictEqual((output.match(/external-id/g) || []).length, 2);
        // WIT extracted back from the binary retains the attributes
        const wit = await componentWit(component);
        assert.strictEqual((wit.match(/@external-id\(/g) || []).length, 2);
        assert.ok(wit.includes('import primary: test:implements/logger'));
    });
});
