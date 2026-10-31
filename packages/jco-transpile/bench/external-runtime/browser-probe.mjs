import { importsFor, workload, expectedResult } from './__browser-workloads.mjs';
import assert from './browser-check.mjs';
const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
export async function probe(config) {
    const { pair, samples, sessionIndex, scenarioIndex } = config;
    const prepared = {},
        coldHttpImportInstantiate = {};
    for (const mode of (sessionIndex + scenarioIndex) % 2 ? ['external', 'inline'] : ['inline', 'external']) {
        const artifact = pair[mode],
            modules = new Map();
        const code = await (await fetch(artifact.bundle, { cache: 'no-store' })).text();
        for (const name of Object.keys(artifact.wasm.files)) {
            modules.set(
                name,
                await WebAssembly.compile(
                    await (await fetch(artifact.dir + '/' + name, { cache: 'no-store' })).arrayBuffer(),
                ),
            );
        }
        const imports = artifact.parts.map(importsFor);
        const instantiate = (binding) =>
            artifact.parts.map((id, i) =>
                binding[`create${i}`]((name) => {
                    if (!modules.has(name)) {
                        throw new Error('Unexpected core request: ' + name);
                    }
                    return modules.get(name);
                }, imports[i]),
            );
        // Actual HTTP module fetch/parse/link/evaluation plus adapter instantiation.
        // Core compilation, source fetch above, and host import assembly are excluded.
        const start = performance.now();
        const binding = await import(artifact.bundle + '?cold=' + crypto.randomUUID());
        const stores = instantiate(binding);
        coldHttpImportInstantiate[mode] = (performance.now() - start) * 1e6;
        const tasks = [];
        for (const [i, store] of stores.entries()) {
            tasks.push(await workload(artifact.parts[i], store, binding[`util${i}`]));
        }
        prepared[mode] = { code, binding, instantiate, tasks, artifact };
    }
    if (config.verifyOnly) {
        return {
            verified: pair.inline.parts,
            jspi: typeof WebAssembly.Suspending === 'function',
            userAgent: navigator.userAgent,
        };
    }
    const callable = prepared.inline.tasks.every((task) => task.call);
    const asynchronous = prepared.inline.tasks.some((task) => task.async);
    async function calls(mode, count) {
        let checksum = 0;
        const state = prepared[mode],
            start = performance.now();
        if (asynchronous) {
            for (let i = 0; i < count; i++) {
                for (const task of state.tasks) {
                    checksum += Number(await task.call(i));
                }
            }
        } else {
            for (let i = 0; i < count; i++) {
                for (const task of state.tasks) {
                    checksum += Number(task.call(i));
                }
            }
        }
        const elapsed = (performance.now() - start) * 1e6;
        let expected = 0;
        for (let i = 0; i < count; i++) {
            for (const id of state.artifact.parts) {
                expected += expectedResult(id, i);
            }
        }
        assert.equal(checksum, expected, 'browser timed checksum');
        return elapsed / count;
    }
    let count = 16;
    if (callable) {
        for (const mode of ['inline', 'external']) {
            await calls(mode, 256);
        }
        while (count < 16384) {
            const times = [await calls('inline', count), await calls('external', count)];
            if (Math.min(...times) * count >= 15e6) {
                break;
            }
            count *= 2;
        }
    }
    // Retain an adaptive batch long enough to exceed the browser clock quantum.
    // The same batch count is used by both modes; calibration is outside samples.
    let instantiations = 16;
    for (;;) {
        const elapsed = [];
        for (const mode of ['inline', 'external']) {
            const state = prepared[mode],
                start = performance.now();
            const stores = Array.from({ length: instantiations }, () => state.instantiate(state.binding));
            elapsed.push(performance.now() - start);
            assert.equal(stores.length, instantiations);
        }
        if (Math.min(...elapsed) >= 1 || instantiations >= 4096) {
            break;
        }
        instantiations *= 2;
    }
    const raw = {
        inline: { moduleImport: [], instantiate: [], call: [] },
        external: { moduleImport: [], instantiate: [], call: [] },
    };
    for (let sample = 0; sample < samples; sample++) {
        for (const mode of (sessionIndex + scenarioIndex + sample) % 2
            ? ['external', 'inline']
            : ['inline', 'external']) {
            const state = prepared[mode];
            const blob = URL.createObjectURL(
                new Blob([state.code + '\n//fresh-browser-source-' + crypto.randomUUID()], { type: 'text/javascript' }),
            );
            try {
                const start = performance.now();
                await import(blob);
                raw[mode].moduleImport.push((performance.now() - start) * 1e6);
            } finally {
                URL.revokeObjectURL(blob);
            }
            const start = performance.now();
            const retained = Array.from({ length: instantiations }, () => state.instantiate(state.binding));
            raw[mode].instantiate.push(((performance.now() - start) * 1e6) / instantiations);
            // Keep all 16 measured stores alive through independent known-answer checks.
            for (const stores of [retained[0], retained.at(-1)]) {
                for (const [i, store] of stores.entries()) {
                    await workload(state.artifact.parts[i], store, state.binding[`util${i}`]);
                }
            }
            assert.equal(retained.length, instantiations);
            if (callable) {
                raw[mode].call.push(await calls(mode, count));
            }
        }
    }
    const medians = Object.fromEntries(
        ['inline', 'external'].map((mode) => [
            mode,
            Object.fromEntries(
                Object.entries(raw[mode])
                    .filter(([, v]) => v.length)
                    .map(([axis, values]) => [axis, median(values)]),
            ),
        ]),
    );
    return {
        raw,
        medians,
        coldHttpImportInstantiate,
        callsPerSample: count,
        instantiationsPerSample: instantiations,
        crossOriginIsolated: globalThis.crossOriginIsolated,
        verified: pair.inline.parts,
        jspi: typeof WebAssembly.Suspending === 'function',
        userAgent: navigator.userAgent,
        labels: {
            moduleImport: 'fresh unique Blob module fetch + parse + link + evaluation; source preparation excluded',
            instantiate: 'calibrated retained-store batch with precompiled core Wasm; validation after timer',
            call: 'verified warm calls; actual payload/cancellation for labelled fixtures',
            coldHttpImportInstantiate:
                'native HTTP ESM import + adapter instantiation; core compilation and host imports excluded',
        },
    };
}
