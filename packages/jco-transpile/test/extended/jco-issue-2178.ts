import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, suite, test } from 'vitest';

import { transpile, writeFiles } from '../../src/index.js';
import { EXTENDED_TEST_COMPONENTS_DIR } from '../common.js';
import { getTmpDir } from '../helpers.js';

suite('jco issue 2178', () => {
    test('strings are copied between two UTF-16 components', async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, 'jco-issue-2178/composed.wasm');
        const outputDir = await getTmpDir();

        try {
            const { files } = await transpile(componentPath, { name: 'out' });
            await writeFiles(files, { baseDir: outputDir });

            const instance = await import(pathToFileURL(join(outputDir, 'out.js')).href);
            assert.strictEqual(instance.run(), 'hello, world 🌍');
        } finally {
            await rm(outputDir, { recursive: true, force: true });
        }
    });
});
