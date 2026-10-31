import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { measureMatched } from './matched-measure.js';
import type { MatchedGraph } from './matched-build.js';
import { modes, sampleOrder, validateArtifacts, validateCoverage } from './matched-protocol.mjs';
import { validateMatchedMeasurement } from './matched-report.mjs';

test.concurrent('four successive orders balance positions and directed carryover', () => {
    for (let processIndex = 0; processIndex < 10; processIndex++) {
        const orders = Array.from({ length: 4 }, (_, sample) => sampleOrder(processIndex, sample));
        for (let position = 0; position < 4; position++) {
            assert.deepEqual(orders.map((order) => order[position]).sort(), [...modes].sort());
        }
        const pairs = orders.flatMap((order) => order.slice(1).map((mode, i) => `${order[i]}/${mode}`));
        assert.equal(new Set(pairs).size, 12);
    }
    assert.throws(() => sampleOrder(-1));
});

test.concurrent.each(['none', 'named', 'all'] as const)('four-mode varying-answer canary: %s', async (corrupt) => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-matched-worker-'));
    try {
        const artifacts = {} as MatchedGraph['artifacts'];
        for (const mode of modes as (keyof typeof artifacts)[]) {
            const root = join(dir, mode);
            await mkdir(root);
            const bundle = join(root, 'bundle.mjs');
            await writeFile(
                bundle,
                `export function create0() { return { scalar(x) { return ${corrupt === 'all' || (corrupt === 'named' && mode === 'named') ? 'x === 0 ? 100 : x + 1' : 'x + 1'}; } }; }`,
            );
            artifacts[mode] = {
                dir: root,
                bundle,
                parts: ['noise'],
                wasm: { bytes: 0, files: {} },
                sourceBytes: 0,
                graph: { imports: [], contexts: [], initializers: [] },
                retainedModules: {},
                fixtureDigests: {},
                bundleMs: 0,
                js: { raw: 1, gzip: 1, brotli: 1 },
                unshakenBytes: 1,
                chunks: 1,
                builtins: [],
            };
        }
        if (corrupt !== 'none') {
            await assert.rejects(measureMatched(artifacts, true), /varying known answers/);
        } else {
            const result = await measureMatched(artifacts, true);
            assert.deepEqual(result.modes, [...modes]);
            assert.deepEqual(result.verified, ['noise']);
            assert.equal(result.varyingInputs, 32);
            // Exercise the actual sampling/calibration path as a functional
            // canary. These temporary observations are not acceptance data.
            const measured = await measureMatched(artifacts, false, 3, 15);
            assert.deepEqual(validateMatchedMeasurement(measured), ['call', 'evaluate', 'instantiate', 'parse']);
            for (const change of [
                (copy: typeof measured) => {
                    copy.samples.named.call.pop();
                },
                (copy: typeof measured) => {
                    copy.pairedRatios['named-vs-factory'].call *= 2;
                },
                (copy: typeof measured) => {
                    copy.pairedRatios['normalized-overhead'].call *= 2;
                },
                (copy: typeof measured) => {
                    copy.sampleOrders[0].reverse();
                },
                (copy: typeof measured) => {
                    copy.samples.inline.parse[0] = Infinity;
                },
            ]) {
                const copy = structuredClone(measured);
                change(copy);
                assert.throws(() => validateMatchedMeasurement(copy));
            }
            const { named: _omitted, ...incomplete } = artifacts;
            assert.throws(() => validateArtifacts(incomplete), /all four explicit modes/);
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent('matched coverage accepts the trait thread inventory and rejects stale or incomplete manifests', () => {
    const mapped = ['AsyncTask(AsyncTaskClass)', 'AsyncTask(AsyncThreadClass)', 'AsyncTask(ThreadNewIndirect)'];
    validateCoverage({ mapped }, { mapped: [...mapped].reverse() });
    assert.throws(() => validateCoverage({ mapped }, { mapped: mapped.slice(0, 1) }), /production coverage/);
    assert.throws(() => validateCoverage({ mapped }, { mapped: [...mapped, mapped[0]] }), /duplicate/);
    assert.throws(() => validateCoverage({ mapped: [] }, { mapped: [] }), /selected operations/);
});
