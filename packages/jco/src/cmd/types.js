import { stat, mkdir } from 'node:fs/promises';
import { extname, basename, resolve } from 'node:path';

import {
    $init,
    generateTypes,
} from '../../obj/js-component-bindgen-component.js';

import {
    isWindows,
    writeFiles,
    resolveDefaultWITPath,
    styleText,
    ASYNC_WASI_IMPORTS,
    ASYNC_WASI_EXPORTS,
    DEFAULT_ASYNC_MODE,
} from '../common.js';

/** Default relative path for guest type declaration generation */
const DEFAULT_GUEST_TYPES_OUTPUT_DIR_PATH = './types/generated/wit/guest';

/** Default relative path for host type declaration generation */
const DEFAULT_HOST_TYPES_OUTPUT_DIR_PATH = './types/generated/wit/host';

export async function types(witPath, opts) {
    witPath = await resolveDefaultWITPath(witPath);

    // Use the default output directory if one was not provided
    if (!opts.outDir) {
        await mkdir(DEFAULT_HOST_TYPES_OUTPUT_DIR_PATH, { recursive: true });
        opts.outDir = resolve(DEFAULT_HOST_TYPES_OUTPUT_DIR_PATH);
        console.error(
            `no output directory specified for host type declarations, using [${DEFAULT_HOST_TYPES_OUTPUT_DIR_PATH}]`
        );
    }

    const files = await typesComponent(witPath, opts);

    await writeFiles(files, opts.quiet ? false : 'Generated Type Files');
}

export async function guestTypes(witPath, opts) {
    witPath = await resolveDefaultWITPath(witPath);

    // Use the default output directory if one was not provided
    if (!opts.outDir) {
        await mkdir(DEFAULT_GUEST_TYPES_OUTPUT_DIR_PATH, { recursive: true });
        opts.outDir = resolve(DEFAULT_GUEST_TYPES_OUTPUT_DIR_PATH);
        console.error(
            `no output directory specified for guest type declarations, using [${DEFAULT_GUEST_TYPES_OUTPUT_DIR_PATH}]`
        );
    }

    const files = await typesComponent(witPath, { ...opts, guest: true });
    await writeFiles(
        files,
        opts.quiet
            ? false
            : 'Generated Guest Typescript Definition Files (.d.ts)'
    );
}

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
 *   asyncExports?: string[],
 *   asyncImports?: string[],
 *   guest?: bool,
 * }} opts
 * @returns {Promise<{ [filename: string]: Uint8Array }>}
 */
export async function typesComponent(witPath, opts) {
    await $init;
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

    // Bulid list of enabled features
    let features = null;
    if (opts.allFeatures) {
        features = { tag: 'all' };
    } else if (Array.isArray(opts.feature)) {
        features = { tag: 'list', val: opts.feature };
    } else if (Array.isArray(opts.features)) {
        features = { tag: 'list', val: opts.features };
    }

    // Build list of async imports/exports
    let asyncImports = new Set([...(opts.asyncImports ?? [])]);
    if (opts.asyncWasiImports) {
        ASYNC_WASI_IMPORTS.forEach((v) => asyncImports.add(v));
    }
    let asyncExports = new Set([...(opts.asyncExports ?? [])]);
    if (opts.asyncWasiExports) {
        ASYNC_WASI_EXPORTS.forEach((v) => asyncExports.add(v));
    }

    // For simple type generation, we choose the "async mode" for the user
    // even though it is not relevant here (JSPI may not be used, as types may
    // be used to generate a guest that is never transpiled).
    let asyncMode = opts.asyncMode ?? DEFAULT_ASYNC_MODE;
    let asyncModeObj;
    if (asyncMode === 'jspi' || asyncExports.size > 0) {
        asyncModeObj = {
            tag: 'jspi',
            val: {
                imports: [...asyncImports],
                exports: [...asyncExports],
            },
        };
    } else if (asyncMode === 'sync') {
        asyncModeObj = null;
    } else {
        throw new Error(`invalid/unrecognized async mode [${asyncMode}]`);
    }

    // Run the type generation
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
            asyncMode: asyncModeObj,
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
    const warningPrefix = styleText(['yellow', 'bold'], 'warning');
    const pathMeta = await stat(witPath);
    let output = '\n';
    if (!pathMeta.isFile() && !pathMeta.isDirectory()) {
        output += `${warningPrefix} The supplited WIT path [${witPath}] is neither a file or directory.\n`;
        return output;
    }
    const ftype = pathMeta.isDirectory() ? 'directory' : 'file';
    output += `${warningPrefix} Your WIT ${ftype} [${witPath}] may be laid out incorrectly\n`;
    output += `${warningPrefix} Keep in mind the following rules:\n`;
    output += `${warningPrefix}     - Top level WIT files are in the same package (i.e. "ns:pkg" in "wit/*.wit")\n`;
    output += `${warningPrefix}     - All package dependencies should be in "wit/deps" (i.e. "some:dep" in "wit/deps/some-dep.wit"\n`;
    return output;
}

// see: https://github.com/vitest-dev/vitest/issues/6953#issuecomment-2505310022
if (typeof __vite_ssr_import_meta__ !== 'undefined') {
    __vite_ssr_import_meta__.resolve = (path) =>
        'file://' + globalCreateRequire(import.meta.url).resolve(path);
}
