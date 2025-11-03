import type { Command } from 'commander';

export function types(witPath: any, opts: any): Promise<void>;

export function guestTypes(witPath: any, opts: any): Promise<void>;

/**
 * @param {string} witPath
 * @param {{
 *   name?: string,
 *   worldName?: string,
 *   instantiation?: 'async' | 'sync',
 *   tlaCompat?: bool,
 *   asyncMode?: string,
 *   asyncImports?: string[],
 *   asyncExports?: string[],
 *   outDir?: string,
 *   features?: string[] | 'all',
 *   guest?: bool,
 * }} opts
 * @returns {Promise<{ [filename: string]: Uint8Array }>}
 */
export function typesComponent(witPath: string, opts: {
    name?: string;
    worldName?: string;
    instantiation?: "async" | "sync";
    tlaCompat?: boolean;
    asyncMode?: string;
    asyncImports?: string[];
    asyncExports?: string[];
    outDir?: string;
    features?: string[] | "all";
    guest?: boolean;
}): Promise<{
    [filename: string]: Uint8Array;
}>;


export function transpile(
    componentPath: string,
    opts: TranspilationOptions,
    program: Command,
): Promise<TranspilationResult>;

type TranspilationOptions = {
    name: string;
    instantiation?: 'async' | 'sync';
    importBindings?: 'js' | 'optimized' | 'hybrid' | 'direct-optimized';
    map?: Record<string, string>;
    asyncMode?: string;
    asyncImports?: string[];
    asyncExports?: string[];
    asyncWasiImports?: string[];
    asyncWasiExports?: string[];
    validLiftingOptimization?: boolean;
    tracing?: boolean;
    nodejsCompat?: boolean;
    tlaCompat?: boolean;
    base64Cutoff?: boolean;
    js?: boolean;
    minify?: boolean;
    optimize?: boolean;
    namespacedExports?: boolean;
    outDir?: string;
    multiMemory?: boolean;
    experimentalIdlImports?: boolean;
    optArgs?: string[];
};

type TranspilationResult = {
    files: FileBytes;
    imports: string[];
    exports: [string, 'function' | 'instance'][];
};

/**
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
    validLiftingOptimization?: boolean;
    tracing?: boolean;
    nodejsCompat?: boolean;
    tlaCompat?: boolean;
    base64Cutoff?: boolean;
    js?: boolean;
    minify?: boolean;
    optimize?: boolean;
    namespacedExports?: boolean;
    outDir?: string;
    multiMemory?: boolean;
    experimentalIdlImports?: boolean;
    optArgs?: string[];
}): Promise<{
    files: {
        [filename: string]: Uint8Array;
    };
    imports: string[];
    exports: [string, "function" | "instance"][];
}>;
//# sourceMappingURL=transpile.d.ts.map
