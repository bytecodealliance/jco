import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';

import { parse } from '../../src/wasm-tools.js';
import { getTmpDir } from '../helpers.js';
import { transpileBytes, writeFiles } from '../transpilation.js';

const fixture = new URL('../fixtures/components/runtime/imported-resource-borrow.component.wat', import.meta.url);
const providers = [
    { name: 'inline', base: undefined },
    { name: 'external', base: new URL('../../../jco-cm-runtime/dist/', import.meta.url).href },
    { name: 'independent', base: new URL('../fixtures/custom-runtime/', import.meta.url).href },
];

test.concurrent.each(
    providers.flatMap((provider) =>
        [false, true].map((validLiftingOptimization) => ({
            ...provider,
            validLiftingOptimization,
        })),
    ),
)(
    'a forged imported borrow cannot alias a live handle ($name, optimization=$validLiftingOptimization)',
    async ({ base, validLiftingOptimization }) => {
        const directory = await getTmpDir();
        try {
            const bytes = await parse(await readFile(fixture, 'utf8'));
            const { files } = await transpileBytes(bytes, {
                name: 'borrow',
                instantiation: 'sync',
                cmRuntimeEsModule: base,
                validLiftingOptimization,
            });
            await writeFiles(files, { baseDir: directory });
            await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
            const bindings = await import(pathToFileURL(join(directory, 'borrow.js')).href);
            let calls = 0;
            class Thing {}
            const instance = bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {
                host: {
                    Thing,
                    observe(value: unknown) {
                        assert.instanceOf(value, Thing);
                        calls++;
                        return 42;
                    },
                },
            });
            assert.strictEqual(instance.seed(), 1);
            assert.strictEqual(instance.run(1), 42);
            assert.strictEqual(calls, 1);
            assert.throws(() => instance.run(0x80000001), WebAssembly.RuntimeError, 'unknown handle index 2147483649');
            assert.strictEqual(calls, 1, 'invalid guest handles must never reach the host');
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    },
);
