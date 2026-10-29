import { instantiate as instantiateEngine } from '../../dist/transpiled/engine/engine.js';
import { instantiate as instantiateDataset } from '../../dist/transpiled/dataset/dataset.js';

/** Only byte loading differs between hosts (readFile in Node, fetch in the browser). */
export async function createPipeline(loadBytes) {
    const compile = (directory) => (name) =>
        loadBytes(new URL(`${directory}/${name}`, import.meta.url)).then((bytes) => WebAssembly.compile(bytes));
    const engine = await instantiateEngine(compile('../../dist/transpiled/engine'), {});
    const { script: dataset } = await instantiateDataset(compile('../../dist/transpiled/dataset'), {});
    const loadDataset = () => engine.scriptLoader.load(dataset.name(), dataset.source());
    const load = (script) => engine.scriptLoader.load(script.name, script.source);
    const snapshot = () => {
        loadDataset();
        const { logs, reportsJson } = engine.dataset.snapshot();
        return {
            // Keep the demo's JSON output shape by omitting unset WIT options.
            logs: logs.map(({ country, riskScore, ...log }) => ({
                ...log,
                ...(country === undefined ? {} : { country }),
                ...(riskScore === undefined ? {} : { riskScore }),
            })),
            reports: JSON.parse(reportsJson),
        };
    };

    function run(logs, stages, single = false) {
        try {
            loadDataset();
            engine.dataset.reset(logs);
            const steps = [];
            for (const { script, options } of stages) {
                if (single && logs.length === 0) {
                    break;
                }
                load(script);
                let summary;
                if (single) {
                    const result = engine.processor.processSingle(logs[0], JSON.stringify(options));
                    logs = result.log === undefined ? [] : [result.log];
                    summary = result.summary;
                } else {
                    const result = engine.processor.processBatch(logs, JSON.stringify(options));
                    logs = result.logs;
                    summary = result.summary;
                }
                // The typed results cross the host boundary; reports stay in the engine.
                steps.push({ name: script.name, summary, ...snapshot() });
            }
            return { ...snapshot(), steps };
        } finally {
            engine.scriptLoader.unload();
        }
    }

    return {
        describe(script) {
            if (script.engineWorld !== dataset.engineWorld() || !script.exports.includes('processor')) {
                throw new Error('This pipeline needs a script-only component with a processor export');
            }
            try {
                load(script);
                return engine.processor.describe();
            } finally {
                engine.scriptLoader.unload();
            }
        },
        runBatch(logs, stages) {
            return run(validateLogs(logs), stages);
        },
        runSingle(log, stages) {
            return run(validateLogs([log]), stages, true);
        },
    };
}

/** Validate records before canonical ABI coercions can change malformed field values. */
function validateLogs(rows) {
    if (!Array.isArray(rows)) {
        throw new Error('Input must be an array of access logs');
    }
    return rows.map((row, index) => {
        if (
            !row ||
            typeof row !== 'object' ||
            !['timestamp', 'ip', 'method', 'path'].every((key) => typeof row[key] === 'string') ||
            !Number.isInteger(row.status) ||
            row.status < 100 ||
            row.status > 599
        ) {
            throw new Error(`Log ${index + 1} needs timestamp, ip, method, path, and an HTTP status (100–599)`);
        }
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
}
