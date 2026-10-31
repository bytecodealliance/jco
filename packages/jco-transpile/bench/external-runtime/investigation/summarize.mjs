import assert from 'node:assert/strict';
import { assertCompleteReports, expectedReportIds } from '../matrix.mjs';
import { median, parityLosses, processInterval, timingFinding } from '../report.ts';
import { comparisons, modes } from './matched-protocol.mjs';
import { validateMatchedMeasurement } from './matched-report.mjs';

/** Summarize independent process clusters; keep every raw observation. */
export function summarizeMatched(graphs, runs, processCount, memory) {
    assert.ok([5, 10].includes(processCount));
    const expected = expectedReportIds('full');
    assertCompleteReports(expected, Object.fromEntries(graphs.map((graph) => [graph.id, graph])));
    assert.equal(graphs.length, expected.length, 'duplicate graphs');
    assertCompleteReports(expected, runs);
    assertCompleteReports(expected, memory);
    /** @type {Record<string, any>} JSON report entries are checked against raw observations below. */
    const reports = {};
    for (const graph of graphs) {
        const raw = runs[graph.id];
        assert.equal(raw.length, processCount, 'incomplete process repetitions');
        assert.deepEqual(
            raw.map((run) => run.processIndex).sort((a, b) => a - b),
            Array.from({ length: processCount }, (_, i) => i),
        );
        const hasCall = !graph.artifacts.inline.parts.some((part) => ['empty', 'streams'].includes(part));
        const axes = ['parse', 'evaluate', 'instantiate', ...(hasCall ? ['call'] : [])].sort();
        for (const run of raw) {
            assert.deepEqual(validateMatchedMeasurement(run), axes, 'missing expected metric');
            assert.deepEqual(run.verified, graph.artifacts.inline.parts);
        }
        const performance = Object.fromEntries(
            modes.map((mode) => [
                mode,
                Object.fromEntries(axes.map((axis) => [axis, median(raw.map((run) => run.medians[mode][axis]))])),
            ]),
        );
        const size = Object.fromEntries(modes.map((mode) => [mode, graph.artifacts[mode].js]));
        const uncertainty = Object.fromEntries(
            [...Object.keys(comparisons), 'normalized-overhead'].map((comparison) => [
                comparison,
                Object.fromEntries(
                    axes.map((axis) => [axis, processInterval(raw.map((run) => run.pairedRatios[comparison][axis]))]),
                ),
            ]),
        );
        assert.deepEqual(Object.keys(memory[graph.id]).sort(), [...modes].sort());
        for (const mode of modes) {
            const diagnostic = memory[graph.id][mode];
            assert.equal(diagnostic.mode, mode);
            assert.equal(diagnostic.stores, 64);
            assert.deepEqual(Object.keys(diagnostic.deltas).sort(), ['arrayBuffers', 'external', 'heapUsed']);
            assert.ok(Object.values(diagnostic.deltas).every(Number.isFinite));
            assert.equal(
                diagnostic.valid,
                Object.values(diagnostic.deltas).every((n) => n >= 0),
            );
        }
        reports[graph.id] = {
            size,
            performance,
            uncertainty,
            parityLosses: Object.fromEntries(
                Object.entries(comparisons).map(([comparison, [base, candidate]]) => [
                    comparison,
                    {
                        size: parityLosses({ inline: size[base], external: size[candidate] }),
                        performance: parityLosses({ inline: performance[base], external: performance[candidate] }),
                    },
                ]),
            ),
            coldNative: raw.map((run) => run.coldNative),
            memory: memory[graph.id],
            raw,
        };
    }
    for (const graph of graphs) {
        const current = reports[graph.id];
        const control = reports[`${graph.bundler}--${graph.resolution}--noise`];
        current.timingFindings = Object.fromEntries(
            Object.entries(current.uncertainty).map(([comparison, estimates]) => [
                comparison,
                Object.fromEntries(
                    Object.entries(estimates).map(([axis, estimate]) => {
                        const bounds = control.uncertainty[comparison][axis].ci95;
                        const noise = Math.max(Math.abs(bounds[0] - 1), Math.abs(bounds[1] - 1));
                        return [axis, { finding: timingFinding(estimate, noise), noise }];
                    }),
                ),
            ]),
        );
    }
    assertCompleteReports(expected, reports);
    return reports;
}

export function matchedMarkdown(result) {
    assert.equal(result.complete, true);
    assertCompleteReports(expectedReportIds('full'), result.reports);
    const interval = (report, comparison, axis) => {
        const value = report.uncertainty[comparison][axis];
        return value
            ? `${value.median.toFixed(3)} [${value.ci95.map((n) => n.toFixed(3)).join(', ')}]`
            : 'Not measured';
    };
    return [
        '# Matched runtime investigation',
        '',
        `${result.settings.processCount} independent processes per entry, ${result.settings.sampleCount} paired samples per process; all 68 entries.`,
        '',
        'Dynamic debug behavior. Ratios are candidate/base with 95% process-cluster intervals; smaller is faster. Absolute medians, individual process ranges, all raw samples and the other comparisons are retained in JSON.',
        '',
        '| Entry | Factory/named raw | Factory/named gzip | Factory/named Brotli |',
        '| --- | ---: | ---: | ---: |',
        ...Object.entries(result.reports).map(
            ([id, r]) =>
                `| ${id} | ${r.size.factory.raw}/${r.size.named.raw} | ${r.size.factory.gzip}/${r.size.named.gzip} | ${r.size.factory.brotli}/${r.size.named.brotli} |`,
        ),
        '',
        '| Entry | Named/factory parse | Named/factory link + evaluation | Named/factory initialize | Named/factory warm call |',
        '| --- | ---: | ---: | ---: | ---: |',
        ...Object.entries(result.reports).map(
            ([id, r]) =>
                `| ${id} | ${['parse', 'evaluate', 'instantiate', 'call'].map((axis) => interval(r, 'named-vs-factory', axis)).join(' | ')} |`,
        ),
        '',
        'Both inline controls remain explicit: current/old inline measures compiler differences, and normalized overhead is (named/current-inline)/(factory/old-inline). Neither normalization nor bundle-size changes prove causal startup, browser, memory or payload gains.',
        '',
        'Material findings require at least 5%, a process-cluster interval excluding 1, and an effect exceeding the identical-code control noise. Unchanged inline parity budgets are separate; all losses are preserved in JSON. No baseline is recorded.',
        '',
        'Cold native ESM and retained memory are diagnostics. Memory counters overlap, external accounting may include Wasm linear memory, and negative deltas are excluded. Streams remain lifecycle-only; browser, allocation/context/lazy-initialization and controlled-loss investigations remain separate N14 work.',
        '',
    ].join('\n');
}
