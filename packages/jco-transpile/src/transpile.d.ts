/**
 * @typedef {{
 *   name: string,
 *   instantiation?: 'async' | 'sync',
 *   importBindings?: 'js' | 'optimized' | 'hybrid' | 'direct-optimized',
 *   map?: Record<string, string>,
 *   asyncMode?: string,
 *   asyncImports?: string[],
 *   asyncExports?: string[],
 *   asyncWasiImports?: string[],
 *   asyncWasiExports?: string[],
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
 * }} TranspilationOptions

 /** @typedef {{
 *  files: {
 *    [filename: string]: Uint8Array;
 *  };
 *  imports: string[];
 *  exports: [string, 'function' | 'instance'][];
 * }} TranspilationResult
 */
/**
 * Transpile a provided WebAssembly component to an ES module
 * that can be run in JS environments
 *
 * @param {Buffer | string | URL | FileHandle} componentPath
 * @param {TranspilationOptions} [opts]
 * @returns {Promise<TranspilationResult>}
 */
export declare function transpile(componentPath: any, opts: any): Promise<{
    files: {
        [k: string]: any;
    };
    imports: any;
    exports: any;
}>;
/**
 * Perform transpilation, using the transpiled js-component-bindgen Rust crate.
 *
 * @param {Uint8Array} component
 * @param {TranspilationOptions} [opts]
 * @returns {Promise<TranspilationResult}>}
 */
export declare function runTranspileComponent(component: any, opts?: {}): Promise<{
    files: {
        [k: string]: any;
    };
    imports: any;
    exports: any;
}>;
