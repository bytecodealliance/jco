import { readFile, readdir } from 'node:fs/promises';
import { createPipeline } from './shared/pipeline.js';
import { readScript } from './shared/read-script.js';

export async function main(args = process.argv.slice(2)) {
    // CLI arguments take precedence over the comma-separated environment setting.
    // An explicitly empty PIPELINE_STAGES runs the input through an empty pipeline.
    const names = (args.length ? args : (process.env.PIPELINE_STAGES ?? 'geoip,risk-score,top-pages').split(','))
        .map((name) => name.trim())
        .filter(Boolean);
    const components = new URL('../dist/components/', import.meta.url);
    const available = (await readdir(components))
        .filter((file) => file.endsWith('.wasm') && !['engine.wasm', 'dataset.wasm'].includes(file))
        .map((file) => file.slice(0, -'.wasm'.length));
    for (const name of names) {
        if (!available.includes(name)) {
            throw new Error(`Unknown stage "${name}". Available stages: ${available.join(', ')}`);
        }
    }

    const pipeline = await createPipeline(readFile);
    const input = await readFile(new URL('./access-logs.json', import.meta.url), 'utf8');
    const stages = [];
    for (const name of names) {
        const script = await readScript(await readFile(new URL(`${name}.wasm`, components)));
        const description = pipeline.describe(script);
        stages.push({ script, options: JSON.parse(description.defaultOptions) });
    }
    const result = pipeline.run(input, stages);
    for (const step of result.steps) {
        console.log(step.summary);
    }
    console.log(JSON.stringify({ logs: result.logs, reports: result.reports }, null, 2));
}

if (import.meta.main) {
    main().catch((error) => {
        console.error(error.message ?? error);
        process.exitCode = 1;
    });
}
