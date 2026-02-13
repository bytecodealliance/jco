import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

interface GetCoreModuleHelperArgs {
    /**
     * Base directory to use for files that are read
     *
     * WARNING: paths are constructed with this base naively,
     * so if paths contain '../' they are not intelligently escaped/constrained.
     */
    baseDir?: string;

    /**
     * Whether to strip Wasm file suffixes like '.core.d.wasm'
     * this may be useful in web contexts.
     */
    stripWasmSuffix?: boolean;
}

/**
 * This is a helper function that *generates* a loader function that can be used
 * with instantiation methods for transpiled WebAssembly modules.
 *
 * This function is normally fed as the first argument to `instantiate()`:
 * ```
 * // This code assumes that you have transpiled with `instantiation` set to 'async'
 * const mod = import('path/to/transpiled/component.js');
 * await mod.instantiate(getCoreModuleWithBaseDir('.'), {});
 * ```
 *
 * You may not need this function at all if your JS environment has access to `fetch`, you can:
 * - Set instantiation mode to `'async'`
 * - Set the first argument of `instantiate()` to `undefined`.
 *
 * In that case, a loader that uses fetch and `WebAssembly.compile` will be generated for you.
 */
export function getCoreModuleWithBaseDir(args?: GetCoreModuleHelperArgs) {
    const baseDir = args?.baseDir ?? '.';
    const stripWasmSuffix = args?.stripWasmSuffix;
    return async (fileName: string) => {
        let filePath = join(baseDir, fileName);
        if (stripWasmSuffix) {
            filePath = filePath.replace(/\.core\d*\.wasm$/, '');
        }
        const buf = await readFile(filePath);
        return await WebAssembly.compile(buf.buffer);
    };
}

/**
 * This is a helper function that can be used with instantiation methods
 * set by transpile to retrieve WebAssembly modules
 *
 * This function is normally fed as the first argument to `instantiate()`:
 * ```
 * // This code assumes that you have transpiled with `instantiation` set to 'sync'
 * const mod = import('path/to/transpiled/component.js');
 * mod.instantiate(getCoreModuleWithBaseDirSync('.'), {});
 * ```
 *
 * Prefer async instantiation if available in your environment (see `getCoreModuleWithBaseDir()`).
 */
export function getCoreModuleWithBaseDirSync(args?: GetCoreModuleHelperArgs) {
    const baseDir = args?.baseDir ?? '.';
    const stripWasmSuffix = args?.stripWasmSuffix;
    return (fileName: string) => {
        let filePath = join(baseDir, fileName);
        if (stripWasmSuffix) {
            filePath = filePath.replace(/\.core\d*\.wasm$/, '');
        }
        const buf = readFileSync(filePath);
        return new WebAssembly.Module(buf.buffer as ArrayBuffer);
    };
}
