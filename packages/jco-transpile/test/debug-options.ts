import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

import { parse } from '../src/wasm-tools.js';
import { getTmpDir, nodeExec } from './helpers.js';
import { transpileBytes, writeFiles } from './transpilation.js';

const fixture = new URL('./fixtures/components/p3/context-sync/component.wat', import.meta.url);
const checkDebugOptions = fileURLToPath(new URL('./fixtures/debug-options/check.mjs', import.meta.url));

for (const instantiation of ['sync', 'async'] as const) {
    test.concurrent(`debug configuration belongs to each ${instantiation} instance`, async () => {
        const component = await parse(await readFile(fixture, 'utf8'));
        const { files } = await transpileBytes(component, {
            name: 'component',
            instantiation,
            cmRuntimeEsModule: undefined,
            runtimeProfile: 'debug',
        });
        const directory = await getTmpDir();
        try {
            await writeFiles(files, { baseDir: directory });
            await writeFile(join(directory, 'package.json'), '{"type":"module"}');
            // Each process owns its environment and console capture, allowing the
            // instantiation modes to run concurrently without shared mutations.
            await nodeExec(checkDebugOptions, join(directory, 'component.js'), instantiation);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
}

test('bindings contain diagnostics only with the debug runtime profile', async () => {
    const component = await parse(await readFile(fixture, 'utf8'));
    const diagnostic = '[contextGet()] args';
    const assertion = 'corrupt rep table freelist';

    for (const [runtimeProfile, diagnostics, assertions] of [
        [undefined, false, true],
        ['checked', false, true],
        ['debug', true, true],
    ] as const) {
        const { files } = await transpileBytes(component, {
            name: 'component',
            instantiation: 'sync',
            cmRuntimeEsModule: undefined,
            runtimeProfile,
        });
        const bindings = new TextDecoder().decode(files['component.js']);

        expect(bindings.includes(diagnostic), String(runtimeProfile)).toBe(diagnostics);
        expect(bindings.includes(assertion), String(runtimeProfile)).toBe(assertions);
    }
});
