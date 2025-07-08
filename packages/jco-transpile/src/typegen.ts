import { basename, resolve, extname } from 'node:path';

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

    const absWitPath = resolve(witPath);
    const types = generateTypes(name, {
        wit: { tag: 'path', val: (isWindows ? '//?/' : '') + absWitPath },
        instantiation,
        tlaCompat: opts.tlaCompat ?? false,
        world: opts.worldName,
        features,
        guest: opts.guest ?? false,
        asyncMode,
    }).map(([name, file]) => [`${outDir}${name}`, file]);

    return Object.fromEntries(types);
}
