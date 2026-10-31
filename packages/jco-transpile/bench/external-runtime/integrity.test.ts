import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assert, expect, test } from 'vitest';
import { measure } from './measure.js';
import { parityLosses, processInterval, regressionLosses } from './report.js';
const exec = promisify(execFile);

test.concurrent.each([0, 42])('rejects two equally wrong constant implementations (%s)', async (answer) => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-metrics-canary-'));
    try {
        const bundle = join(dir, 'stub.mjs');
        await writeFile(bundle, `export function create0() { return { add: { add: () => ${answer} } }; }`);
        const artifact = { dir, bundle, parts: ['adder'] as const, wasm: { bytes: 0, files: {} } };
        await expect(measure({ inline: artifact, external: artifact })).rejects.toThrow(/known answers|42|checksum/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test.concurrent('rejects missing/nonfinite metrics and reports parity independently', () => {
    assert.throws(() => parityLosses({ inline: {}, external: {} }));
    assert.throws(() => parityLosses({ inline: { parse: 1 }, external: {} }));
    assert.throws(() => parityLosses({ inline: { parse: 1 }, external: { parse: NaN } }));
    assert.deepEqual(parityLosses({ inline: { raw: 100 }, external: { raw: 1000 } }), ['raw']);
    assert.deepEqual(
        regressionLosses(
            { inline: { raw: 100 }, external: { raw: 1000 } },
            { inline: { raw: 100 }, external: { raw: 1000 } },
            'size',
        ),
        [],
    );
    assert.isNotEmpty(
        regressionLosses(
            { inline: { raw: 2000 }, external: { raw: 2000 } },
            { inline: { raw: 1000 }, external: { raw: 1000 } },
            'size',
        ),
    );
    assert.throws(() => processInterval([1, 1, 1, NaN, 1]));
    assert.deepEqual(processInterval([1, 1, 1, 1, 1]).ci95, [1, 1]);
});
test.concurrent.each(['ci', 'filter'] as const)('refuses protected baseline recording (%s)', async (mode) => {
    const script = fileURLToPath(new URL('../../scripts/bench-external-runtime.mjs', import.meta.url));
    await expect(
        exec(process.execPath, [script, '--record', ...(mode === 'filter' ? ['adder'] : [])], {
            env: { ...process.env, ...(mode === 'ci' ? { CI: '1' } : {}) },
        }),
    ).rejects.toThrow(/Recording is disabled|without filters/);
});

test.concurrent('rejects missing inner samples even when reported medians look valid', async () => {
    const { validateMeasurement, timingFinding } = await import('./report.js');
    assert.throws(() =>
        validateMeasurement(
            { medians: { inline: { parse: 1 }, external: { parse: 1 } }, pairedRatios: { parse: 1 } },
            15,
        ),
    );
    assert.throws(() =>
        validateMeasurement(
            {
                medians: { inline: { parse: 1 }, external: { parse: 1 } },
                pairedRatios: { parse: 1 },
                samples: { inline: { parse: [1] }, external: { parse: [1] } },
                coldNative: { inline: 1, external: 1 },
            },
            15,
        ),
    );
    assert.equal(timingFinding({ median: 0.8, range: [0.7, 0.9], ci95: [0.7, 0.9] }, 0.05), 'material improvement');
    assert.include(timingFinding({ median: 0.8, range: [0.7, 1.1], ci95: [0.7, 1.1] }, 0.05), 'inconclusive');
});

test.concurrent('requires every declared matrix report and rejects extras', async () => {
    const { assertCompleteReports } = await import('./matrix.mjs');
    assert.throws(() => assertCompleteReports(['a', 'b'], { a: {} }));
    assert.throws(() => assertCompleteReports(['a'], { a: {}, b: {} }));
    assert.throws(() => assertCompleteReports([], {}));
    assertCompleteReports(['a'], { a: {} });
});
