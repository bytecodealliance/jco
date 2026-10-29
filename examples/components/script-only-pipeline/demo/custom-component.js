import { $init, scripts } from '@bytecodealliance/jco-transpile/component';
import sharedState from '../components/shared/state.ts?raw';

// Pin the JS and Wasm halves to the same version; neither runs on a server.
const ESBUILD_URL = 'https://cdn.jsdelivr.net/npm/esbuild-wasm@0.28.1/esm/browser.min.js';
const ESBUILD_WASM_URL = 'https://cdn.jsdelivr.net/npm/esbuild-wasm@0.28.1/esbuild.wasm';
let compiler;

async function getCompiler() {
    compiler ??= (async () => {
        const esbuild = await import(/* @vite-ignore */ ESBUILD_URL);
        await esbuild.initialize({ wasmURL: ESBUILD_WASM_URL });
        return esbuild;
    })().catch((error) => {
        compiler = undefined;
        throw error;
    });
    return compiler;
}

/** Bundle TypeScript into the loader's ES module shape and package it as real Wasm. */
export async function createCustomComponent(name, source) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || ['engine', 'dataset'].includes(name)) {
        throw new Error('Use a lowercase component name with letters, numbers, and hyphens (except engine or dataset)');
    }
    const esbuild = await getCompiler();
    const result = await esbuild.build({
        stdin: { contents: source, sourcefile: `${name}.ts`, loader: 'ts' },
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'neutral',
        target: 'es2022',
        metafile: true,
        logLevel: 'silent',
        plugins: [
            {
                name: 'pipeline-state',
                setup(build) {
                    build.onResolve({ filter: /.*/ }, ({ path }) =>
                        path === 'pipeline:state'
                            ? { path, namespace: 'pipeline' }
                            : {
                                  errors: [
                                      {
                                          text: 'Runtime imports must use pipeline:state; other modules are not available in the engine',
                                      },
                                  ],
                              },
                    );
                    build.onLoad({ filter: /.*/, namespace: 'pipeline' }, () => ({
                        contents: sharedState,
                        loader: 'ts',
                    }));
                },
            },
        ],
    });
    const exports = Object.values(result.metafile.outputs).flatMap((output) => output.exports);
    if (exports.length !== 1 || exports[0] !== 'processor') {
        throw new Error('Export one processor object with describe() and process(options) methods');
    }
    await $init;
    return scripts.createComponent({
        name: `${name}.js`,
        source: result.outputFiles[0].text,
        engineWorld: 'jco:script-engine/engine@0.1.0',
        exports,
    });
}
