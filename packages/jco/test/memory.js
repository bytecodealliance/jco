import { fileURLToPath, URL } from 'node:url';
import { version } from 'node:process';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { transpile } from '../src/api.js';

import { readComponentBytes, exec } from './helpers.js';

const ADDER_COMPONENT_PATH = fileURLToPath(
    new URL('./fixtures/components/adder.component.wasm', import.meta.url)
);

const CALL_COUNT = 1_000_000;

suite('Memory', () => {
    // see: https://github.com/bytecodealliance/jco/issues/937
    test('does not leak during numerous transpile calls', async () => {
        let nodeMajorVersion = parseInt(version.replace('v', '').split('.')[0]);
        if (nodeMajorVersion < 20) {
            return;
        }

        const adderComponentBytes =
            await readComponentBytes(ADDER_COMPONENT_PATH);

        // Transpile the adder component
        const outDir = await mkdtemp(join(tmpdir(), 'jco-memory-'));

        const { files } = await transpile(adderComponentBytes, {
            outDir,
        });
        await Promise.all(
            Object.entries(files).map(async ([name, file]) => {
                await mkdir(dirname(name), { recursive: true });
                await writeFile(name, file);
            })
        );

        // Build out JS code that will use the component
        const testJsCode = `
import { add } from './component.js';
const before = process.memoryUsage();
let runs = 0;
for (var i = 0; i < ${CALL_COUNT}; i++) {
  add.add(1, 3);
  runs += 1;
}
const after = process.memoryUsage();
process.stdout.write(JSON.stringify({ runs, memoryUsage: { before, after } }));
        `;

        const testJsOutputPath = join(outDir, 'test.mjs');
        await writeFile(testJsOutputPath, testJsCode);

        const { stdout } = await exec(testJsOutputPath);
        const outputObj = JSON.parse(stdout);
        const beforeUsageRSS = outputObj?.memoryUsage?.before?.rss;
        assert.ok(beforeUsageRSS);
        const afterUsageRSS = outputObj?.memoryUsage?.after?.rss;
        assert.ok(afterUsageRSS);
        assert.strictEqual(outputObj?.runs, CALL_COUNT);

        const expectedUsageMB = 1000 * 1000 * 30;
        const actualUsageMB = Math.ceil((afterUsageRSS - beforeUsageRSS) / (1000 * 1000));
        assert(
            afterUsageRSS < beforeUsageRSS + expectedUsageMB,
            `< 30MB used for extra memory (actual ${actualUsageMB}MB)`
        );
    });
});
