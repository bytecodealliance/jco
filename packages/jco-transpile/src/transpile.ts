import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { extname, basename, resolve } from 'node:path';

import { minify } from 'terser';

import { $init as $initBindgenComponent, generate } from '../vendor/js-component-bindgen-component.js';
import type {
    AsyncMode as WITAsyncMode,
    InstantiationMode as WITInstantiationMode,
} from '../vendor/js-component-bindgen-component.js';

import { $init as $initWasmToolsComponent, tools } from '../vendor/wasm-tools.js';
const { componentEmbed, componentNew } = tools;

import { runOptimizeComponent, type OptimizeOptions } from './opt.js';
import { isWindows } from './common.js';
import { ASYNC_WASI_IMPORTS, ASYNC_WASI_EXPORTS } from './constants.js';
import { generateASMJS } from './asm.js';

/** Instantiation mode for a transpiled component */
export type InstantiationMode = 'async' | 'sync';

/** Async mode for the component (i.e. whether to use JSPI) */
export type AsyncMode = 'sync' | 'jspi';

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
    instantiation?: InstantiationMode | WITInstantiationMode;

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
    asyncMode?: AsyncMode | WITAsyncMode;

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
    optimizeOptions?: OptimizeOptions;

    /** Whether to use namespaced exports */
    namespacedExports?: boolean;

    /** Output directory */
    outDir?: string;

    /** Whether to use multi memory support */
    multiMemory?: boolean;

    /** Whether to enable WebIDL imports */
    experimentalIdlImports?: boolean;

    /** Whether to shim WASI imports */
    wasiShim?: boolean;

    /** Whether to emit Typescript declaration files */
    emitTypescriptDeclarations?: boolean;

    /** Whether to create a stub */
    stub?: boolean;

    /** Whether to run bindgen in strict mode */
    strict?: boolean;
}

interface TranspilationResult {
    files: Record<string, Uint8Array>;
    imports: string[];
    exports: [string, 'function' | 'instance'][];
}

const SUPPORTED_P3_VERSIONS = ['0.3.0-rc-2026-03-15', '0.3.0'];

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
                [],
            );
        } catch (err) {
            console.error('failed to run component new:', err);
            throw err;
        }
    } else {
        component = await readFile(componentPath);
    }

    if (!opts?.name) {
        opts.name = basename(componentPath.slice(0, -extname(componentPath).length || Infinity));
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
        // TODO: progress indication
        const optResult = await runOptimizeComponent(component, opts.optimizeOptions);
        component = optResult.component;
    }

    // If WASI shimming has not been explicitly disabled set up shims
    if (opts.wasiShim !== false) {
        const shims = {
            'wasi:cli/*': '@bytecodealliance/preview2-shim/cli#*',
            'wasi:clocks/*': '@bytecodealliance/preview2-shim/clocks#*',
            'wasi:filesystem/*': '@bytecodealliance/preview2-shim/filesystem#*',
            'wasi:http/*': '@bytecodealliance/preview2-shim/http#*',
            'wasi:io/*': '@bytecodealliance/preview2-shim/io#*',
            'wasi:random/*': '@bytecodealliance/preview2-shim/random#*',
            'wasi:sockets/*': '@bytecodealliance/preview2-shim/sockets#*',
        };

        // To avoid breaking compatibility with earlier version of p3 (including draft versions),
        // we over-populate the map with references to the *current* preview3-shim that has been
        // imported.
        //
        // This implicitly upgrades versions of P3 in use (a component that asks for 0.3.0 will get 0.3.1 if that
        // is the current version in preview3-shim0, but that should be acceptable as p3 should not have breaking
        // changes going forward.
        //
        for (const version of SUPPORTED_P3_VERSIONS) {
            Object.assign(shims, {
                [`wasi:cli/*@${version}`]: '@bytecodealliance/preview3-shim/cli#*',
                [`wasi:clocks/*@${version}`]: '@bytecodealliance/preview3-shim/clocks#*',
                [`wasi:filesystem/*@${version}`]: '@bytecodealliance/preview3-shim/filesystem#*',
                [`wasi:http/*@${version}`]: '@bytecodealliance/preview3-shim/http#*',
                [`wasi:random/*@${version}`]: '@bytecodealliance/preview3-shim/random#*',
                [`wasi:sockets/*@${version}`]: '@bytecodealliance/preview3-shim/sockets#*',
            });
        }

        opts.map = Object.assign(shims, opts.map || {});
    }

    // Determine the kind of instantiation that should be used (sync/async)
    let instantiation: WITInstantiationMode | undefined = undefined;
    if (opts.instantiation) {
        if (typeof opts.instantiation === 'string') {
            if (opts.instantiation !== 'sync' && opts.instantiation !== 'async') {
                throw new Error(`invalid/unrecognized instantiation mode [${opts.instantiation}]`);
            }
            instantiation = { tag: opts.instantiation };
        } else if (typeof opts.instantiation === 'object') {
            instantiation = opts.instantiation;
        } else {
            throw new Error('invalid instantiation configuration value');
        }
    } else if (opts.js) {
        // Otherwise, if `--js` is present, an `instantiate` function is required.
        instantiation = { tag: 'async' };
    }

    // Determine the async mode that should be used
    // (i.e. determining whether JSPI should be used)
    let asyncMode: WITAsyncMode | undefined = undefined;
    if (opts.asyncMode === 'jspi') {
        asyncMode = {
            tag: 'jspi',
            val: {
                imports: opts.asyncImports || [],
                exports: opts.asyncExports || [],
            },
        };
    }

    // Build the options for calling into the js-component-bindgen's `generate()` export
    const generateOpts = {
        name: opts.name ?? 'component',
        map: Object.entries(opts.map ?? {}),
        instantiation,
        asyncMode,
        importBindings: opts.importBindings ? { tag: opts.importBindings } : undefined,
        validLiftingOptimization: opts.validLiftingOptimization ?? false,
        tracing: opts.tracing ?? false,
        noNodejsCompat: opts.nodejsCompat === false,
        noTypescript: opts.emitTypescriptDeclarations === false,
        tlaCompat: opts.tlaCompat ?? false,
        base64Cutoff: opts.js ? 0 : (opts.base64Cutoff ?? 5000),
        noNamespacedExports: opts.namespacedExports === false,
        multiMemory: opts.multiMemory === true,
        strict: opts.strict === true,
        idlImports: opts.experimentalIdlImports === true,
        asmjs: opts.js === true,
    };

    // Generate the component
    const generated = generate(component, generateOpts);
    const imports = generated.imports;
    const exports = generated.exports;

    // Determine the output directory & paths
    let outDir = (opts.outDir ?? '').replace(/\\/g, '/');
    if (!outDir.endsWith('/') && outDir !== '') {
        outDir += '/';
    }
    const files: [string, Uint8Array][] = generated.files.map(([name, source]) => [`${outDir}${name}`, source]);

    // Find JS files
    const jsFile = files.find(([name]) => {
        if (typeof name !== 'string') {
            throw new Error('unexpected name value');
        }
        return name.endsWith('.js');
    });
    if (!jsFile) {
        throw new Error('failed to find generated JS module');
    }

    // Generate ASM.js from the JS files if configured
    if (opts.js && jsFile) {
        // TODO: progress report about to start (could take a while...)
        if (!instantiation) {
            throw new Error('missing required instantiation for jS');
        }
        jsFile[1] = Buffer.from(
            await generateASMJS({
                opts,
                inputJS: jsFile[1],
                files,
                instantiation,
                imports,
                exports,
            }),
        );
        // TODO: stop spinner
    }

    // Perform minification if configured
    if (opts.minify && jsFile) {
        const minified = await minify(Buffer.from(jsFile[1]).toString('utf8'), {
            module: true,
            compress: {
                ecma: 2019,
                unsafe: true,
            },
            mangle: {
                keep_classnames: true,
            },
        });
        jsFile[1] = new TextEncoder().encode(minified.code);
    }

    return { files: Object.fromEntries(files), imports, exports };
}
