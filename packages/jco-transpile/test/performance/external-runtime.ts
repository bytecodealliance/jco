import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { expect, test } from 'vitest';
import { transpile } from '../../src/transpile.js';
import { writeFiles } from '../../src/common.js';
import { installRuntime, optimize } from '../../bench/external-runtime/build.js';
import { median, processInterval } from '../../bench/external-runtime/report.js';
import { components } from './workloads.mjs';

const MAX_EXTERNAL_RATIO = 1.1;
const PROCESSES = 5;
const SAMPLES = 15;
const modes = ['inline', 'external'] as const;
const here = new URL('.', import.meta.url);
const exec = promisify(execFile);
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

interface Artifact {
    dir: string;
    bundle: string;
    bundleHash: string;
    wasm: Record<string, string>;
    size: { raw: number; gzip: number; brotli: number };
}
interface Measurement {
    processIndex: number;
    callsPerSample: number;
    raw: { inline: number[]; external: number[] };
    medians: { inline: number; external: number };
    pairedRatio: number;
}
interface Report {
    component: string;
    execution: ReturnType<typeof processInterval>;
    inlineNs: number;
    externalNs: number;
    size: { inline: Artifact['size']; external: Artifact['size'] };
    sizeRatios: Record<string, number>;
    measurements: Measurement[];
}

async function build(
    dir: string,
    component: (typeof components)[number],
    mode: (typeof modes)[number],
): Promise<Artifact> {
    await mkdir(dir, { recursive: true });
    await installRuntime(dir);
    const { files } = await transpile(fileURLToPath(new URL('../fixtures/' + component.fixture, here)), {
        name: 'component',
        instantiation: 'sync',
        asyncMode: 'jspi',
        wasiShim: false,
        base64Cutoff: 0,
        cmRuntimeEsModule: mode === 'external' ? '@bytecodealliance/jco-cm-runtime' : undefined,
    });
    await writeFiles(files, { baseDir: dir });
    const entry = join(dir, 'entry.js');
    await writeFile(
        entry,
        `export { instantiate${component.id === 'p3-future' ? ', _util' : ''} } from './component.js';\n`,
    );
    const { code, builtins } = await optimize(entry, 'rolldown');
    expect(builtins).toEqual([]);
    const bundle = join(dir, 'bundle.mjs');
    await writeFile(bundle, code);
    return {
        dir,
        bundle,
        bundleHash: hash(code),
        wasm: Object.fromEntries(
            Object.entries(files)
                .filter(([name]) => name.endsWith('.wasm'))
                .map(([name, bytes]) => [name, hash(bytes)]),
        ),
        size: {
            raw: Buffer.byteLength(code),
            gzip: gzipSync(code, { level: 9 }).length,
            brotli: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
        },
    };
}

// Serial on purpose: all graphs finish building before any fresh timed worker
// starts, and no component/process overlaps another. No timing retries or saved
// baselines: each component's current inline output is its only comparator.
test(
    'external runtime stays within 10% of inline execution time and bundle size for every component',
    { timeout: 600_000 },
    async () => {
        const parent = fileURLToPath(new URL('../output/external-runtime-performance/', here));
        await mkdir(parent, { recursive: true });
        const output = await mkdtemp(join(parent, 'run-'));
        console.log(`Performance artifacts: ${output}`);
        const groups = [];
        for (const component of components) {
            const pair = {
                inline: await build(join(output, component.id, 'inline'), component, 'inline'),
                external: await build(join(output, component.id, 'external'), component, 'external'),
            };
            expect(pair.inline.wasm, `${component.id}: core Wasm differs between runtime configurations`).toEqual(
                pair.external.wasm,
            );
            groups.push({ component, pair });
        }
        const reports: Report[] = [];
        const resultFile = join(output, 'result.json');
        const save = (complete: boolean) =>
            writeFile(
                resultFile,
                JSON.stringify(
                    { complete, maxExternalRatio: MAX_EXTERNAL_RATIO, processes: PROCESSES, samples: SAMPLES, reports },
                    null,
                    2,
                ) + '\n',
            );
        await save(false);
        for (const { component, pair } of groups) {
            const measurements: Measurement[] = [];
            for (let processIndex = 0; processIndex < PROCESSES; processIndex++) {
                const config = join(output, component.id, `config-${processIndex}.json`);
                const measured = join(output, component.id, `measurements-${processIndex}.json`);
                await writeFile(
                    config,
                    JSON.stringify({ component, pair, processIndex, samples: SAMPLES, output: measured }),
                );
                try {
                    await exec(
                        process.execPath,
                        [
                            '--expose-gc',
                            ...(!('Suspending' in WebAssembly) ? ['--experimental-wasm-jspi'] : []),
                            fileURLToPath(new URL('./worker.mjs', here)),
                            config,
                        ],
                        { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
                    );
                } catch (error) {
                    const failure = error as Error & { stderr?: string; stdout?: string };
                    await writeFile(
                        join(output, component.id, `failure-${processIndex}.log`),
                        `${failure.message}\n${failure.stderr ?? ''}\n${failure.stdout ?? ''}`,
                    );
                    throw new Error(`${component.id}: measurement failed; see ${output}`, { cause: error });
                }
                const measurement: Measurement = JSON.parse(await readFile(measured, 'utf8'));
                for (const mode of modes) {
                    expect(measurement.raw[mode]).toHaveLength(SAMPLES);
                    expect(measurement.raw[mode].every((ns) => Number.isFinite(ns) && ns > 0)).toBe(true);
                    expect(measurement.medians[mode]).toBe(median(measurement.raw[mode]));
                }
                expect(measurement.pairedRatio).toBe(
                    median(measurement.raw.inline.map((ns, i) => measurement.raw.external[i] / ns)),
                );
                measurements.push(measurement);
            }
            for (const mode of modes) {
                expect(hash(await readFile(pair[mode].bundle))).toBe(pair[mode].bundleHash);
                for (const [name, digest] of Object.entries(pair[mode].wasm)) {
                    expect(hash(await readFile(join(pair[mode].dir, name)))).toBe(digest);
                }
            }
            const execution = processInterval(measurements.map((measurement) => measurement.pairedRatio));
            const sizeRatios = Object.fromEntries(
                Object.keys(pair.inline.size).map((key) => {
                    const axis = key as keyof Artifact['size'];
                    return [axis, pair.external.size[axis] / pair.inline.size[axis]];
                }),
            );
            reports.push({
                component: component.id,
                execution,
                inlineNs: median(measurements.map((m) => m.medians.inline)),
                externalNs: median(measurements.map((m) => m.medians.external)),
                size: { inline: pair.inline.size, external: pair.external.size },
                sizeRatios,
                measurements,
            });
            await save(false);
            console.log(
                `${component.id}: external/inline execution ${execution.median.toFixed(3)} (95% process interval ${execution.ci95.map((n) => n.toFixed(3)).join('–')}), size ${JSON.stringify(sizeRatios)}`,
            );
            // Per-component limits: an improvement elsewhere cannot hide a regression.
            // The observed process-median ratio is the gate; the interval is diagnostic.
            expect
                .soft(
                    execution.median,
                    `${component.id}: external execution exceeds 110% of inline; artifacts: ${output}`,
                )
                .toBeLessThanOrEqual(MAX_EXTERNAL_RATIO);
            for (const [axis, ratio] of Object.entries(sizeRatios)) {
                expect
                    .soft(
                        ratio,
                        `${component.id}: external ${axis} JavaScript exceeds 110% of inline; artifacts: ${output}`,
                    )
                    .toBeLessThanOrEqual(MAX_EXTERNAL_RATIO);
            }
        }
        await save(true);
    },
);
