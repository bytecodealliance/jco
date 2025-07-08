import { Buffer } from 'node:buffer';
import { extname, basename, resolve } from 'node:path';

import { minify } from 'terser';
import { fileURLToPath } from 'url';

import { runOptimizeComponent } from './opt.js';
import { readFile, runWASMTransformProgram, isWindows } from './common.js';
import { ASYNC_WASI_IMPORTS, ASYNC_WASI_EXPORTS } from './constants.js';

import {
    $init as $initBindgenComponent,
    generate,
} from '../vendor/js-component-bindgen-component.js';

import {
    $init as $initWasmToolsComponent,
    tools,
} from '../vendor/wasm-tools.js';
const { componentEmbed, componentNew } = tools;

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
export async function transpile(componentPath, opts) {
    opts ??= {};
    let component;
    if (!opts?.stub) {
        component = await readFile(componentPath);
    } else {
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
    }

    if (!opts?.name) {
        opts.name = basename(
            componentPath.slice(0, -extname(componentPath).length || Infinity)
        );
    }

    if (opts?.map) {
        opts.map = Object.fromEntries(
            opts.map.map((mapping) => mapping.split('='))
        );
    }

    if (opts?.asyncWasiImports) {
        opts.asyncImports = ASYNC_WASI_IMPORTS.concat(opts.asyncImports || []);
    }

    if (opts?.asyncWasiExports) {
        opts.asyncExports = ASYNC_WASI_EXPORTS.concat(opts.asyncExports || []);
    }

    return await runTranspileComponent(component, opts);
}

/**
 * Convert a WebAssembly module to JS (via Binaryen)
 *
 * @param {Uint8Array} source
 * @returns {Promise<Uint8Array>}
 */
async function wasm2Js(source) {
    const wasm2jsPath = fileURLToPath(
        import.meta.resolve('binaryen/bin/wasm2js')
    );

    try {
        return await runWASMTransformProgram(wasm2jsPath, source, [
            '-Oz',
            '-o',
        ]);
    } catch (e) {
        if (e.toString().includes('BasicBlock requested')) {
            return wasm2Js(source);
        }
        throw e;
    }
}

/**
 * Perform transpilation, using the transpiled js-component-bindgen Rust crate.
 *
 * @param {Uint8Array} component
 * @param {TranspilationOptions} [opts]
 * @returns {Promise<TranspilationResult}>}
 */
export async function runTranspileComponent(component, opts = {}) {
    await $initBindgenComponent;
    if (opts.instantiation) {
        opts.wasiShim = false;
    }

    if (opts.optimize) {
        ({ component } = await runOptimizeComponent(component, opts));
    }

    if (opts.wasiShim !== false) {
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

    let instantiation = null;

    // Let's define `instantiation` from `--instantiation` if it's present.
    if (opts.instantiation) {
        instantiation = { tag: opts.instantiation };
    }
    // Otherwise, if `--js` is present, an `instantiate` function is required.
    else if (opts.js) {
        instantiation = { tag: 'async' };
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

    let { files, imports, exports } = generate(component, {
        name: opts.name ?? 'component',
        map: Object.entries(opts.map ?? {}),
        instantiation,
        asyncMode,
        importBindings: opts.importBindings
            ? { tag: opts.importBindings }
            : null,
        validLiftingOptimization: opts.validLiftingOptimization ?? false,
        tracing: opts.tracing ?? false,
        noNodejsCompat: opts.nodejsCompat === false,
        noTypescript: opts.typescript === false,
        tlaCompat: opts.tlaCompat ?? false,
        base64Cutoff: opts.js ? 0 : (opts.base64Cutoff ?? 5000),
        noNamespacedExports: opts.namespacedExports === false,
        multiMemory: opts.multiMemory === true,
        idlImports: opts.experimentalIdlImports === true,
    });

    let outDir = (opts.outDir ?? '').replace(/\\/g, '/');
    if (!outDir.endsWith('/') && outDir !== '') {
        outDir += '/';
    }
    files = files.map(([name, source]) => [`${outDir}${name}`, source]);

    const jsFiles = files.find(([name]) => name.endsWith('.js'));

    // Generate JS if specified
    if (opts.js) {
        jsFiles[1] = Buffer.from(
            await generateJS({
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
    if (opts.minify) {
        ({ code: jsFiles[1] } = await minify(
            Buffer.from(jsFiles[1]).toString('utf8'),
            {
                module: true,
                compress: {
                    ecma: 9,
                    unsafe: true,
                },
                mangle: {
                    keep_classnames: true,
                },
            }
        ));
    }

    return { files: Object.fromEntries(files), imports, exports };
}

/** Generate code for the `--js` option.
 *
 * `--js` can be called with or without `--instantiation`. The generated code
 * isn't exactly the same!
 *
 * `--js` needs an `instantiate` function to work, so it might look like
 * `--instantiation` is always implied, but actually no. It is correct
 * that when `--js` is present, an `instantiate` function _is_ generated,
 * but it doesn't mean that we expect the function to be used, it's simply
 * not exported, plus `instantiate` is automatically called (if `--tla-compat`
 * is `false`). When `--instantiation` is missing, functions are exported
 * with the `export` directive, and imports are imported with the `import`
 * directive. When `--instantiation` is present, there is no `export` and no
 * `import`: only a single exported `instantiate` function.
 *
 * Basically, we get this:
 *
 * * `--js` only:
 *   * `instantiate` is renamed to `_instantiate`,
 *   * A new `instantiate` function is created, that calls `_instantiate` with
 *     the correct imports (which are ASM.js code) and returns the exports,
 *   * A new `$init` function is created, that calls `instantiate` and maps
 *     the returned exports to their respective trampolines,
 *   * Trampolines are exported,
 *   * `$init` is called automatically.
 *
 * * `--js` with `--tla-compat`:
 *   * Same as with `--js` only, except that `$init` is exported instead of
 *     being called immediately.
 *
 * * `--js` with `--instantiation[=async]`:
 *   * `instantiate` is renamed to `_instantiate`,
 *   * A new `instantiate` function is created, that calls `_instantiate` with
 *     the correct imports (which are ASM.js code) and returns the exports,
 *   * `instantiate` is exported.
 *
 * * `--js` with `--instantiation=sync`:
 *   * Same as `--js` with `--instantiation[=async]`, except that
 *     `_instantiate` and `instantiate` are non-async.
 *
 * Be careful with the variables: `opts.instantiation` reflects the presence
 * or the absence of the `--instantiation` flag, whilst `instantiation`
 * reflects how the `instantiate` function must be generated. We also use
 * `instantiation` to know whether the generated code must be async or
 * non-async.
 *
 * @param {TranspileOptions}
 * @returns {Promise<string>} A Promise that resolves when javascript has been generated
 */
async function generateJS(args) {
    const { opts, inputJS, instantiation, imports, exports } = args;
    let files = args.files;

    const withInstantiation = opts.instantiation !== undefined;
    const async_ = instantiation.tag == 'async' ? 'async ' : '';
    const await_ = instantiation.tag == 'async' ? 'await ' : '';

    // Format the previously generated code.
    const source = Buffer.from(inputJS)
        .toString('utf8')
        // update imports manging to match emscripten asm
        .replace(
            /exports(\d+)\['([^']+)']/g,
            (_, i, s) => `exports${i}['${asmMangle(s)}']`
        )
        .replace(
            /export (async )?function instantiate/,
            '$1function _instantiate'
        );

    // Filter to get all current generated wasm files
    const wasmFiles = files.filter(([name]) => name.endsWith('.wasm'));

    // Filter out wasm files
    files = files.filter(([name]) => !name.endsWith('.wasm'));

    // Compile all Wasm modules into ASM.js codes.
    const asmFiles = await Promise.all(
        wasmFiles.map(async ([, source]) => {
            const output = (await wasm2Js(source)).toString('utf8');
            return output;
        })
    );

    const asms = asmFiles
        .map(
            (asm, nth) => `function asm${nth}(imports) {
  ${
      // strip and replace the asm instantiation wrapper
      asm
          .replace(/import \* as [^ ]+ from '[^']*';/g, '')
          .replace('function asmFunc(imports) {', '')
          .replace(/export var ([^ ]+) = ([^. ]+)\.([^ ]+);/g, '')
          .replace(/var retasmFunc = [\s\S]*$/, '')
          .replace(/var memasmFunc = new ArrayBuffer\(0\);/g, '')
          .replace('memory.grow = __wasm_memory_grow;', '')
          .trim()
  }`
        )
        .join(',\n');

    // The `instantiate` function.
    const instantiateFunction = `${
        withInstantiation ? 'export ' : ''
    }${async_}function instantiate(imports) {
  const wasm_file_to_asm_index = {
    ${wasmFiles
        .map(([path], nth) => `'${basename(path)}': ${nth}`)
        .join(',\n    ')}
  };

  return ${await_}_instantiate(
      module_name => wasm_file_to_asm_index[module_name],
      imports,
      (module_index, imports) => ({ exports: asmInit[module_index](imports) })
  );
}`;

    // If `--js` is used without `--instantiation`.
    let importDirectives = '';
    let exportDirectives = '';
    let exportTrampolines = '';
    let autoInstantiate = '';

    if (!withInstantiation) {
        importDirectives = imports
            .map(
                (import_file, nth) =>
                    `import * as import${nth} from '${import_file}';`
            )
            .join('\n');

        if (exports.length > 0 || opts.tlaCompat) {
            exportDirectives = `export {
${
    // Exporting `$init` must come first to not break the transpiling tests.
    opts.tlaCompat ? '  $init,\n' : ''
}${exports
                .map(([name]) => {
                    if (name === asmMangle(name)) {
                        return `  ${name},`;
                    } else {
                        return `  ${asmMangle(name)} as '${name}',`;
                    }
                })
                .join('\n')}
}`;
        }

        exportTrampolines = `let ${exports
            .filter(([, ty]) => ty === 'function')
            .map(([name]) => `_${asmMangle(name)}`)
            .join(', ')};
${exports
    .map(([name, ty]) => {
        if (ty === 'function') {
            return `\nfunction ${asmMangle(name)} () {
  return _${asmMangle(name)}.apply(this, arguments);
}`;
        } else {
            return `\nlet ${asmMangle(name)};`;
        }
    })
    .join('\n')}`;

        autoInstantiate = `${async_}function $init() {
  ( {
${exports
    .map(([name, ty]) => {
        if (ty === 'function') {
            return `    '${name}': _${asmMangle(name)},`;
        } else if (asmMangle(name) === name) {
            return `    ${name},`;
        } else {
            return `    '${name}': ${asmMangle(name)},`;
        }
    })
    .join('\n')}
  } = ${await_}instantiate(
    {
${imports
    .map((import_file, nth) => `      '${import_file}': import${nth},`)
    .join('\n')}
    }
  ) )
}

${opts.tlaCompat ? '' : `${await_}$init();`}`;
    }

    // Prepare the final generated code.
    const outSource = `${importDirectives}

${source}

const asmInit = [${asms}];

${exportTrampolines}

${instantiateFunction}

${exportDirectives}

${autoInstantiate}`;

    return outSource;
}

// emscripten asm mangles specifiers to be valid identifiers
// for imports to match up we must do the same
// See https://github.com/WebAssembly/binaryen/blob/main/src/asmjs/asmangle.cpp
function asmMangle(name) {
    if (name === '') {
        return '$';
    }

    let mightBeKeyword = true;
    let i = 1;

    // Names must start with a character, $ or _
    switch (name[0]) {
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9': {
            name = '$' + name;
            i = 2;
            // fallthrough
        }
        case '$':
        case '_': {
            mightBeKeyword = false;
            break;
        }
        default: {
            let chNum = name.charCodeAt(0);
            if (
                !(chNum >= 97 && chNum <= 122) &&
                !(chNum >= 65 && chNum <= 90)
            ) {
                name = '$' + name.substr(1);
                mightBeKeyword = false;
            }
        }
    }

    // Names must contain only characters, digits, $ or _
    let len = name.length;
    for (; i < len; ++i) {
        switch (name[i]) {
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
            case '$':
            case '_': {
                mightBeKeyword = false;
                break;
            }
            default: {
                let chNum = name.charCodeAt(i);
                if (
                    !(chNum >= 97 && chNum <= 122) &&
                    !(chNum >= 65 && chNum <= 90)
                ) {
                    name = name.substr(0, i) + '_' + name.substr(i + 1);
                    mightBeKeyword = false;
                }
            }
        }
    }

    // Names must not collide with keywords
    if (mightBeKeyword && len >= 2 && len <= 10) {
        switch (name[0]) {
            case 'a': {
                if (name == 'arguments') {
                    return name + '_';
                }
                break;
            }
            case 'b': {
                if (name == 'break') {
                    return name + '_';
                }
                break;
            }
            case 'c': {
                if (
                    name == 'case' ||
                    name == 'continue' ||
                    name == 'catch' ||
                    name == 'const' ||
                    name == 'class'
                ) {
                    return name + '_';
                }
                break;
            }
            case 'd': {
                if (name == 'do' || name == 'default' || name == 'debugger') {
                    return name + '_';
                }
                break;
            }
            case 'e': {
                if (
                    name == 'else' ||
                    name == 'enum' ||
                    name == 'eval' || // to be sure
                    name == 'export' ||
                    name == 'extends'
                ) {
                    return name + '_';
                }
                break;
            }
            case 'f': {
                if (
                    name == 'for' ||
                    name == 'false' ||
                    name == 'finally' ||
                    name == 'function'
                ) {
                    return name + '_';
                }
                break;
            }
            case 'i': {
                if (
                    name == 'if' ||
                    name == 'in' ||
                    name == 'import' ||
                    name == 'interface' ||
                    name == 'implements' ||
                    name == 'instanceof'
                ) {
                    return name + '_';
                }
                break;
            }
            case 'l': {
                if (name == 'let') {
                    return name + '_';
                }
                break;
            }
            case 'n': {
                if (name == 'new' || name == 'null') {
                    return name + '_';
                }
                break;
            }
            case 'p': {
                if (
                    name == 'public' ||
                    name == 'package' ||
                    name == 'private' ||
                    name == 'protected'
                ) {
                    return name + '_';
                }
                break;
            }
            case 'r': {
                if (name == 'return') {
                    return name + '_';
                }
                break;
            }
            case 's': {
                if (name == 'super' || name == 'static' || name == 'switch') {
                    return name + '_';
                }
                break;
            }
            case 't': {
                if (
                    name == 'try' ||
                    name == 'this' ||
                    name == 'true' ||
                    name == 'throw' ||
                    name == 'typeof'
                ) {
                    return name + '_';
                }
                break;
            }
            case 'v': {
                if (name == 'var' || name == 'void') {
                    return name + '_';
                }
                break;
            }
            case 'w': {
                if (name == 'with' || name == 'while') {
                    return name + '_';
                }
                break;
            }
            case 'y': {
                if (name == 'yield') {
                    return name + '_';
                }
                break;
            }
        }
    }
    return name;
}

// see: https://github.com/vitest-dev/vitest/issues/6953#issuecomment-2505310022
if (typeof __vite_ssr_import_meta__ !== 'undefined') {
    __vite_ssr_import_meta__.resolve = (path) =>
        'file://' + globalCreateRequire(import.meta.url).resolve(path);
}
