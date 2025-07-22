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
 *   allFeatures?: bool,
 *   feature?: string[] | 'all', // backwards compat
 *   features?: string[] | 'all',
 *   asyncWasiImports?: string[],
 *   asyncWasiExports?: string[],
 *   guest?: bool,
 * }} opts
 * @returns {Promise<{ [filename: string]: Uint8Array }>}
 */
export function typesComponent(witPath: string, opts: {
    name?: string;
    worldName?: string;
    instantiation?: "async" | "sync";
    tlaCompat?: bool;
    asyncMode?: string;
    asyncImports?: string[];
    asyncExports?: string[];
    outDir?: string;
    allFeatures?: bool;
    feature?: string[] | "all";
    features?: string[] | "all";
    asyncWasiImports?: string[];
    asyncWasiExports?: string[];
    guest?: bool;
}): Promise<{
    [filename: string]: Uint8Array;
}>;
//# sourceMappingURL=types.d.ts.map