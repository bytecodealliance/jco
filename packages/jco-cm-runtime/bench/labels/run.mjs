import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { cpus, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

import { median } from './statistics.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

/** Resolve a ref once and extract its runtime and matching test helpers. */
async function snapshot(ref, directory) {
    const revision = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'], {
        cwd: root,
        encoding: 'utf8',
    }).trim();
    const archive = execFileSync('git', ['archive', '--format=tar', revision, 'src', 'test'], {
        cwd: root,
        maxBuffer: 32 * 1024 * 1024,
    });
    await mkdir(resolve(directory, 'bench/labels'), { recursive: true });
    execFileSync('tar', ['-xf', '-', '-C', directory], { input: archive });
    await copyFile(resolve(here, 'workload.mjs'), resolve(directory, 'bench/labels/workload.mjs'));
    return { directory, revision, ref };
}

/** Bundle the same workload driver with the selected tree's modules and helpers. */
async function buildVariant(rolldown, output, temporary, variant, source, dropLabels) {
    const workload = resolve(source.directory, 'bench/labels/workload.mjs');
    const factory = resolve(source.directory, 'src/intrinsics/call-context.ts');
    const hasFactory = existsSync(factory);
    const specifier = (path) => JSON.stringify(path.replaceAll('\\', '/'));
    const entry = resolve(temporary, variant + '.mjs');
    await writeFile(
        entry,
        [
            `import { workloads as createWorkloads } from ${specifier(workload)};`,
            hasFactory ? `import { createLiftContext } from ${specifier(factory)};` : '',
            `export const workloads = () => createWorkloads(${hasFactory ? 'createLiftContext' : ''});`,
        ].join('\n'),
    );
    const bundle = await rolldown({ input: entry, platform: 'node', transform: { dropLabels } });
    try {
        const file = variant + '.mjs';
        const {
            output: [chunk],
        } = await bundle.write({ file: resolve(output, file), format: 'esm', minify: true });
        return {
            variant,
            file,
            ref: source.ref,
            revision: source.revision,
            dropLabels,
            contextFactory: hasFactory ? 'createLiftContext' : 'plain object',
            bytes: Buffer.byteLength(chunk.code),
            gzip: gzipSync(chunk.code).length,
            sha256: createHash('sha256').update(chunk.code).digest('hex'),
        };
    } finally {
        await bundle.close();
    }
}

/** Run a single process's samples; launch overhead and all setup are excluded. */
async function worker(bundle) {
    const { workloads } = await import(pathToFileURL(bundle).href);
    const selected = process.env.JCO_LABEL_BENCH_CASES?.split(',');
    const cases = workloads().filter((item) => !selected || selected.includes(item.name));
    for (const name of selected ?? []) {
        assert.ok(
            cases.some((item) => item.name === name),
            'unknown workload: ' + name,
        );
    }
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
    const { values } = parseArgs({ options: { baseline: { type: 'string' }, candidate: { type: 'string' } } });
    const processes = Number(process.env.JCO_LABEL_BENCH_PROCESSES ?? 5);
    assert.ok(Number.isSafeInteger(processes) && processes > 0, 'expected a positive process count');

    const { rolldown } = await import('rolldown');
    const output = resolve(root, process.env.JCO_LABEL_BENCH_OUTPUT ?? 'bench/output/labels');
    await mkdir(output, { recursive: true });
    const temporary = await mkdtemp(resolve(tmpdir(), 'jco-runtime-bench-'));
    const builds = [];
    try {
        if (values.baseline !== undefined) {
            const base = await snapshot(values.baseline, resolve(temporary, 'base'));
            builds.push(await buildVariant(rolldown, output, temporary, 'baseline', base, ['DEBUG']));
        }
        const candidate =
            values.candidate === undefined
                ? {
                      directory: root,
                      ref: 'working tree',
                      revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
                  }
                : await snapshot(values.candidate, resolve(temporary, 'candidate'));
        for (const [variant, labels] of [
            ['checked', ['DEBUG']],
            ['debug', []],
            ['lean', ['DEBUG', 'SAFETY']],
        ]) {
            builds.push(await buildVariant(rolldown, output, temporary, variant, candidate, labels));
        }
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }

    const measurements = [];
    const env = { ...process.env };
    delete env.JCO_DEBUG;
    for (let round = 0; round < processes; round++) {
        const order = [...builds.slice(round % builds.length), ...builds.slice(0, round % builds.length)];
        if (round % 2) {
            order.reverse();
        }
        for (const build of order) {
            const stdout = execFileSync(
                process.execPath,
                [fileURLToPath(import.meta.url), '--worker', resolve(output, build.file)],
                {
                    env,
                    encoding: 'utf8',
                    maxBuffer: 8 * 1024 * 1024,
                },
            );
            measurements.push({ variant: build.variant, round, observations: JSON.parse(stdout) });
        }
        console.log(`Completed process round ${round + 1}/${processes}`);
    }
    const summary = [];
    for (const name of measurements[0].observations.map((item) => item.name)) {
        const row = { workload: name };
        for (const { variant } of builds) {
            const times = measurements
                .filter((item) => item.variant === variant)
                .map((item) => item.observations.find((entry) => entry.name === name).nsPerUnit);
            row[variant] = { median: median(times), min: Math.min(...times), max: Math.max(...times) };
        }
        summary.push(row);
    }
    const report = {
        workingTreeStatus:
            values.candidate === undefined
                ? execFileSync('git', ['status', '--short', '--', 'src', 'test'], { cwd: root, encoding: 'utf8' })
                : null,
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
