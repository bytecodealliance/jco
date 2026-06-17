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
export function transpileCmd(componentPath: string, opts: TranspileOpts, program: any): Promise<void>;
/**
 * Transpile a component, given WebAssembly bytes.
 *
 * @param {Uint8Array} component
 * @param {TranspileOpts} [opts]
 * @returns {Promise<{ files: { [filename: string]: Uint8Array }, imports: string[], exports: [string, 'function' | 'instance'][] }>}
 */
export function transpileComponent(component: Uint8Array, opts?: TranspileOpts): Promise<{
    files: {
        [filename: string]: Uint8Array;
    };
    imports: string[];
    exports: [string, "function" | "instance"][];
}>;
export type TranspileOpts = {
    name: string;
    instantiation?: "async" | "sync";
    importBindings?: "js" | "optimized" | "hybrid" | "direct-optimized";
    map?: Record<string, string>;
    asyncMode?: string;
    asyncImports?: string[];
    asyncExports?: string[];
    validLiftingOptimization?: bool;
    tracing?: bool;
    nodejsCompat?: bool;
    tlaCompat?: bool;
    base64Cutoff?: bool;
    js?: bool;
    minify?: bool;
    optimize?: bool;
    namespacedExports?: bool;
    outDir?: string;
    multiMemory?: bool;
    experimentalIdlImports?: bool;
    optArgs?: string[];
    wasmOptBin?: string[];
};
export { types, guestTypes, typesComponent } from "./types.js";
//# sourceMappingURL=transpile.d.ts.map