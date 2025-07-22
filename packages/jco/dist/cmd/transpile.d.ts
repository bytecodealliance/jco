export function transpile(witPath: any, opts: any, program: any): Promise<void>;
/**
 * Execute the bundled pre-transpiled component that can perform component transpilation,
 * for the given component.
 *
 * @param {Uint8Array} component
 * @param {{
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
 * }} opts
 * @returns {Promise<{ files: { [filename: string]: Uint8Array }, imports: string[], exports: [string, 'function' | 'instance'][] }>}
 */
export function transpileComponent(component: Uint8Array, opts?: {
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
}): Promise<{
    files: {
        [filename: string]: Uint8Array;
    };
    imports: string[];
    exports: [string, "function" | "instance"][];
}>;
export { types, guestTypes, typesComponent } from "./types.js";
//# sourceMappingURL=transpile.d.ts.map