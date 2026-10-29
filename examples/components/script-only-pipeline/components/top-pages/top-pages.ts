import type { processor as ProcessorInterface } from 'example:log-pipeline/pipeline';
import { getDataset, parseOptions } from '../shared/state.ts';

export const processor: typeof ProcessorInterface = {
    describe() {
        return {
            name: 'Most visited pages',
            description: 'Count paths in the current logs and add a topPages report without removing logs.',
            defaultOptions: JSON.stringify({ limit: 5 }),
        };
    },
    processBatch(logs, json) {
        const { limit = 5 } = parseOptions(json);
        if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw 'limit must be an integer from 1 to 100';
        }
        const data = getDataset();
        data.logs = logs;
        const counts = new Map<string, number>();
        for (const log of data.logs) {
            counts.set(log.path, (counts.get(log.path) ?? 0) + 1);
        }
        const pages = [...counts]
            .map(([path, visits]) => ({ path, visits }))
            .sort((a, b) => b.visits - a.visits || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
            .slice(0, limit);
        data.reports.topPages = pages;
        return { logs: data.logs, summary: `Pages: counted ${data.logs.length} logs across ${counts.size} paths` };
    },
    processSingle(log, options) {
        const { logs, summary } = processor.processBatch([log], options);
        return { log: logs[0], summary };
    },
};
