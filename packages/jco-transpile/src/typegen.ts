import { basename, resolve, extname } from 'node:path';

import {
    $init as $initBindgenComponent,
    type AsyncMode,
    type EnabledFeatureSet,
    generateTypes,
} from '../vendor/js-component-bindgen-component.js';

import { InstantiationMode, TranspilationOptions } from './transpile.js';
import { extractWITAsyncModeFromOpts, type FileBytes, isWindows } from './common.js';

import { ASYNC_WASI_IMPORTS, ASYNC_WASI_EXPORTS } from './constants.js';

/** Options for type generation */
interface TypegenOptions {
    /** Name of the component */
    name?: string;

    /** Name of the WIT world to use */
    worldName?: string;

    /** Instantiation mode to use */
    instantiation?: InstantiationMode;

    /** Whether to add code for Top Level Await compatibility */
    tlaCompat?: TranspilationOptions['tlaCompat'];

    /** Instantiation mode to use */
    asyncMode?: TranspilationOptions['asyncMode'];

    /** @see `TranspilationOptions#asyncImports` */
    asyncImports?: TranspilationOptions['asyncImports'];

    /** @see `TranspilationOptions#asyncExports` */
    asyncExports?: TranspilationOptions['asyncExports'];

    /** Output directory */
    outDir?: string;

    /** Features to enable for type generation */
    features?: string[] | 'all';

    /** Whether to enable all features */
    allFeatures?: boolean;

    /** @see `TranspilationOptions#asyncWasiImports` */
    asyncWasiImports?: TranspilationOptions['asyncWasiImports'];

    /** @see `TranspilationOptions#asyncWasiExports` */
    asyncWasiExports?: TranspilationOptions['asyncWasiExports'];

    /**
     * Whether types should be generated for a guest (Wasm component)
     * as opposed to a host (NodeJS, via `jco transpile`) binding.
     */
    guest?: boolean;
}

/**
 * Generate host types for a given WIT world
 *
 * @param witPath - path to the file/directory containing the WIT world
 * @param opts - options for controlling type generation
 * @returns A `Promise` that resolves to written file data
 */
export async function generateHostTypes(witPath: string, opts: TypegenOptions): Promise<FileBytes> {
    return await runTypesComponent(witPath, opts);
}

/**
 * Generate guest types for a given WIT world
 *
 * @param witPath - path to the file/directory containing the WIT world
 * @param opts - options for controlling type generation
 * @returns A `Promise` that resolves to written file data
 */
export async function generateGuestTypes(witPath: string, opts: TypegenOptions): Promise<FileBytes> {
    return await runTypesComponent(witPath, { ...opts, guest: true });
}

/**
 * Perform type generation for a given WIT file/directory, by running the transpiled
 * type generation component.
 *
 * This function relies on the transpiled js-component-bindgen to perform
 * functionality that is made available via Rust libraries.
 *
 * @param witPath
 * @param opts - options for controlling type generation
 * @returns A `Promise` that resolves to written file data
 */
export async function runTypesComponent(witPath: string, opts: TypegenOptions) {
    await $initBindgenComponent;

    let name;
    if (opts.name) {
        name = opts.name
    } else if (opts.worldName) {
        const ns = opts.worldName.split(':').pop();
        if (!ns) { throw new Error(`failed to parse out namespace from world name [${opts.worldName}]`); }
        name = ns.split('/').pop()
    } else {
        name = basename(witPath.slice(0, -extname(witPath).length || Infinity));
    }
    if (!name) { throw new Error('failed to determine name'); }

    let instantiation;
    if (opts.instantiation) {
        instantiation = { tag: opts.instantiation };
    }

    let outDir = (opts.outDir ?? '').replace(/\\/g, '/');
    if (!outDir.endsWith('/') && outDir !== '') {
        outDir += '/';
    }

    let features: EnabledFeatureSet;
    if (opts.allFeatures) {
        features = { tag: 'all' };
    } else if (Array.isArray(opts.features)) {
        features = { tag: 'list', val: opts.features };
    } else {
        features = { tag: 'list', val: [] };
    }

    if (opts.asyncWasiImports) {
        opts.asyncImports = ASYNC_WASI_IMPORTS.concat(opts.asyncImports || []);
    }
    if (opts.asyncWasiExports) {
        opts.asyncExports = ASYNC_WASI_EXPORTS.concat(opts.asyncExports || []);
    }

    const asyncMode = extractWITAsyncModeFromOpts({
        asyncMode: opts.asyncMode,
        asyncImports: opts.asyncImports,
        asyncExports: opts.asyncExports,
    }) as AsyncMode;

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
