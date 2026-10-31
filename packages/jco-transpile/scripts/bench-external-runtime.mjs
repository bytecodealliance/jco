import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCompleteReports } from '../bench/external-runtime/matrix.mjs';

const args = process.argv.slice(2);
const record = args.includes('--record');
const parity = args.includes('--parity');
if (args.some((arg) => !['--smoke', '--record', '--parity'].includes(arg))) {
    throw new Error('Smoke recording requires the complete matrix, without filters');
}
if (record && (parity || process.env.CI)) {
    throw new Error('Recording is disabled in CI and parity runs');
}
const output = resolve(process.env.JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT ?? 'bench/output/external-runtime-named');
await mkdir(output, { recursive: true });
const runDir = await mkdtemp(join(output, 'run-'));
await writeFile(join(output, 'latest.json'), JSON.stringify({ status: 'running', runDir, args }));
let code = 1;
try {
    const child = spawn(
        process.execPath,
        [
            fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json'))),
            'run',
            '-c',
            'bench/external-runtime/vitest.config.ts',
        ],
        {
            stdio: 'inherit',
            env: {
                ...process.env,
                JCO_EXTERNAL_RUNTIME_BENCH_RUN: runDir,
                JCO_EXTERNAL_RUNTIME_BENCH_RECORD: record ? '1' : '0',
                JCO_EXTERNAL_RUNTIME_BENCH_GATE: parity ? 'parity' : 'baseline',
            },
        },
    );
    code = Number(
        await new Promise((resolve, reject) => {
            child.on('error', reject);
            child.on('exit', (code) => resolve(code ?? 1));
        }),
    );
    if (code !== 0) {
        throw new Error(`Benchmark suite exited with code ${code}`);
    }
    const result = JSON.parse(await readFile(join(runDir, 'result.json'), 'utf8'));
    if (!result.complete || result.controls.length !== result.expectedControls) {
        throw new Error('Incomplete smoke controls');
    }
    assertCompleteReports(result.expectedReports, result.reports);
    const entries = Object.entries(result.reports);
    const ratio = (report, axis) => {
        const estimate = report.uncertainty[axis];
        return estimate ? `${estimate.median.toFixed(3)} [${estimate.ci95.map((n) => n.toFixed(3)).join(', ')}]` : '—';
    };
    const invalidMemory = entries.flatMap(([id, report]) =>
        ['inline', 'external'].filter((mode) => !report.memory[mode].valid).map((mode) => `${id}/${mode}`),
    );
    const lines = [
        '# Named runtime smoke checkpoint',
        '',
        `Coverage: ${result.settings.coverage.mapped.length} variants. Checkpoint: ${result.checkpointKey}.`,
        '',
        `Parity: ${result.parityAchieved}. Five-process protocol (actual processes: ${result.settings.processCount}; paired samples/process: ${result.settings.sampleCount}).`,
        '',
        'External / inline timing ratios with 95% process-cluster intervals. Absolute values and raw samples are in JSON.',
        '',
        '| Scenario | Raw inline/external | Gzip inline/external | Brotli inline/external | Size parity losses |',
        '| --- | ---: | ---: | ---: | --- |',
        ...entries.map(
            ([id, r]) =>
                `| ${id} | ${r.size.inline.raw}/${r.size.external.raw} | ${r.size.inline.gzip}/${r.size.external.gzip} | ${r.size.inline.brotli}/${r.size.external.brotli} | ${r.parityLosses.size.join(', ') || 'none'} |`,
        ),
        '',
        '| Scenario | Parse | Link + evaluation | Initialize | Warm call |',
        '| --- | ---: | ---: | ---: | ---: |',
        ...entries.map(
            ([id, r]) =>
                `| ${id} | ${ratio(r, 'parse')} | ${ratio(r, 'evaluate')} | ${ratio(r, 'instantiate')} | ${ratio(r, 'call')} |`,
        ),
        '',
        'Material effects require 5%, a confidence interval excluding 1, and an effect larger than callable identical-code control noise. Other results are inconclusive.',
        '',
        ...entries.flatMap(([id, r]) =>
            Object.entries(r.timingFindings)
                .filter(([, v]) => v.finding.startsWith('material'))
                .map(([axis, v]) => `- ${id}/${axis}: ${v.finding}.`),
        ),
        '',
        `Invalid memory diagnostics (negative GC deltas; excluded from evidence): ${invalidMemory.join(', ') || 'none'}. Memory is diagnostic and excludes native/Wasm memory.`,
        '',
        'Cold native ESM import + initialization observations are separate in JSON; they exclude process launch and core compilation. Browser timing and full historical portfolio are later checkpoints. Inline remains the production default.',
        '',
    ];
    await writeFile(join(runDir, 'summary.md'), lines.join('\n'));
    await writeFile(join(runDir, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
    if (record) {
        await mkdir(dirname(result.baselinePath), { recursive: true });
        await writeFile(
            result.baselinePath,
            JSON.stringify(
                {
                    schema: 2,
                    checkpointKey: result.checkpointKey,
                    environment: result.environment,
                    settings: result.settings,
                    reports: Object.fromEntries(
                        entries.map(([id, r]) => [id, { size: r.size, performance: r.performance }]),
                    ),
                },
                null,
                2,
            ) + '\n',
        );
    }
    await writeFile(
        join(output, 'latest.json'),
        JSON.stringify(
            {
                status: 'complete',
                runDir,
                args,
                checkpointKey: result.checkpointKey,
                parityAchieved: result.parityAchieved,
            },
            null,
            2,
        ) + '\n',
    );
    console.log(`Named runtime smoke: ${runDir}; parity: ${result.parityAchieved}`);
} catch (error) {
    const failure = { status: 'failed', runDir, args, code: code || 1, error: String(error) };
    await writeFile(join(runDir, 'failure.json'), JSON.stringify(failure, null, 2) + '\n');
    await writeFile(join(output, 'latest.json'), JSON.stringify(failure, null, 2) + '\n');
    console.error(error);
    process.exitCode = code || 1;
}
