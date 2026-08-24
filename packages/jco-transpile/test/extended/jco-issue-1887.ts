import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, suite, test } from 'vitest';

import { transpile, writeFiles } from '../../src/index.js';
import { EXTENDED_TEST_COMPONENTS_DIR } from '../common.js';
import { getTmpDir } from '../helpers.js';

suite('jco issue 1887', () => {
    test('WASI P3 reactor has a current task while lowering export parameters', async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, 'jco-issue-1887-list-param/component.wasm');
        const outputDir = await getTmpDir();

        try {
            const { files } = await transpile(componentPath, { name: 'out' });
            await writeFiles(files, { baseDir: outputDir });

            const instance = await import(pathToFileURL(join(outputDir, 'out.js')).href);
            assert.strictEqual(instance.bump(new Uint8Array([1, 2, 3])), 3);
            assert.throws(() => instance.bump([1, 256]), TypeError);
            assert.strictEqual(instance.bump(new Uint8Array([4, 5])), 2);
        } finally {
            await rm(outputDir, { recursive: true, force: true });
        }
    });

    test('WASI P3 reactor has a current task while dropping an exported resource', async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, 'jco-issue-1887-resource-drop/component.wasm');
        const outputDir = await getTmpDir();

        try {
            const { files } = await transpile(componentPath, { name: 'out' });
            const source = new TextDecoder().decode(files['out.js']);
            assert.match(
                source,
                /const handleEntry = rscTableRemove\(handleTable\d+, handle\d+\);[\s\S]{0,300}?callResourceDestructor\(\{ componentIdx: 0, dtor: exports\d+\['\d+'\], rep: handleEntry\.rep \}\);/,
            );
            assert.match(
                source,
                /finalizationRegistryCreate\(\(handle\) => \{[\s\S]{0,300}?callResourceDestructor\(\{ componentIdx: 0, dtor: exports\d+\['\d+'\], rep \}\);/,
            );
            await writeFiles(files, { baseDir: outputDir });

            const { api, check } = await import(pathToFileURL(join(outputDir, 'out.js')).href);
            assert.strictEqual(check(), 3);
            const thing = new api.Thing();
            const dispose = Symbol.dispose || Symbol.for('dispose');
            assert.doesNotThrow(() => thing[dispose]());
            assert.doesNotThrow(() => thing[dispose]());
        } finally {
            await rm(outputDir, { recursive: true, force: true });
        }
    });
});
