import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { assert, test } from 'vitest';

import { LOCAL_TEST_COMPONENTS_DIR } from './common.js';
import { setupAsyncTest, typeCheck } from './helpers.js';

const INTERFACE = 'jco:test-components/static-names';

/**
 * Type check a consumer of the declarations that were generated into `dir`.
 *
 * @param dir - directory that holds the transpiled component
 * @param source - source text of the consumer module
 * @returns the messages of the diagnostics that the compiler reports, if any
 */
async function typeCheckConsumer(dir: string, source: string): Promise<string[]> {
    const consumer = join(dir, 'consumer.mts');
    await writeFile(consumer, source);
    return typeCheck([consumer]);
}

test.concurrent('exported static resource functions can have names that classes reserve', async () => {
    const name = 'resource-static-names-exports';
    const { instance, cleanup, esModuleOutputDir } = await setupAsyncTest({
        component: {
            path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
            imports: new WASIShim().getImportObject(),
        },
    });
    try {
        const { Thing, Other } = instance[INTERFACE];
        assert.strictEqual(Thing.prototype_(), 11);
        assert.strictEqual(Thing.name(), 12);
        assert.strictEqual(Thing.length(), 13);
        assert.strictEqual(Thing.arguments(), 14);
        assert.strictEqual(Thing.caller(), 15);
        // A method is a member of the prototype, where the name is not special.
        assert.strictEqual(new Other().prototype(), 16);

        const diagnostics = await typeCheckConsumer(
            esModuleOutputDir,
            `import { instantiate } from './${name}.js';
            declare const getCoreModule: (path: string) => WebAssembly.Module;
            declare const imports: Parameters<typeof instantiate>[1];
            const instance = await instantiate(getCoreModule, imports);
            const { Thing, Other } = instance['${INTERFACE}'];
            const results: number[] = [
                Thing.prototype_(),
                Thing.name(),
                Thing.length(),
                Thing.arguments(),
                Thing.caller(),
                new Other().prototype(),
            ];
            const thing: InstanceType<typeof Thing> = Thing.prototype;`,
        );
        assert.deepStrictEqual(diagnostics, []);
    } finally {
        await cleanup();
    }
});

test.concurrent('imported static resource functions can have names that classes reserve', async () => {
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
    const name = 'resource-static-names-imports';
    const { instance, cleanup, esModuleOutputDir } = await setupAsyncTest({
        component: {
            path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
            imports: { ...new WASIShim().getImportObject(), [INTERFACE]: { Thing } },
        },
    });
    try {
        assert.strictEqual(instance.run(), 11111);

        const diagnostics = await typeCheckConsumer(
            esModuleOutputDir,
            `import { instantiate } from './${name}.js';
            class Thing {
                static prototype_() { return 1; }
                static name() { return 10; }
                static length() { return 100; }
                static arguments() { return 1000; }
                static caller() { return 10000; }
            }
            type Imports = Parameters<typeof instantiate>[1];
            const things: Imports['${INTERFACE}'] = { Thing };`,
        );
        assert.deepStrictEqual(diagnostics, []);
    } finally {
        await cleanup();
    }
});
