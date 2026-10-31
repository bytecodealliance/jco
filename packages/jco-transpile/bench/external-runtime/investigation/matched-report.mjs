import assert from 'node:assert/strict';
import { median, validateMeasurement } from '../report.ts';
import { comparisons, modes, sampleOrder } from './matched-protocol.mjs';

/** Check actual raw observations before the standalone collector summarizes them. */
export function validateMatchedMeasurement(result, sampleCount = 15) {
    assert.equal(result.sampleCount, sampleCount);
    assert.ok(Number.isInteger(sampleCount) && sampleCount >= 15);
    assert.ok(Number.isInteger(result.processIndex) && result.processIndex >= 0);
    for (const field of ['samples', 'medians', 'coldNative']) {
        assert.deepEqual(Object.keys(result[field]).sort(), [...modes].sort(), `incomplete ${field}`);
    }
    assert.deepEqual(result.order, sampleOrder(result.processIndex));
    assert.deepEqual(
        result.sampleOrders,
        Array.from({ length: sampleCount }, (_, i) => sampleOrder(result.processIndex, i)),
    );
    assert.deepEqual(
        Object.keys(result.pairedRatios).sort(),
        [...Object.keys(comparisons), 'normalized-overhead'].sort(),
    );
    const axes = Object.keys(result.medians.inline).sort();
    assert.deepEqual(axes, ['parse', 'evaluate', 'instantiate', ...(axes.includes('call') ? ['call'] : [])].sort());
    assert.ok(Number.isFinite(result.sink));
    assert.ok(
        axes.includes('call')
            ? Number.isInteger(result.callsPerSample) && result.callsPerSample >= 16
            : result.callsPerSample === 0,
    );
    for (const [comparison, [base, candidate]] of Object.entries(comparisons)) {
        validateMeasurement(
            {
                medians: { inline: result.medians[base], external: result.medians[candidate] },
                pairedRatios: result.pairedRatios[comparison],
                samples: { inline: result.samples[base], external: result.samples[candidate] },
                coldNative: { inline: result.coldNative[base], external: result.coldNative[candidate] },
            },
            sampleCount,
        );
    }
    assert.deepEqual(Object.keys(result.pairedRatios['normalized-overhead']).sort(), axes);
    for (const axis of axes) {
        const expected = median(
            result.samples.inline[axis].map(
                (value, i) =>
                    result.samples.named[axis][i] /
                    value /
                    (result.samples.factory[axis][i] / result.samples['old-inline'][axis][i]),
            ),
        );
        assert.equal(
            result.pairedRatios['normalized-overhead'][axis],
            expected,
            'normalized ratio must match raw paired observations',
        );
    }
    return axes;
}
