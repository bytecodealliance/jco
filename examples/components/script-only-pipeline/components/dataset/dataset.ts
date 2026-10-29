import type { dataset as DatasetInterface } from 'example:log-pipeline/pipeline';
import type { AccessLog } from 'example:log-pipeline/dataset';
import { getDataset, resetDataset } from '../shared/state.ts';

export const dataset: typeof DatasetInterface = {
    reset(json) {
        let rows: unknown;
        try {
            rows = JSON.parse(json);
        } catch {
            throw 'Input must be valid JSON';
        }
        if (!Array.isArray(rows)) {
            throw 'Input must be a JSON array of access logs';
        }
        const logs: AccessLog[] = rows.map((row, index) => {
            if (
                !row ||
                typeof row !== 'object' ||
                !['timestamp', 'ip', 'method', 'path'].every((key) => typeof row[key] === 'string') ||
                !Number.isInteger(row.status) ||
                row.status < 100 ||
                row.status > 599
            ) {
                throw `Log ${index + 1} needs timestamp, ip, method, path, and an HTTP status (100–599)`;
            }
            // Start each run from raw logs; annotations belong to the processors.
            return {
                timestamp: row.timestamp,
                ip: row.ip,
                method: row.method,
                path: row.path,
                status: row.status,
                country: undefined,
                riskScore: undefined,
            };
        });
        resetDataset(logs);
    },
    snapshot() {
        return JSON.stringify(getDataset());
    },
};
