import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { assert, test } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { defaultRuntimeUrl, externalRuntime, runtimeOptions } from '../transpilation.js';

test.concurrent('runtime mode preserves explicit provider options without mutating them', () => {
    const options = { cmRuntimeEsModule: './custom.js', minify: false };
    assert.deepEqual(runtimeOptions(options), options);
    assert.notStrictEqual(runtimeOptions(options), options);
    assert.isUndefined(runtimeOptions({ cmRuntimeEsModule: undefined }).cmRuntimeEsModule);
    assert.strictEqual(runtimeOptions().cmRuntimeEsModule, externalRuntime ? defaultRuntimeUrl.href : undefined);
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
