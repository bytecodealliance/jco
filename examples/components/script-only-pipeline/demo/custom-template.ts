import type { processor as ProcessorInterface } from 'example:log-pipeline/pipeline';
import { getDataset, parseOptions } from 'pipeline:state';

export const processor: typeof ProcessorInterface = {
    describe() {
        return {
            name: 'HTTP status filter',
            description: 'Keep requests with an HTTP status at or above a threshold.',
            defaultOptions: JSON.stringify({ minStatus: 400 }),
        };
    },
    processBatch(logs, json) {
        const { minStatus = 400 } = parseOptions(json);
        if (typeof minStatus !== 'number' || minStatus < 100 || minStatus > 599) {
            throw 'minStatus must be a number from 100 to 599';
        }
        const data = getDataset();
        data.logs = logs;
        data.logs = data.logs.filter((log) => log.status >= minStatus);
        return { logs: data.logs, summary: `HTTP status: kept ${data.logs.length} logs with status >= ${minStatus}` };
    },
    processSingle(log, options) {
        const { logs, summary } = processor.processBatch([log], options);
        return { log: logs[0], summary };
    },
};
