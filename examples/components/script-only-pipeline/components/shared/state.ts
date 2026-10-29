import type { AccessLog } from 'example:log-pipeline/types';

export interface Dataset {
    logs: AccessLog[];
    reports: Record<string, unknown>;
}

// Each script is a separate bundle, but all scripts run in the same engine realm.
// Keep the data on that realm, not in a module-local variable or in the host.
const realm = globalThis as typeof globalThis & { logPipelineDataset?: Dataset };

export function resetDataset(logs: AccessLog[]): void {
    realm.logPipelineDataset = { logs, reports: {} };
}

export function getDataset(): Dataset {
    if (!realm.logPipelineDataset) {
        throw 'Initialize the dataset before running a processor';
    }
    return realm.logPipelineDataset;
}

export function parseOptions(json: string): Record<string, unknown> {
    let options: unknown;
    try {
        options = JSON.parse(json);
    } catch {
        throw 'Options must be valid JSON';
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw 'Options must be a JSON object';
    }
    return options as Record<string, unknown>;
}
