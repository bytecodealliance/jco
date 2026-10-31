import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { buildMatchedMatrix, type MatchedInputs } from './matched-build.js';

// Build/correctness phase only. The standalone controller must wait for this
// entire process to exit before collecting accepted performance observations.
test('prepare the complete matched runtime matrix', async () => {
    const config = process.env.JCO_EXTERNAL_RUNTIME_MATCHED_INPUTS;
    const output = process.env.JCO_EXTERNAL_RUNTIME_MATCHED_BUILD;
    if (!config || !output) {
        throw new Error('Explicit matched inputs and a fresh build directory are required');
    }
    const inputs = JSON.parse(await readFile(resolve(config), 'utf8')) as MatchedInputs;
    await buildMatchedMatrix(inputs, resolve(output));
}, 480_000);
