import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assert, test } from 'vitest';

import { getTmpDir, setupAsyncTest } from '../helpers.js';
import {
    defaultRuntimeUrl,
    externalRuntime,
    runtimeOptions,
    transpile,
    transpileBytes,
    writeFiles,
} from '../transpilation.js';
import { transpileBytes as productionTranspileBytes } from '../../src/transpile.js';
import { parse } from '../../src/wasm-tools.js';

const fixture = new URL('../fixtures/components/runtime/external-runtime-resource.component.wat', import.meta.url);

test.concurrent('runtime mode preserves explicit provider options without mutating them', () => {
    const options = Object.freeze({ cmRuntimeEsModule: './custom-runtime/', minify: false });
    assert.deepEqual(runtimeOptions(options), options);
    assert.notStrictEqual(runtimeOptions(options), options);
    assert.isUndefined(runtimeOptions({ cmRuntimeEsModule: undefined }).cmRuntimeEsModule);
    assert.strictEqual(runtimeOptions().cmRuntimeEsModule, externalRuntime ? defaultRuntimeUrl.href : undefined);
});

test.concurrent.each([
    ['bytes', false],
    ['bytes', true],
    ['file', false],
    ['file', true],
] as const)('%s entry point honors suite mode and explicit opt-out (%s)', async (entryPoint, optOut) => {
    const outDir = await getTmpDir();
    try {
        const component = await parse(await readFile(fixture, 'utf8'));
        const options = { name: 'component', instantiation: 'sync' as const };
        const selectedOptions = {
            ...options,
            ...(optOut ? { cmRuntimeEsModule: undefined } : {}),
        };
        const componentPath = join(outDir, 'input.wasm');
        await writeFile(componentPath, component);
        const { files } =
            entryPoint === 'bytes'
                ? await transpileBytes(component, selectedOptions)
                : await transpile(componentPath, selectedOptions);
        const source = new TextDecoder().decode(files['component.js']);
        assert.strictEqual(source.includes(defaultRuntimeUrl.href), externalRuntime && !optOut);
        const production = await productionTranspileBytes(component, options);
        assert.notInclude(new TextDecoder().decode(production.files['component.js']), defaultRuntimeUrl.href);
        await writeFiles(files, { baseDir: outDir });
        await writeFile(join(outDir, 'package.json'), '{"type":"module"}');
        const bindings = await import(pathToFileURL(join(outDir, 'component.js')).href);
        const instance = bindings.instantiate((name: string) => new WebAssembly.Module(files[name]), {});
        assert.strictEqual(instance.run(42), 42);
        assert.throws(() => instance.invalid(0), WebAssembly.RuntimeError, 'unknown handle index 0');
    } finally {
        await rm(outDir, { recursive: true, force: true });
    }
});

test.concurrent('setupAsyncTest runs generated bindings in the selected runtime mode', async () => {
    const result = await setupAsyncTest({
        component: {
            name: 'runtime-harness',
            path: fileURLToPath(
                new URL('../fixtures/components/runtime/external-runtime-resource.component.wat', import.meta.url),
            ),
        },
        jco: { transpile: { extraArgs: { minify: false } } },
    });
    try {
        const source = await readFile(result.esModuleOutputPath, 'utf8');
        assert.strictEqual(source.includes(defaultRuntimeUrl.href), externalRuntime);
        assert.strictEqual(result.instance.run(42), 42);
        assert.throws(() => result.instance.invalid(0), WebAssembly.RuntimeError, 'unknown handle index 0');
    } finally {
        await result.cleanup();
    }
});
