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
        return JSON.parse(engine.dataset.snapshot());
    };

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
        run(input, stages) {
            try {
                loadDataset();
                engine.dataset.reset(input);
                const steps = [];
                for (const { script, options } of stages) {
                    load(script);
                    const summary = engine.processor.process(JSON.stringify(options));
                    // Switching back to the dataset script does not lose the data.
                    // Only snapshots cross the host boundary; the working set stays in the engine.
                    steps.push({ name: script.name, summary, ...snapshot() });
                }
                return { ...snapshot(), steps };
            } finally {
                engine.scriptLoader.unload();
            }
        },
    };
}
