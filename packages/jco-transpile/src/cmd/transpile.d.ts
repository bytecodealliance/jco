import { Command } from 'commander';

type TypeGenerationOptions = {
    name?: string;
    worldName?: string;
    instantiation?: 'async' | 'sync';
    tlaCompat?: bool;
    asyncMode?: string;
    asyncImports?: string[];
    asyncExports?: string[];
    outDir?: string;
    features?: string[] | 'all';
    allFeatures?: boolean;
    asyncWasiImports?: boolean;
    asyncWasiExports?: boolean;
    guest?: bool;
};

export function types(
    witPath: string,
    opts?: TypeGenerationOptions
): Promise<void>;

export function guestTypes(
    witPath: string,
    opts: TypeGenerationOptions
): Promise<void>;

/** Bytes that belong in one or more files */
type FileBytes = {
    [filename: string]: Uint8Array;
};

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
export function typesComponent(
    witPath: string,
    opts: TypeGenerationOptions
): Promise<FileBytes>;

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
};

export function transpile(
    componentPath: string,
    opts?: TranspilationOptions,
    program?: Command
): Promise<void>;

type TranspilationResult = {
    files: FileBytes;
    imports: string[];
    exports: [string, 'function' | 'instance'][];
};

export function runTranspileComponent(
    component: Uint8Array,
    opts?: TranspilationOptions,
): Promise<TranspilationResult>;

//# sourceMappingURL=transpile.d.ts.map
