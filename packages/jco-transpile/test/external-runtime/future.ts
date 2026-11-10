import { execFile } from 'node:child_process';
import { rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { assert, expect, test } from 'vitest';

import { LOCAL_TEST_COMPONENTS_DIR, hasJspi } from '../common.js';
import { getTmpDir } from '../helpers.js';
import { transpile, writeFiles } from '../transpilation.js';
import { writeCustomRuntime } from './helpers.js';

const fixture = join(LOCAL_TEST_COMPONENTS_DIR, 'async-export-future-result.wasm');
const exportName = 'jco:test-components/async-export-future-result-api';
const execAsync = promisify(execFile);

for (const instantiation of ['sync', 'async'] as const) {
    for (const minify of [false, true]) {
        test.concurrent.skipIf(!hasJspi)(
            `future provider preserves selected owners (${instantiation}, minify=${minify})`,
            async () => {
                const dir = await getTmpDir();
                const instances: { _util: { stop(): void } }[] = [];
                try {
                    const provider = await writeCustomRuntime(join(dir, 'provider'));
                    await writeFile(
                        new URL('intrinsics/future.js', provider),
                        `
import * as defaults from './future-value.js';
export * from './future-state.js';
export * from './future-operations.js';
export * from './future-end.js';
export * from './future-readable.js';
export * from './future-writable.js';
export * from './future-internal.js';
export * from './future-host.js';
export const constructors = [];
/** Observe the selected constructor without changing its private brand. */
export function initializeFutureValueClass(disposeSymbol) {
    if (this !== undefined || typeof disposeSymbol !== 'symbol') {
        throw new Error('invalid future value capabilities');
    }
    const FutureValue = defaults.initializeFutureValueClass(disposeSymbol);
    constructors.push(FutureValue);
    return FutureValue;
}
`,
                    );
                    const { files } = await transpile(fixture, {
                        name: 'futures',
                        instantiation,
                        minify,
                        cmRuntimeEsModule: provider.href,
                    });
                    await writeFiles(files, { baseDir: dir });
                    const bindings = await import(pathToFileURL(join(dir, 'futures.js')).href);
                    const observed = await import(new URL('intrinsics/future.js', provider).href);
                    for (const input of [40, 50]) {
                        const instance = await bindings.instantiate(
                            (name: string) => new WebAssembly.Module(files[name]),
                            new WASIShim().getImportObject(),
                        );
                        instances.push(instance);
                        const api = instance[exportName];
                        const value = await api.proveFutureAsync(input);
                        assert.instanceOf(value, observed.constructors.at(-1));
                        assert.strictEqual(api.completedFutureWrites(), 0);
                        assert.strictEqual(await value, input + 2);
                    }
                    assert.lengthOf(observed.constructors, 2);
                    assert.notStrictEqual(observed.constructors[0], observed.constructors[1]);
                } finally {
                    for (const instance of instances) {
                        instance._util.stop();
                    }
                    await rm(dir, { recursive: true, force: true });
                }
            },
        );
    }
}

test.concurrent('native ESM rejects a missing selected future constructor', async () => {
    const dir = await getTmpDir();
    try {
        const provider = await writeCustomRuntime(join(dir, 'provider'));
        const { files } = await transpile(fixture, {
            name: 'missing-future',
            instantiation: 'async',
            cmRuntimeEsModule: provider.href,
        });
        await writeFiles(files, { baseDir: dir });
        const exports = await import(new URL('intrinsics/future.js', provider).href);
        const names = Object.keys(exports).filter((name) => name !== 'initializeFutureValueClass');
        await rename(new URL('intrinsics/future.js', provider), new URL('intrinsics/future-default.js', provider));
        await writeFile(
            new URL('intrinsics/future.js', provider),
            `export { ${names.join(', ')} } from './future-default.js';`,
        );
        await expect(execAsync(process.execPath, [join(dir, 'missing-future.js')])).rejects.toThrow(
            /does not provide an export named 'initializeFutureValueClass'/,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
