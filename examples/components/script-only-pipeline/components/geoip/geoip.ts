import type { processor as ProcessorInterface } from 'example:log-pipeline/pipeline';
import { getDataset, parseOptions } from '../shared/state.ts';

// These documentation-only IP ranges have invented locations for this demo.
// No network lookup or real GeoIP database is involved.
const countries = new Map([
    ['192.0.2', 'US'],
    ['198.51.100', 'DE'],
    ['203.0.113', 'JP'],
]);

export const processor: typeof ProcessorInterface = {
    describe() {
        return {
            name: 'GeoIP filter',
            description: 'Annotate synthetic IP locations and keep one country, or all countries.',
            defaultOptions: JSON.stringify({ country: 'DE' }),
        };
    },
    processBatch(logs, json) {
        const { country = 'DE' } = parseOptions(json);
        if (typeof country !== 'string' || !['all', 'US', 'DE', 'JP', 'unknown'].includes(country)) {
            throw 'country must be all, US, DE, JP, or unknown';
        }
        const data = getDataset();
        data.logs = logs;
        const before = data.logs.length;
        data.logs = data.logs
            .map((log) => ({
                ...log,
                country: countries.get(log.ip.split('.').slice(0, 3).join('.')) ?? 'unknown',
            }))
            .filter((log) => country === 'all' || log.country === country);
        return { logs: data.logs, summary: `GeoIP: ${before} → ${data.logs.length} logs (${country})` };
    },
    processSingle(log, options) {
        const { logs, summary } = processor.processBatch([log], options);
        return { log: logs[0], summary };
    },
};
