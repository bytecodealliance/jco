import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const comparisons = [
    ['retained', 'optimized', 'context-wasm'],
    ...[
        'record-flat-16-reused',
        'record-flat-16-fresh',
        'record-flat-16-owned',
        'record-flat-128-owned',
        'context-js',
        'context-wasm',
        'rep-get',
        'rep-recycle',
        'lift-flat-16',
        'lift-memory-16',
        'utf16-1280-units',
        'utf8-ascii-4096',
        'utf8-mixed-4096',
        'queue-4096-chunks',
        'bulk-bytes-4096',
    ].map((name) => ['baseline', 'optimized', name]),
];

/** Median of measured durations or ratios. */
function median(values) {
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.floor(ordered.length / 2)];
}

/** Measure one hot loop, checking its result outside the timed interval. */
function measure(item, iterations) {
    const start = performance.now();
    const value = item.run(iterations);
    const duration = performance.now() - start;
    assert.equal(value, item.expected * iterations);
    return (duration * 1e6) / iterations / item.units;
}

/** Compare the same workload in two bundles with alternating sample order. */
async function worker(output, reverse) {
    const rows = [];
    const order = reverse ? [...comparisons].reverse() : comparisons;
    // Construct each module's classes once so the baseline does not see more
    // receiver shapes than a candidate merely because it appears in more pairs.
    const cases = new Map();
    for (const variant of new Set(comparisons.flatMap(([baseline, candidate]) => [baseline, candidate]))) {
        const module = await import(pathToFileURL(resolve(output, variant + '.mjs')).href);
        cases.set(variant, module.workloads());
    }
    for (const [baseline, variant, name] of order) {
        const before = cases.get(baseline).find((item) => item.name === name);
        const after = cases.get(variant).find((item) => item.name === name);
        let iterations = 1;
        while (iterations < 1_000_000 && measure(before, iterations) * iterations * before.units < 20e6) {
            iterations *= 2;
        }
        iterations = Math.min(iterations, 1_000_000);
        for (let warm = 0; warm < 10; warm++) {
            measure(before, iterations);
            measure(after, iterations);
        }
        const samples = [];
        for (let index = 0; index < 12; index++) {
            let beforeNs;
            let afterNs;
            if ((index % 2 === 0) !== reverse) {
                beforeNs = measure(before, iterations);
                afterNs = measure(after, iterations);
            } else {
                afterNs = measure(after, iterations);
                beforeNs = measure(before, iterations);
            }
            samples.push({ beforeNs, afterNs, speedup: beforeNs / afterNs });
        }
        rows.push({
            baseline,
            variant,
            name,
            iterations,
            samples,
            beforeNs: median(samples.map((sample) => sample.beforeNs)),
            afterNs: median(samples.map((sample) => sample.afterNs)),
            speedup: median(samples.map((sample) => sample.speedup)),
        });
    }
    console.log(JSON.stringify(rows));
}

/** Reuse existing bundles and preserve raw paired observations beside them. */
async function main() {
    const output = resolve(process.argv[2] ?? resolve(here, '../output/labels'));
    if (process.argv[3] === '--worker') {
        await worker(output, process.argv[4] === 'reverse');
        return;
    }
    const env = { ...process.env };
    delete env.JCO_DEBUG;
    const rounds = [];
    for (let round = 0; round < 5; round++) {
        const stdout = execFileSync(
            process.execPath,
            [fileURLToPath(import.meta.url), output, '--worker', round % 2 ? 'reverse' : 'forward'],
            { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
        );
        rounds.push(JSON.parse(stdout));
        console.log(`Paired round ${round + 1}/5`);
    }
    const summary = comparisons.map(([baseline, variant, name]) => {
        const rows = rounds.map((round) =>
            round.find((row) => row.variant === variant && row.baseline === baseline && row.name === name),
        );
        return {
            baseline,
            variant,
            name,
            beforeNs: median(rows.map((row) => row.beforeNs)),
            afterNs: median(rows.map((row) => row.afterNs)),
            speedup: median(rows.map((row) => row.speedup)),
            minSpeedup: Math.min(...rows.map((row) => row.speedup)),
            maxSpeedup: Math.max(...rows.map((row) => row.speedup)),
        };
    });
    const original = JSON.parse(await readFile(resolve(output, 'results.json'), 'utf8'));
    const report = {
        node: process.version,
        v8: process.versions.v8,
        cpu: original.cpu,
        builds: original.builds,
        measuredAt: new Date().toISOString(),
        rounds,
        summary,
    };
    await writeFile(resolve(output, 'paired.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(resolve(output, 'confirm.mjs.txt'), await readFile(fileURLToPath(import.meta.url)));
    console.table(summary);
}

await main();
