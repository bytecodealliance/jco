import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { buildPair } from '../build.js';
import { bundlers, resolutions, fullScenarios } from '../cases.js';
import { readRuntimeCoverage, verifyImportControls, verifyPair } from '../verify.js';

test('coverage names the runtime API actually being measured', readRuntimeCoverage);

for (const bundler of bundlers) {
    for (const resolution of resolutions) {
        test(`${bundler}/${resolution}: unused exports are removed and used exports execute`, async () => {
            const dir = await mkdtemp(join(tmpdir(), 'jco-runtime-exports-'));
            try {
                await verifyImportControls(dir, bundler, resolution);
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });

        for (const scenario of fullScenarios) {
            test(`${bundler}/${resolution}/${scenario.id}: matching inputs and known answers`, async () => {
                const pair = await buildPair(scenario.components, bundler, resolution);
                try {
                    await verifyPair(pair, scenario);
                } finally {
                    await pair.cleanup();
                }
            });
        }
    }
}
