import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { extname, basename, resolve } from 'node:path';

import { minify } from 'terser';

import {
    $init as $initBindgenComponent,
    generate,
} from '../vendor/js-component-bindgen-component.js';

import {
    $init as $initWasmToolsComponent,
    tools,
} from '../vendor/wasm-tools.js';
const { componentEmbed, componentNew } = tools;

import { runOptimizeComponent, type OptimizeOptions } from './opt.js';
import { isWindows } from './common.js';
import { ASYNC_WASI_IMPORTS, ASYNC_WASI_EXPORTS } from './constants.js';
import { generateASMJS } from './asm.js';

/** Representation of WIT enums */
export type WITVariant<T, V> = { tag: T, val?: V };

/** Instantiation mode for a transpiled component */
export type InstantiationMode = 'async' | 'sync';

/** Instantiation mode as a WIT enum */
export type WITInstantiationMode = WITVariant<InstantiationMode, undefined>;

/** Async mode for the component (i.e. whether to use JSPI) */
export type AsyncMode = 'sync' | 'jspi';

/** Async mode as a WIT variant */
export type WITAsyncMode = WITVariant<AsyncMode, { imports: string[], exports: string[] }>;

/** Options for transpilation */
export interface TranspilationOptions {
    /** Name of the component */
    name?: string;

    /**
     * Instantiation mode
     *
     * This determines whether importing the module instantiates it or not,
     * which influeces whether imports can be supplied dynamically at instantiation
     * time or not.
     */
    instantiation?: InstantiationMode,

    /** How to import bindings */
    importBindings?: 'js' | 'optimized' | 'hybrid' | 'direct-optimized';

    /**
     * Mapping of imports that will be used for transpilation
     *
     * ```
     * map: {
     *     'wasi:cli/*': '@bytecodealliance/preview2-shim/cli#*',
     *     ...
     * }
     * ```
     */
    map?: Record<string, string>;

    /** Asynchronous mode to use */
    asyncMode?: AsyncMode;

    /**
     * Imports that should be treated as asynchronous *host side* functions
     *
     * This option works in conjunction with `asyncMode` set to `'jspi'`
     */
    asyncImports?: string[];

    /**
     * Exports that should be treated as asynchronous Wasm functions to the Host that
     * calls them.
     *
     * This option works in conjunction with `asyncMode` set to `'jspi'`
     */
    asyncExports?: string[];

    /**
     * WASI imports that should be marked as asynchronous
     *
     * @see: `asyncImports`
     */
    asyncWasiImports?: string[];

    /**
     * WASI exports that should be marked as asynchronous
     *
     * @see: `asyncExports`
     */
    asyncWasiExports?: string[];

    /** Whether the valid lifting optimization should be performed */
    validLiftingOptimization?: boolean;

    /** Enable/disable tracing for debug purposes */
    tracing?: boolean;

    /** Enable/disable NodeJS compat */
    nodejsCompat?: boolean;

    /** Enable/disable Top Level Await ("TLA") compat */
    tlaCompat?: boolean;

    /** Cutoff of base64 content in the binary */
    base64Cutoff?: number;

    /**
     * Whether to generate the code for ASM.js, with a separate instantiate function
     *
     * @see `generateASMJS()`
     */
    js?: boolean;

    /** Whether to perform minification of the JS */
    minify?: boolean;

    /** Whether to optimize the WebAssembly binary with wasm-opt */
    optimize?: boolean;

    /** Arguments to wasm-opt */
    optimizeOptions?: OptimizeOptions,

    /** Whether to use namespaced exports */
    namespacedExports?: boolean;

    /** Output directory */
    outDir?: string;

    /** Whether to use multi memory support */
    multiMemory?: boolean;

    /** Whether to enable WebIDL imports */
    experimentalIdlImports?: boolean;

    /** Whether to shim WASI imports */
    wasiShim?: boolean

    /** Whether to emit Typescript declaration files */
    emitTypescriptDeclarations?: boolean

    /** Whether to create a stub */
    stub?: boolean;
}

interface TranspilationResult {
  files: {
    [filename: string]: Uint8Array;
  };
  imports: string[];
  exports: [string, 'function' | 'instance'][];
}

/**
 * Transpile a provided WebAssembly component to an ES module
 * that can be run in JS environments
 *
 * @param componentPath
 * @param [opts]
 * @returns A `Promise` that resolves to the result (generated files, etc) of the transpilation
 */
export async function transpile(componentPath: string, opts: TranspilationOptions = {}): Promise<TranspilationResult> {
    if (opts.map && Array.isArray(opts.map)) {
        throw new Error('opts.map must be an object, not an array');
    }

    let component: Uint8Array;
    if (opts?.stub) {
        try {
            await $initWasmToolsComponent;
            component = componentNew(
                componentEmbed({
                    dummy: true,
                    witPath: (isWindows ? '//?/' : '') + resolve(componentPath),
                }),
                []
            );
        } catch (err) {
            console.error('failed to run component new:', err);
            throw err;
        }
    } else {
        component = await readFile(componentPath);
    }

    if (!opts?.name) {
        opts.name = basename(
            componentPath.slice(0, -extname(componentPath).length || Infinity)
        );
    }


    if (opts?.asyncWasiImports) {
        opts.asyncImports = ASYNC_WASI_IMPORTS.concat(opts.asyncImports || []);
    }

    if (opts?.asyncWasiExports) {
        opts.asyncExports = ASYNC_WASI_EXPORTS.concat(opts.asyncExports || []);
    }

    return await transpileBytes(component, opts);
}

/**
 * Perform transpilation, using the transpiled js-component-bindgen Rust crate.
 *
 * @param component - component bytes
 * @param [opts] - transpilation options
 * @returns A `Promise` that resolves to the results of transpilation
 */
export async function transpileBytes(
    component: Uint8Array,
    opts: TranspilationOptions = {},
): Promise<TranspilationResult> {
    await $initBindgenComponent;

    // If we specified an instantiation mode, we should disable WASI shimming
    // as the user must supply their own imports at instantiation time
    if (opts.instantiation) {
        opts.wasiShim = false;
    }

    // Perform optimization if specified
    if (opts.optimize) {
        const optResult = await runOptimizeComponent(component, opts.optimizeOptions);
        component =  optResult.component;
    }

    // If WASI shimming has been enabled, update the map option
    if (opts.wasiShim === true) {
        opts.map = Object.assign(
            {
                'wasi:cli/*': '@bytecodealliance/preview2-shim/cli#*',
                'wasi:clocks/*': '@bytecodealliance/preview2-shim/clocks#*',
                'wasi:filesystem/*':
                    '@bytecodealliance/preview2-shim/filesystem#*',
                'wasi:http/*': '@bytecodealliance/preview2-shim/http#*',
                'wasi:io/*': '@bytecodealliance/preview2-shim/io#*',
                'wasi:random/*': '@bytecodealliance/preview2-shim/random#*',
                'wasi:sockets/*': '@bytecodealliance/preview2-shim/sockets#*',
            },
            opts.map || {}
        );
    }

    let instantiation: WITInstantiationMode = { tag: 'sync' };

    // Let's define `instantiation` from `--instantiation` if it's present.
    if (opts.instantiation) {
        instantiation = { tag: opts.instantiation };
    } else if (opts.js) {
    // Otherwise, if `--js` is present, an `instantiate` function is required.
        instantiation = { tag: 'async' };
    }

    // Determine the async mode that should be used
    // (i.e. determining whether JSPI should be used)
    const asyncMode =
        !opts.asyncMode || opts.asyncMode === 'sync'
            ? undefined
            : {
                tag: opts.asyncMode,
                val: {
                    imports: opts.asyncImports || [],
                    exports: opts.asyncExports || [],
                },
            };


    // Build the options for calling into the js-component-bindgen's `generate()` export
    const generateOpts = {
        name: opts.name ?? 'component',
        map: Object.entries(opts.map ?? {}),
        instantiation,
        asyncMode,
        importBindings: opts.importBindings
            ? { tag: opts.importBindings }
            : undefined,
        validLiftingOptimization: opts.validLiftingOptimization ?? false,
        tracing: opts.tracing ?? false,
        noNodejsCompat: opts.nodejsCompat === false,
        noTypescript: opts.emitTypescriptDeclarations === false,
        tlaCompat: opts.tlaCompat ?? false,
        base64Cutoff: opts.js ? 0 : (opts.base64Cutoff ?? 5000),
        noNamespacedExports: opts.namespacedExports === false,
        multiMemory: opts.multiMemory === true,
    };

    // Generate the component
    let { files, imports, exports } = generate(component, generateOpts);

    // Determine the output directory & paths
    let outDir = (opts.outDir ?? '').replace(/\\/g, '/');
    if (!outDir.endsWith('/') && outDir !== '') {
        outDir += '/';
    }
    files = files.map(([name, source]) => [`${outDir}${name}`, source]);

    // Find JS files
    const jsFiles = files.find(([name]) => name.endsWith('.js'));

    // Generate ASM.js from the JS files if configured
    if (opts.js && jsFiles) {
        jsFiles[1] = Buffer.from(
            await generateASMJS({
                opts,
                inputJS: jsFiles[1],
                files,
                instantiation,
                imports,
                exports,
            })
        );
    }

    // Perform minification if configured
    if (opts.minify && jsFiles) {
        const minified = await minify(
            Buffer.from(jsFiles[1]).toString('utf8'),
            {
                module: true,
                compress: {
                    ecma: 2019,
                    unsafe: true,
                },
                mangle: {
                    keep_classnames: true,
                },
            }
        );
        jsFiles[1] = (new TextEncoder()).encode(minified.code);
    }

    return { files: Object.fromEntries(files), imports, exports };
}
