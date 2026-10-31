import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { fullScenarios } from '../cases.js';
import { modes } from './matched-protocol.mjs';
import { collectionSettings } from './collection-plan.mjs';
import { nodeWorker } from './node-worker.mjs';
import { summarizeMatched } from './summarize.mjs';

test.concurrent.each([
    { args: ['--record'], error: /Unknown argument/ },
    { args: ['adder'], error: /Unknown argument/ },
    { args: ['--source', 'unused', '--anchor', 'unused', '--processes', '3'], error: /five or ten/ },
    { args: ['--source', 'unused', '--source', 'unused'], error: /Duplicate argument/ },
])('standalone collection rejects incomplete/recording arguments: $args', async ({ args, error }) => {
    const script = fileURLToPath(new URL('../../../scripts/investigate-external-runtime.mjs', import.meta.url));
    const task = nodeWorker([script, ...args]);
    await assert.rejects(task.done, error);
    assert.equal(task.child.exitCode, 1);
});

// Synthetic clusters exercise report integrity; they are never timing evidence.
function fixture() {
    const graphs = ['rolldown', 'rollup'].flatMap((bundler) =>
        ['file', 'package'].flatMap((resolution) =>
            fullScenarios.map((scenario) => ({
                id: `${bundler}--${resolution}--${scenario.id}`,
                bundler,
                resolution,
                scenario: scenario.id,
                artifacts: Object.fromEntries(
                    modes.map((mode) => [mode, { parts: scenario.components, js: { raw: 100, gzip: 50, brotli: 40 } }]),
                ),
            })),
        ),
    );
    const runs = Object.fromEntries(
        graphs.map((graph) => [
            graph.id,
            Array.from({ length: 5 }, (_, processIndex) => {
                const callable = !['empty', 'streams'].includes(graph.scenario);
                const axes = ['parse', 'evaluate', 'instantiate', ...(callable ? ['call'] : [])];
                const ratio = ['noise', 'empty'].includes(graph.scenario) ? 1 : [0.8, 0.85, 0.9, 0.95, 1][processIndex];
                // Orders are specified independently of the production order helper.
                const orders = [
                    ['old-inline', 'inline', 'named', 'factory'],
                    ['inline', 'factory', 'old-inline', 'named'],
                    ['factory', 'named', 'inline', 'old-inline'],
                    ['named', 'old-inline', 'factory', 'inline'],
                ];
                return {
                    processIndex,
                    sampleCount: 15,
                    callsPerSample: callable ? 16 : 0,
                    sink: 42,
                    verified: graph.artifacts.inline.parts,
                    order: orders[processIndex % 4],
                    sampleOrders: Array.from({ length: 15 }, (_, i) => orders[(processIndex + i) % 4]),
                    samples: Object.fromEntries(
                        modes.map((mode) => [
                            mode,
                            Object.fromEntries(
                                axes.map((axis) => [axis, Array(15).fill(mode === 'named' ? ratio * 100 : 100)]),
                            ),
                        ]),
                    ),
                    medians: Object.fromEntries(
                        modes.map((mode) => [
                            mode,
                            Object.fromEntries(axes.map((axis) => [axis, mode === 'named' ? ratio * 100 : 100])),
                        ]),
                    ),
                    coldNative: Object.fromEntries(modes.map((mode) => [mode, 100])),
                    pairedRatios: Object.fromEntries(
                        [
                            'named-vs-factory',
                            'named-vs-inline',
                            'factory-vs-old-inline',
                            'inline-vs-old-inline',
                            'normalized-overhead',
                        ].map((comparison) => [
                            comparison,
                            Object.fromEntries(
                                axes.map((axis) => [
                                    axis,
                                    ['factory-vs-old-inline', 'inline-vs-old-inline'].includes(comparison) ? 1 : ratio,
                                ]),
                            ),
                        ]),
                    ),
                };
            }),
        ]),
    );
    const memory = Object.fromEntries(
        graphs.map((graph) => [
            graph.id,
            Object.fromEntries(
                modes.map((mode) => [
                    mode,
                    { mode, stores: 64, deltas: { heapUsed: 1, external: 1, arrayBuffers: 1 }, valid: true },
                ]),
            ),
        ]),
    );
    return { graphs, runs, memory };
}

test.concurrent('complete synthetic clusters retain uncertainty and reject incomplete evidence', () => {
    const data = fixture();
    const reports = summarizeMatched(data.graphs, data.runs, 5, data.memory);
    assert.equal(Object.keys(reports).length, 68);
    const adder = reports['rolldown--file--adder'];
    assert.deepEqual(adder.uncertainty['named-vs-factory'].parse, { median: 0.9, range: [0.8, 1], ci95: [0.8, 1] });
    assert.match(adder.timingFindings['named-vs-factory'].parse.finding, /inconclusive/);
    assert.deepEqual(Object.keys(reports['rolldown--file--streams'].performance.named).sort(), [
        'evaluate',
        'instantiate',
        'parse',
    ]);
    const settings = collectionSettings(5);
    assert.deepEqual(settings.requiredCohorts, [5, 10]);
    assert.equal(settings.parity.call.slack, 250);
    assert.equal(settings.recording, false);
    const incomplete = fixture();
    delete incomplete.runs['rolldown--file--adder'];
    assert.throws(
        () => summarizeMatched(incomplete.graphs, incomplete.runs, 5, incomplete.memory),
        /Incomplete report matrix/,
    );
    const duplicate = fixture();
    duplicate.runs['rolldown--file--adder'][4].processIndex = 0;
    assert.throws(() => summarizeMatched(duplicate.graphs, duplicate.runs, 5, duplicate.memory));
    const missingCall = fixture();
    const run = missingCall.runs['rolldown--file--adder'][0];
    for (const mode of modes) {
        delete run.samples[mode].call;
        delete run.medians[mode].call;
    }
    for (const ratios of Object.values(run.pairedRatios)) {
        delete ratios.call;
    }
    run.callsPerSample = 0;
    assert.throws(
        () => summarizeMatched(missingCall.graphs, missingCall.runs, 5, missingCall.memory),
        /missing expected metric/,
    );
    const invalidMemory = fixture();
    invalidMemory.memory['rolldown--file--adder'].named.deltas.heapUsed = -1;
    assert.throws(() => summarizeMatched(invalidMemory.graphs, invalidMemory.runs, 5, invalidMemory.memory));
});
