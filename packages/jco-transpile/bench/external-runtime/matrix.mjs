export const smokeScenarioIds = Object.freeze([
    'empty',
    'noise',
    'numbers',
    'variants',
    'strings',
    'adder',
    'resource',
    'sharing',
]);
export const fullScenarioIds = Object.freeze([
    ...smokeScenarioIds.filter((id) => id !== 'sharing'),
    'lists',
    'records',
    'flavorful',
    'resources',
    'events',
    'async',
    'streams',
    'futures',
    'sharing',
    'portfolio',
]);

export function scenarioIdsForPortfolio(portfolio) {
    if (portfolio === 'smoke') {
        return smokeScenarioIds;
    }
    if (portfolio === 'full') {
        return fullScenarioIds;
    }
    throw new Error('Unknown external-runtime benchmark portfolio: ' + portfolio);
}

export function portfolioFromArgs(args) {
    if (args.some((arg) => !['--smoke', '--record', '--parity'].includes(arg))) {
        throw new Error('Recording requires the complete selected matrix, without filters');
    }
    return args.includes('--smoke') ? 'smoke' : 'full';
}

export function expectedReportIds(portfolio) {
    return ['rolldown', 'rollup'].flatMap((bundler) =>
        ['file', 'package'].flatMap((resolution) =>
            scenarioIdsForPortfolio(portfolio).map((id) => `${bundler}--${resolution}--${id}`),
        ),
    );
}

export function assertCompleteReports(expected, reports) {
    if (
        !Array.isArray(expected) ||
        !expected.length ||
        new Set(expected).size !== expected.length ||
        expected.toSorted().join() !== Object.keys(reports).toSorted().join()
    ) {
        throw new Error('Incomplete report matrix');
    }
}
