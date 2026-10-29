import type { processor as ProcessorInterface } from 'example:log-pipeline/pipeline';
import { getDataset, parseOptions } from '../shared/state.ts';

export const processor: typeof ProcessorInterface = {
    describe() {
        return {
            name: 'Risk score',
            description: 'Score errors, sensitive paths, and repeated IPs; optionally keep scores above a threshold.',
            defaultOptions: JSON.stringify({ minScore: 0 }),
        };
    },
    processBatch(logs, json) {
        const { minScore = 0 } = parseOptions(json);
        if (typeof minScore !== 'number' || !Number.isInteger(minScore) || minScore < 0 || minScore > 100) {
            throw 'minScore must be an integer from 0 to 100';
        }
        const data = getDataset();
        data.logs = logs;
        const requests = new Map<string, number>();
        for (const log of data.logs) {
            requests.set(log.ip, (requests.get(log.ip) ?? 0) + 1);
        }
        data.logs = data.logs
            .map((log) => ({
                ...log,
                riskScore: Math.min(
                    100,
                    (log.status >= 500 ? 40 : log.status >= 400 ? 20 : 0) +
                        (/^\/(admin|login)(\/|$)/.test(log.path) ? 30 : 0) +
                        ((requests.get(log.ip) ?? 0) >= 3 ? 20 : 0),
                ),
            }))
            .filter((log) => log.riskScore >= minScore);
        return { logs: data.logs, summary: `Risk: scored logs and kept ${data.logs.length} with score ≥ ${minScore}` };
    },
    processSingle(log, options) {
        const { logs, summary } = processor.processBatch([log], options);
        return { log: logs[0], summary };
    },
};
