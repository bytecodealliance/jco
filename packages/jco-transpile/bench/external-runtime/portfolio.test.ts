import { assert, test } from 'vitest';
import { fullScenarios } from './cases.js';
import { buildPair } from './build.js';
import { measure } from './measure.js';

// This is correctness preflight, separate from every timed matrix process.
test.concurrent.each(fullScenarios)('bundled full-portfolio known answers: $id', async ({ components }) => {
    const pair = await buildPair(components, 'rolldown', 'file');
    try {
        assert.deepEqual(pair.inline.wasm, pair.external.wasm);
        const checked = await measure(pair, true);
        assert.deepEqual(checked.verified, [...components]);
    } finally {
        await pair.cleanup();
    }
});
