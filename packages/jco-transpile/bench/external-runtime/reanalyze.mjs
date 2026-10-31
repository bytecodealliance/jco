// Recompute derived uncertainty without changing measurements or recorded gates.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertCompleteReports } from './matrix.mjs';
import { parityLosses, processInterval, timingFinding } from './report.ts';

const [input, output] = process.argv.slice(2);
assert(
    input && output && resolve(input) !== resolve(output),
    'Provide distinct input-result and output-analysis paths',
);
const inputSource = await readFile(input, 'utf8');
const result = JSON.parse(inputSource);
assert.equal(result.schema, 2);
assert.equal(result.complete, true);
assertCompleteReports(result.expectedReports, result.reports);
const hash = (source) => createHash('sha256').update(source).digest('hex');
const sources = {};
for (const name of ['report.ts', 'reanalyze.mjs']) {
    sources[name] = await readFile(new URL(name, import.meta.url), 'utf8');
}
const reports = {};
for (const [id, report] of Object.entries(result.reports)) {
    assert.equal(report.raw.length, result.settings.processCount);
    reports[id] = {
        uncertainty: Object.fromEntries(
            Object.keys(report.performance.inline).map((axis) => [
                axis,
                processInterval(report.raw.map((run) => run.pairedRatios[axis])),
            ]),
        ),
    };
}
for (const [id, report] of Object.entries(reports)) {
    const controlId = id.slice(0, id.lastIndexOf('--')) + '--noise';
    const control = reports[controlId];
    assert(control, `Missing identical-code noise control: ${controlId}`);
    report.timingFindings = Object.fromEntries(
        Object.entries(report.uncertainty).map(([axis, estimate]) => {
            const bounds = control.uncertainty[axis].ci95;
            const noise = Math.max(Math.abs(bounds[0] - 1), Math.abs(bounds[1] - 1));
            return [axis, { finding: timingFinding(estimate, noise), noise }];
        }),
    );
}
const parityAchieved = Object.values(result.reports).every(
    (report) => parityLosses(report.size).length + parityLosses(report.performance).length === 0,
);
assert.equal(parityAchieved, result.parityAchieved, 'Reanalysis must preserve recorded parity');
await writeFile(
    output,
    JSON.stringify(
        {
            schema: 1,
            inputCheckpoint: result.checkpointKey,
            inputSha256: hash(inputSource),
            method: 'seeded xorshift32 full-word index sampling; 10000 process-cluster resamples',
            medianConvention: 'upper middle value for even process counts, unchanged',
            sources,
            sourceSha256: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, hash(source)])),
            processCount: result.settings.processCount,
            parityAchieved,
            reports,
        },
        null,
        2,
    ) + '\n',
    { flag: 'wx' },
);
