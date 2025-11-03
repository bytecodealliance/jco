import { Command } from 'commander';

type TypeGenerationOptions = {
    name?: string;
    worldName?: string;
    instantiation?: 'async' | 'sync';
    tlaCompat?: boolean;
    asyncMode?: string;
    asyncImports?: string[];
    asyncExports?: string[];
    outDir?: string;
    features?: string[] | 'all';
    allFeatures?: boolean;
    asyncWasiImports?: boolean;
    asyncWasiExports?: boolean;
    guest?: boolean;
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

export function transpile(
    componentPath: string,
    opts?: TranspilationOptions,
    program?: Command
): Promise<TranspilationResult>;

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
