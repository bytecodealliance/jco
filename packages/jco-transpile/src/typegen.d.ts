export interface TypeGenerationOptions {
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
}
/**
 * @typedef {{
 *   name?: string,
 *   worldName?: string,
 *   instantiation?: 'async' | 'sync',
 *   tlaCompat?: bool,
 *   asyncMode?: string,
 *   asyncImports?: string[],
 *   asyncExports?: string[],
 *   outDir?: string,
 *   features?: string[] | 'all',
 *   allFeatures?: boolean,
 *   asyncWasiImports?: boolean,
 *   asyncWasiExports?: boolean,
 *   guest?: bool,
 * }} TypeGenerationOptions
 */
/**
 * Generate host types for a given WIT world
 *
 * @param {string} witPath - path to the file/directory containing the WIT world
 * @param {import('./typegen.js').TypeGenerationOptions} opts - options for controlling type generation
 * @returns {Promise<import('./common.js').FileBytes>} A Promise that resolves when all files have been written
 */
export declare function generateHostTypes(witPath: string, opts: TypeGenerationOptions): Promise<import('./common.js').FileBytes>;
/**
 * Generate guest types for a given WIT world
 *
 * @param {string} witPath - path to the file/directory containing the WIT world
 * @param {TypeGenerationOptions} opts - options for controlling type generation
 * @returns {Promise<import('./common.js').FileBytes>} A Promise that resolves when all files have been written
 */
export declare function generateGuestTypes(witPath: string, opts: TypeGenerationOptions): Promise<import('./common.js').FileBytes>;
/**
 * Perform type generation for a given WIT file/directory, by running the transpiled
 * type generation component.
 *
 * This function relies on the transpiled js-component-bindgen to perform
 * functionality that is made available via Rust libraries.
 *
 * @param {string} witPath
 * @param {TypeGenerationOptions} opts - options for controlling type generation
 * @returns {Promise<import('./transpile.js').FileBytes>}
 */
export declare function runTypesComponent(witPath: string, opts: TypeGenerationOptions): Promise<import('./common.js').FileBytes>;
