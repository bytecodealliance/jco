/** Metrics are adapter costs in nanoseconds, excluding process launch and core compilation. */
export interface Values {
    inline: Record<string, number>;
    external: Record<string, number>;
}
export const parity = {
    raw: { ratio: 1.05, slack: 256 },
    gzip: { ratio: 1.05, slack: 128 },
    brotli: { ratio: 1.05, slack: 128 },
    parse: { ratio: 1.25, slack: 25_000 },
    evaluate: { ratio: 1.25, slack: 25_000 },
    instantiate: { ratio: 1.25, slack: 50_000 },
    call: { ratio: 1.25, slack: 250 },
} as const;
export function parityLosses(values: Values) {
    const keys = Object.keys(values.inline).toSorted();
    if (!keys.length || keys.join() !== Object.keys(values.external).toSorted().join()) {
        throw new Error('Both modes must have the same nonempty metric set');
    }
    return keys.filter((key) => {
        const budget = parity[key as keyof typeof parity];
        const inline = values.inline[key],
            external = values.external[key];
        if (!budget || ![inline, external].every((value) => Number.isFinite(value) && value > 0)) {
            throw new Error(`Invalid metric ${key}`);
        }
        return external > inline * budget.ratio + budget.slack;
    });
}
export function regressionLosses(values: Values, baseline: Values, kind: 'size' | 'performance') {
    parityLosses(values);
    parityLosses(baseline);
    return Object.keys(values.inline).flatMap((metric) => {
        const inline = values.inline[metric],
            external = values.external[metric];
        const oldInline = baseline.inline[metric],
            oldExternal = baseline.external[metric];
        if (![oldInline, oldExternal].every((value) => Number.isFinite(value) && value > 0)) {
            return [`${metric}: missing baseline`];
        }
        if (kind === 'size') {
            return [
                ...(inline > oldInline * 1.05 + 128 ? [`${metric}: absolute inline growth`] : []),
                ...(external > oldExternal * 1.05 + 128 ? [`${metric}: absolute external growth`] : []),
                ...(external / inline > (oldExternal / oldInline) * 1.05 + 128 / inline
                    ? [`${metric}: relative growth`]
                    : []),
            ];
        }
        const budget = parity[metric as keyof typeof parity];
        return external > inline * Math.max(budget.ratio, (oldExternal / oldInline) * 1.35) + budget.slack
            ? [`${metric}: relative timing regression`]
            : [];
    });
}
export const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

/** Seeded percentile bootstrap over independent PROCESS medians, not inner samples. */
export function processInterval(values: number[]) {
    if (values.length < 5 || values.length > 10 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
        throw new Error('Expected five to ten finite independent process ratios');
    }
    let seed = 20261021;
    const bootstrap = Array.from({ length: 10_000 }, () =>
        median(
            values.map(() => {
                // The old LCG's low bit alternated, forcing five even and five
                // odd indices in every ten-cluster resample. Use mixed bits
                // and a full-word fraction instead of those low bits.
                seed ^= seed << 13;
                seed ^= seed >>> 17;
                seed ^= seed << 5;
                return values[Math.floor(((seed >>> 0) / 0x1_0000_0000) * values.length)];
            }),
        ),
    ).sort((a, b) => a - b);
    return {
        median: median(values),
        range: [Math.min(...values), Math.max(...values)],
        ci95: [bootstrap[250], bootstrap[9749]],
    };
}

export function validateMeasurement(
    result: { medians: Values; pairedRatios: Record<string, number>; samples?: unknown; coldNative?: unknown },
    sampleCount: number,
) {
    parityLosses(result.medians);
    const axes = Object.keys(result.medians.inline).sort();
    if (
        !result.samples ||
        typeof result.samples !== 'object' ||
        !result.coldNative ||
        typeof result.coldNative !== 'object'
    ) {
        throw new Error('Missing raw samples or cold observations');
    }
    const samples = result.samples as Record<'inline' | 'external', Record<string, number[]>>;
    const cold = result.coldNative as Record<string, number>;
    for (const mode of ['inline', 'external'] as const) {
        if (!samples[mode] || !Number.isFinite(cold[mode]) || cold[mode] <= 0) {
            throw new Error('Invalid mode observations');
        }
        const selected = Object.entries(samples[mode]).filter(([, values]) => Array.isArray(values) && values.length);
        if (
            selected
                .map(([axis]) => axis)
                .sort()
                .join() !== axes.join()
        ) {
            throw new Error('Missing or unexpected sample axes');
        }
        for (const [axis, values] of selected) {
            if (values.length !== sampleCount || values.some((value) => !Number.isFinite(value) || value <= 0)) {
                throw new Error('Incomplete or invalid raw samples');
            }
            if (median(values) !== result.medians[mode][axis]) {
                throw new Error('Medians do not match raw samples');
            }
        }
    }
    if (Object.keys(result.pairedRatios).sort().join() !== axes.join()) {
        throw new Error('Missing paired ratios');
    }
    for (const axis of axes) {
        const ratios = samples.inline[axis].map((value, i) => samples.external[axis][i] / value);
        if (result.pairedRatios[axis] !== median(ratios)) {
            throw new Error('Paired ratios do not match raw samples');
        }
    }
}

export function timingFinding(estimate: ReturnType<typeof processInterval>, noise: number) {
    if (estimate.median <= 0.95 && estimate.ci95[1] < 1 && 1 - estimate.median > noise) {
        return 'material improvement';
    }
    if (estimate.median >= 1.05 && estimate.ci95[0] > 1 && estimate.median - 1 > noise) {
        return 'material regression';
    }
    return 'inconclusive relative to process uncertainty and identical-code noise';
}
