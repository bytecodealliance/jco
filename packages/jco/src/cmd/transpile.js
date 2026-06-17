/* global Buffer */

import { transpile, transpileBytes } from "@bytecodealliance/jco-transpile";

import { setShowSpinner, writeFiles } from "../common.js";

// These re-exports exist to avoid breaking backwards compatibility
export { types, guestTypes, typesComponent } from "./types.js";

/**
 * @typedef {{
 *   name: string,
 *   instantiation?: 'async' | 'sync',
 *   importBindings?: 'js' | 'optimized' | 'hybrid' | 'direct-optimized',
 *   map?: Record<string, string>,
 *   asyncMode?: string,
 *   asyncImports?: string[],
 *   asyncExports?: string[],
 *   validLiftingOptimization?: bool,
 *   tracing?: bool,
 *   nodejsCompat?: bool,
 *   tlaCompat?: bool,
 *   base64Cutoff?: bool,
 *   js?: bool,
 *   minify?: bool,
 *   optimize?: bool,
 *   namespacedExports?: bool,
 *   outDir?: string,
 *   multiMemory?: bool,
 *   experimentalIdlImports?: bool,
 *   optArgs?: string[],
 *   wasmOptBin?: string[],
 * }} TranspileOpts
 */

/**
 * Transpile a component, given a path.
 *
 * @param {string} componentPath
 * @param {TranspileOpts} opts
 * @param {object} comander `Program` object
 */
export async function transpileCmd(componentPath, opts, program) {
    const { files } = await transpile(componentPath, prepOpts(opts, program));
    await writeFiles(files, opts.quiet ? false : "Transpiled JS Component Files");
}

/**
 * Transpile a component, given WebAssembly bytes.
 *
 * @param {Uint8Array} component
 * @param {TranspileOpts} [opts]
 * @returns {Promise<{ files: { [filename: string]: Uint8Array }, imports: string[], exports: [string, 'function' | 'instance'][] }>}
 */
export async function transpileComponent(component, opts = {}) {
    return transpileBytes(component, prepOpts(opts));
}

function prepOpts(opts, program) {
    const varIdx = program?.parent.rawArgs.indexOf("--");
    if (varIdx !== undefined && varIdx !== -1) {
        opts.optArgs = program.parent.rawArgs.slice(varIdx + 1);
    }

    if (!opts.quiet) {
        setShowSpinner(true);
    }

    if (opts.map) {
        if (typeof opts.map === "string") {
            opts.map = opts.map.split(",");
        }
        if (Array.isArray(opts.map)) {
            opts.map = Object.fromEntries(opts.map.map((s) => s.split("=")));
        }
    }

    return opts;
}

// see: https://github.com/vitest-dev/vitest/issues/6953#issuecomment-2505310022
if (typeof __vite_ssr_import_meta__ !== "undefined") {
    __vite_ssr_import_meta__.resolve = (path) => "file://" + globalCreateRequire(import.meta.url).resolve(path);
}
