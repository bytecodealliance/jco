import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { suite, test } from 'vitest';

import { transpile, writeFiles } from '../../src/index.js';
import { EXTENDED_TEST_COMPONENTS_DIR } from '../common.js';

suite('jco issue 1390', () => {
    test('composed command can lower imports after a previous task exits', async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, 'jco-issue-1390/composed.wasm');
        const outputRoot = fileURLToPath(new URL('../output/', import.meta.url));
        await mkdir(outputRoot, { recursive: true });
        const outputDir = await mkdtemp(join(outputRoot, 'jco-issue-1390-'));

        try {
            const { files } = await transpile(componentPath, { name: 'composed' });
            await writeFiles(files, { baseDir: outputDir });
            const { run } = await import(pathToFileURL(join(outputDir, 'composed.js')).href);
            await run.run();
        } finally {
            await rm(outputDir, { recursive: true, force: true });
        }
    });
});
