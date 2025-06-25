import { basename, resolve } from 'node:path';

import {
    $init as $initBindgenComponent,
    generateTypes,
} from '../vendor/js-component-bindgen-component.js';

import { isWindows } from './common.js';
import { ASYNC_WASI_IMPORTS, ASYNC_WASI_EXPORTS } from './constants.js';

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
export async function generateHostTypes(witPath, opts) {
    return await runTypesComponent(witPath, opts);
}

/**
 * Generate guest types for a given WIT world
 *
 * @param {string} witPath - path to the file/directory containing the WIT world
 * @param {TypeGenerationOptions} opts - options for controlling type generation
 * @returns {Promise<import('./common.js').FileBytes>} A Promise that resolves when all files have been written
 */
export async function generateGuestTypes(witPath, opts) {
    return await runTypesComponent(witPath, { ...opts, guest: true });
}

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
export async function runTypesComponent(witPath, opts) {
    await $initBindgenComponent;
    const name =
        opts.name ||
        (opts.worldName
            ? opts.worldName.split(':').pop().split('/').pop()
            : basename(witPath.slice(0, -extname(witPath).length || Infinity)));
    let instantiation;
    if (opts.instantiation) {
        instantiation = { tag: opts.instantiation };
    }
    let outDir = (opts.outDir ?? '').replace(/\\/g, '/');
    if (!outDir.endsWith('/') && outDir !== '') {
        outDir += '/';
    }

    let features = null;
    if (opts.allFeatures) {
        features = { tag: 'all' };
    } else if (Array.isArray(opts.features)) {
        features = { tag: 'list', val: opts.features };
    }

    if (opts.asyncWasiImports) {
        opts.asyncImports = ASYNC_WASI_IMPORTS.concat(opts.asyncImports || []);
    }
    if (opts.asyncWasiExports) {
        opts.asyncExports = ASYNC_WASI_EXPORTS.concat(opts.asyncExports || []);
    }

    const asyncMode =
        !opts.asyncMode || opts.asyncMode === 'sync'
            ? null
            : {
                  tag: opts.asyncMode,
                  val: {
                      imports: opts.asyncImports || [],
                      exports: opts.asyncExports || [],
                  },
              };

    let types;
    const absWitPath = resolve(witPath);
    try {
        types = generateTypes(name, {
            wit: { tag: 'path', val: (isWindows ? '//?/' : '') + absWitPath },
            instantiation,
            tlaCompat: opts.tlaCompat ?? false,
            world: opts.worldName,
            features,
            guest: opts.guest ?? false,
            asyncMode,
        }).map(([name, file]) => [`${outDir}${name}`, file]);
    } catch (err) {
        if (err.toString().includes('does not match previous package name')) {
            const hint = await printWITLayoutHint(absWitPath);
            if (err.message) {
                err.message += `\n${hint}`;
            }
            throw err;
        }
        throw err;
    }

    return Object.fromEntries(types);
}

/**
 * Print a hint about WIT folder layout
 *
 * @param {(string, any) => void} consoleFn
 */
async function printWITLayoutHint(witPath) {
    const pathMeta = await stat(witPath);
    let output = '\n';
    if (!pathMeta.isFile() && !pathMeta.isDirectory()) {
        output += c`{yellow.bold warning} The supplited WIT path [${witPath}] is neither a file or directory.\n`;
        return output;
    }
    const ftype = pathMeta.isDirectory() ? 'directory' : 'file';
    output += c`{yellow.bold warning} Your WIT ${ftype} [${witPath}] may be laid out incorrectly\n`;
    output += c`{yellow.bold warning} Keep in mind the following rules:\n`;
    output += c`{yellow.bold warning}     - Top level WIT files are in the same package (i.e. "ns:pkg" in "wit/*.wit")\n`;
    output += c`{yellow.bold warning}     - All package dependencies should be in "wit/deps" (i.e. "some:dep" in "wit/deps/some-dep.wit"\n`;
    return output;
}
