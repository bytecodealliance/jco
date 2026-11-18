import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const requireTranspile = createRequire(resolve(root, '../jco-transpile/package.json'));
const variants = ['baseline', 'optimized', 'retained', 'lean'];
const baseline = 'd7e296bed';

/** Median of numeric observations. */
function median(values) {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)];
}

/** Run a single process's samples; launch overhead and all setup are excluded. */
async function worker(bundle) {
    const { workloads } = await import(pathToFileURL(bundle).href);
    const selected = process.env.JCO_LABEL_BENCH_CASES?.split(',');
    const cases = workloads().filter((item) => !selected || selected.includes(item.name));
    assert.ok(cases.length > 0, 'select at least one known workload');
    const observations = [];
    for (const item of cases) {
        let iterations = 1;
        for (;;) {
            const start = performance.now();
            assert.equal(item.run(iterations), item.expected * iterations);
            const elapsed = performance.now() - start;
            if (elapsed > 15 || iterations >= 1_000_000) {
                break;
            }
            iterations *= 2;
        }
        // Keep the import checksum in signed i32 range.
        iterations = Math.min(iterations, 1_000_000);
        for (let warm = 0; warm < 5; warm++) {
            assert.equal(item.run(iterations), item.expected * iterations);
        }
        const samples = [];
        for (let sample = 0; sample < 9; sample++) {
            const start = performance.now();
            const value = item.run(iterations);
            const elapsed = performance.now() - start;
            assert.equal(value, item.expected * iterations);
            samples.push((elapsed * 1e6) / iterations / item.units);
        }
        observations.push({ name: item.name, iterations, units: item.units, samples, nsPerUnit: median(samples) });
    }
    console.log(JSON.stringify(observations));
}

/** Build every variant first, then measure in separate processes with rotating order. */
async function main() {
    if (process.argv[2] === '--worker') {
        await worker(process.argv[3]);
        return;
    }
    const { rolldown } = await import(pathToFileURL(requireTranspile.resolve('rolldown')).href);
    const output = resolve(root, process.env.JCO_LABEL_BENCH_OUTPUT ?? 'bench/output/labels');
    await mkdir(output, { recursive: true });
    const builds = [];
    for (const variant of variants) {
        const bundle = await rolldown({
            input: resolve(here, 'workload.mjs'),
            platform: 'node',
            transform: {
                dropLabels: variant === 'retained' ? [] : variant === 'lean' ? ['DEBUG', 'SAFETY'] : ['DEBUG'],
            },
            plugins: [
                {
                    name: 'runtime-at-baseline',
                    load(id) {
                        if (variant !== 'baseline' || !id.startsWith(resolve(root, 'src') + '/')) {
                            return;
                        }
                        if (id.endsWith('/intrinsics/call-context.ts')) {
                            return 'export const createLiftContext = (options) => options;';
                        }
                        const path = 'packages/jco-cm-runtime/' + id.slice(root.length + 1);
                        return execFileSync('git', ['show', `${baseline}:${path}`], {
                            cwd: root,
                            encoding: 'utf8',
                            maxBuffer: 8 * 1024 * 1024,
                        });
                    },
                },
            ],
        });
        const path = resolve(output, `${variant}.mjs`);
        const { output: chunks } = await bundle.write({ file: path, format: 'esm', minify: true });
        await bundle.close();
        const code = chunks.find((chunk) => chunk.type === 'chunk').code;
        if (variant !== 'retained') {
            assert.ok(!code.includes('[contextGet()] args'), 'diagnostic arguments must be eliminated');
        }
        builds.push({
            variant,
            path,
            bytes: Buffer.byteLength(code),
            gzip: gzipSync(code).length,
            sha256: createHash('sha256').update(code).digest('hex'),
        });
    }
    const measurements = [];
    const processes = Number(process.env.JCO_LABEL_BENCH_PROCESSES ?? 5);
    assert.ok(Number.isInteger(processes) && processes > 0);
    const env = { ...process.env };
    delete env.JCO_DEBUG;
    for (let round = 0; round < processes; round++) {
        const order = [...builds.slice(round % builds.length), ...builds.slice(0, round % builds.length)];
        if (round % 2) {
            order.reverse();
        }
        for (const build of order) {
            const stdout = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', build.path], {
                env,
                encoding: 'utf8',
                maxBuffer: 8 * 1024 * 1024,
            });
            measurements.push({ variant: build.variant, round, observations: JSON.parse(stdout) });
        }
        console.log(`Completed process round ${round + 1}/${processes}`);
    }
    const summary = [];
    for (const name of measurements[0].observations.map((item) => item.name)) {
        const row = { workload: name };
        for (const variant of variants) {
            const times = measurements
                .filter((item) => item.variant === variant)
                .map((item) => item.observations.find((entry) => entry.name === name).nsPerUnit);
            row[variant] = { median: median(times), min: Math.min(...times), max: Math.max(...times) };
        }
        summary.push(row);
    }
    const report = {
        baseline,
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        diff: execFileSync('git', ['diff', '--stat'], { cwd: root, encoding: 'utf8' }),
        node: process.version,
        v8: process.versions.v8,
        cpu: cpus()[0].model,
        platform: process.platform,
        arch: process.arch,
        processes,
        selectedCases: process.env.JCO_LABEL_BENCH_CASES?.split(',') ?? null,
        samplesPerProcess: 9,
        builtAt: new Date().toISOString(),
        builds,
        measurements,
        summary,
    };
    await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    // Preserve all experimental source alongside the raw measurements.
    for (const file of ['run.mjs', 'workload.mjs', 'confirm.mjs']) {
        await writeFile(resolve(output, file + '.txt'), await readFile(resolve(here, file)));
    }
    console.table(
        summary.map((row) =>
            Object.fromEntries(
                Object.entries(row).map(([key, value]) => [
                    key,
                    typeof value === 'string' ? value : value.median.toFixed(2),
                ]),
            ),
        ),
    );
    console.log(`Nanoseconds per operation (per scalar for 16-value lifts). Artifacts: ${output}`);
}

await main();
