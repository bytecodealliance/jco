import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, suite, test } from 'vitest';

import { transpile, writeFiles } from '../../src/index.js';
import { EXTENDED_TEST_COMPONENTS_DIR } from '../common.js';
import { getTmpDir } from '../helpers.js';

suite('jco issue 2185', () => {
    test('UTF-16 strings returned from async exports are lifted whole', async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, 'jco-issue-2185/component.wasm');
        const outputDir = await getTmpDir();

        try {
            const { files } = await transpile(componentPath, { name: 'out' });
            await writeFiles(files, { baseDir: outputDir });

            const instance = await import(pathToFileURL(join(outputDir, 'out.js')).href);
            assert.strictEqual(await instance.greet('world 🌍'), 'hello, world 🌍');
            assert.deepStrictEqual(await instance.names(), ['alpha', 'beta 🌍']);
        } finally {
            await rm(outputDir, { recursive: true, force: true });
        }
    });
});
