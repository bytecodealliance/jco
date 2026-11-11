import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';
import ts from 'typescript-compiler-api';

import { COMPONENT_FIXTURES_DIR } from './common.js';
import { getTmpDir } from './helpers.js';
import { transpileBytes, writeFiles } from './transpilation.js';
import { parse } from '../src/wasm-tools.js';

const INTERFACE = 'test:resource-statics/things';

/** A resource class whose static functions have names that a JS class treats specially. */
interface ThingClass {
    prototype_(): number;
    name(): number;
    length(): number;
    arguments(): number;
    caller(): number;
}

interface ImportObject {
    [INTERFACE]: { Thing: unknown };
}

interface Instance {
    things: { Thing: ThingClass; Other: new () => { prototype(): number } };
    run(): number;
}

/**
 * Transpile a fixture component into `dir` and instantiate it.
 *
 * @param dir - Directory that receives the transpiled files.
 * @param fixture - Name of the component fixture, without its extension.
 * @param imports - Imports that the component is instantiated with.
 */
async function instantiate(dir: string, fixture: string, imports: ImportObject | object): Promise<Instance> {
    const wat = await readFile(join(COMPONENT_FIXTURES_DIR, `resource-statics/${fixture}.wat`), 'utf8');
    const { files } = await transpileBytes(await parse(wat), { name: 'component', instantiation: 'async' });
    await writeFiles(files, { baseDir: dir });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    const module = await import(pathToFileURL(join(dir, 'component.js')).href);
    return await module.instantiate((path: string) => new WebAssembly.Module(files[path]), imports);
}

/**
 * Type check a consumer of the declarations that were generated into `dir`.
 *
 * @param dir - Directory that holds the transpiled files.
 * @param source - Source text of the consumer module.
 */
async function typeCheck(dir: string, source: string): Promise<string[]> {
    const consumer = join(dir, 'consumer.mts');
    await writeFile(consumer, source);
    const program = ts.createProgram([consumer], {
        noEmit: true,
        strict: true,
        types: [],
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
    });
    return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

test.concurrent('exported static resource functions can have names that classes reserve', async () => {
    const dir = await getTmpDir();
    try {
        const { things } = await instantiate(dir, 'exports', {});
        const { Thing, Other } = things;
        assert.strictEqual(Thing.prototype_(), 11);
        assert.strictEqual(Thing.name(), 12);
        assert.strictEqual(Thing.length(), 13);
        assert.strictEqual(Thing.arguments(), 14);
        assert.strictEqual(Thing.caller(), 15);
        // A method is a member of the prototype, where the name is not special.
        assert.strictEqual(new Other().prototype(), 16);

        const diagnostics = await typeCheck(
            dir,
            `import { instantiate } from './component.js';
            declare const getCoreModule: (path: string) => WebAssembly.Module;
            const { things } = await instantiate(getCoreModule, {});
            const results: number[] = [
                things.Thing.prototype_(),
                things.Thing.name(),
                things.Thing.length(),
                things.Thing.arguments(),
                things.Thing.caller(),
                new things.Other().prototype(),
            ];
            const thing: InstanceType<typeof things.Thing> = things.Thing.prototype;`,
        );
        assert.deepStrictEqual(diagnostics, []);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent('imported static resource functions can have names that classes reserve', async () => {
    const dir = await getTmpDir();
    try {
        class Thing {
            static prototype_() {
                return 1;
            }
            static name() {
                return 10;
            }
            static length() {
                return 100;
            }
            static arguments() {
                return 1000;
            }
            static caller() {
                return 10000;
            }
        }
        const instance = await instantiate(dir, 'imports', { [INTERFACE]: { Thing } });
        assert.strictEqual(instance.run(), 11111);

        const diagnostics = await typeCheck(
            dir,
            `import { instantiate } from './component.js';
            declare const getCoreModule: (path: string) => WebAssembly.Module;
            class Thing {
                static prototype_() { return 1; }
                static name() { return 10; }
                static length() { return 100; }
                static arguments() { return 1000; }
                static caller() { return 10000; }
            }
            const instance = await instantiate(getCoreModule, { '${INTERFACE}': { Thing } });
            const result: number = instance.run();`,
        );
        assert.deepStrictEqual(diagnostics, []);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
