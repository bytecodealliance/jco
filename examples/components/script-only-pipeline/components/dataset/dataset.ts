import type { dataset as DatasetInterface } from 'example:log-pipeline/pipeline';
import { getDataset, resetDataset } from '../shared/state.ts';

export const dataset: typeof DatasetInterface = {
    reset(rows) {
        const logs = rows.map((row, index) => {
            if (row.status < 100 || row.status > 599) {
                throw `Log ${index + 1} needs an HTTP status (100–599)`;
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
        const { logs, reports } = getDataset();
        return { logs, reportsJson: JSON.stringify(reports) };
    },
};
