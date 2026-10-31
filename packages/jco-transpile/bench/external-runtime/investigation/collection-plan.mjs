import assert from 'node:assert/strict';
import { parity } from '../report.ts';

// Both cohorts are mandatory, declared before the first accepted observation.
export const requiredCohorts = Object.freeze([5, 10]);
export function collectionSettings(processCount) {
    assert.ok(requiredCohorts.includes(processCount), 'Use five or ten complete process repetitions');
    return {
        schema: 1,
        portfolio: 'full',
        comparison: 'matched old-inline/current-inline/factory/named',
        requiredCohorts,
        processCount,
        sampleCount: 15,
        seed: 20261021,
        modeOrder: 'Williams orders; process/sample phase rotation, four orders per cycle',
        scenarioOrder: '(scenario index + seed + process index) modulo 68',
        calibration: { targetNs: 15_000_000, maxCalls: 262144, commonAcrossModes: true },
        debug: 'dynamic',
        debugEnvironment: null,
        minimumMaterialEffect: 0.05,
        uncertainty: 'seeded percentile process-cluster bootstrap, 10000 resamples',
        noise: 'maximum absolute endpoint deviation from 1 in identical scalar control CI',
        parity,
        childTimeoutMs: 120_000,
        // Four modes double the old two-mode matrix's allowed per-entry work.
        matrixTimeoutMs: 68 * processCount * 12_000 + 360 * 1_000,
        memory: { stores: 64, independentProcessPerMode: true, diagnosticOnly: true },
        coldNative:
            'bundle ESM import + initialize; excludes launch, core compilation and shim/import setup; diagnostic only',
        normalization: '(named/current-inline)/(factory/old-inline), alongside all direct paired ratios',
        recording: false,
    };
}
