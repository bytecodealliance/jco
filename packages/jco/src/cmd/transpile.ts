/* global Buffer */

import { transpile, transpileBytes } from "@bytecodealliance/jco-transpile";

import { writeFiles } from "../common.js";

declare const __vite_ssr_import_meta__: ImportMeta;
declare const globalCreateRequire: typeof import("node:module").createRequire;

export interface TranspileOpts {
    name?: string;
    instantiation?: "async" | "sync";
    importBindings?: "js" | "optimized" | "hybrid" | "direct-optimized";
    map?: Record<string, string>;
    asyncMode?: string;
    asyncImports?: string[];
    asyncExports?: string[];
    validLiftingOptimization?: boolean;
    tracing?: boolean;
    noComponentErrorWrapping?: boolean;
    nodejsCompat?: boolean;
    tlaCompat?: boolean;
    base64Cutoff?: number;
    js?: boolean;
    minify?: boolean;
    optimize?: boolean;
    namespacedExports?: boolean;
    outDir?: string;
    multiMemory?: boolean;
    bindgenEnableWasmExnref?: boolean;
    experimentalIdlImports?: boolean;
    optArgs?: string[];
    wasmOptBin?: string[];
    quiet?: boolean;
    noTypescript?: boolean;
    wasiShim?: boolean;
    flagsAsBigInt?: boolean;
    variantsInlineCases?: boolean;
    useNamespaceObjects?: boolean;
    enumValuesScreamingSnakeCase?: boolean;
}

// These re-exports exist to avoid breaking backwards compatibility
export { types, guestTypes, typesComponent } from "./types.js";

/**
 * Transpile a component, given a path.
 *
 * @param {string} componentPath
 * @param {TranspileOpts} opts
 * @param {object} comander `Program` object
 */
export async function transpileCmd(componentPath: string, opts: TranspileOpts, program?: any): Promise<void> {
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
export async function transpileComponent(component: Uint8Array, opts: TranspileOpts = {}) {
    return transpileBytes(component, prepOpts(opts)) as Promise<{
        files: Record<string, Uint8Array>;
        imports: string[];
        exports: [string, "function" | "instance"][];
    }>;
}

function prepOpts(opts: any, program?: any) {
    // Commander derives `flagsAsBigint` from `--flags-as-bigint`, while the
    // public API uses the conventional TypeScript spelling `flagsAsBigInt`.
    opts.flagsAsBigInt ??= opts.flagsAsBigint;

    // Preserve jco's existing ComponentError behavior even though the lower-level
    // jco-transpile API defaults to throwing raw top-level result error payloads.
    opts.noComponentErrorWrapping ??= opts.componentErrorWrapping === false;

    const varIdx = program?.parent.rawArgs.indexOf("--");
    if (varIdx !== undefined && varIdx !== -1) {
        opts.optArgs = program.parent.rawArgs.slice(varIdx + 1);
    }

    if (opts.map) {
        if (typeof opts.map === "string") {
            opts.map = opts.map.split(",");
        }
        if (Array.isArray(opts.map)) {
            opts.map = Object.fromEntries(opts.map.map((s: string) => s.split("=")));
        }
    }

    return opts;
}

// see: https://github.com/vitest-dev/vitest/issues/6953#issuecomment-2505310022
if (typeof __vite_ssr_import_meta__ !== "undefined") {
    __vite_ssr_import_meta__.resolve = (path) => "file://" + globalCreateRequire(import.meta.url).resolve(path);
}
