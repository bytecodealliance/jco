import assert from 'node:assert/strict';

export const modes = Object.freeze(['old-inline', 'inline', 'factory', 'named']);
export const comparisons = Object.freeze({
    'named-vs-factory': ['factory', 'named'],
    'named-vs-inline': ['inline', 'named'],
    'factory-vs-old-inline': ['old-inline', 'factory'],
    'inline-vs-old-inline': ['old-inline', 'inline'],
});
// Williams orders: each mode occupies each position, and every directed
// adjacent pair occurs once across four successive samples.
const orders = [
    [0, 1, 3, 2],
    [1, 2, 0, 3],
    [2, 3, 1, 0],
    [3, 0, 2, 1],
];
export function sampleOrder(processIndex, sample = 0) {
    assert.ok(Number.isInteger(processIndex) && processIndex >= 0);
    assert.ok(Number.isInteger(sample) && sample >= 0);
    return orders[(processIndex + sample) % orders.length].map((i) => modes[i]);
}
export function validateArtifacts(artifacts) {
    assert.deepEqual(Object.keys(artifacts).sort(), [...modes].sort(), 'all four explicit modes are required');
    for (const artifact of Object.values(artifacts)) {
        assert.deepEqual(artifact.parts, artifacts.inline.parts, 'component selections must match');
        assert.deepEqual(artifact.wasm, artifacts.inline.wasm, 'core Wasm must match');
        assert.ok(artifact.bundle && artifact.dir);
    }
}

/** Match the current producer inventory, not a historical fixed variant count. */
export function validateCoverage(current, production) {
    for (const coverage of [current, production]) {
        assert.ok(
            Array.isArray(coverage?.mapped) && coverage.mapped.length > 0,
            'coverage must list selected operations',
        );
        assert.equal(new Set(coverage.mapped).size, coverage.mapped.length, 'duplicate coverage operation');
    }
    assert.deepEqual(
        [...current.mapped].sort(),
        [...production.mapped].sort(),
        'production coverage differs from the selected runtime',
    );
}
