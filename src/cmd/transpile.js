import { $init, generate } from '../../obj/js-component-bindgen-component.js';
import { writeFile } from 'fs/promises';
import { mkdir } from 'fs/promises';
import { dirname, extname, basename } from 'path';
import c from 'chalk-template';
import { readFile, sizeStr, table, spawnIOTmp, setShowSpinner, getShowSpinner } from '../common.js';
import { optimizeComponent } from './opt.js';
import { minify } from 'terser';
import { fileURLToPath } from 'url';
import ora from '#ora';

export async function transpile (componentPath, opts, program) {
  const varIdx = program.parent.rawArgs.indexOf('--');
  if (varIdx !== -1)
    opts.optArgs = program.parent.rawArgs.slice(varIdx + 1);
  const component = await readFile(componentPath);

  if (!opts.quiet)
    setShowSpinner(true);
  if (!opts.name)
    opts.name = basename(componentPath.slice(0, -extname(componentPath).length || Infinity));
  if (opts.map)
    opts.map = Object.fromEntries(opts.map.map(mapping => mapping.split('=')));
  const { files } = await transpileComponent(component, opts);

  await Promise.all(Object.entries(files).map(async ([name, file]) => {
    await mkdir(dirname(name), { recursive: true });
    await writeFile(name, file);
  }));

  if (!opts.quiet)
    console.log(c`
{bold Transpiled JS Component Files:}

${table(Object.entries(files).map(([name, source]) => [
  c` - {italic ${name}}  `,
  c`{black.italic ${sizeStr(source.length)}}`
]))}`);
}

let WASM_2_JS;
try {
  WASM_2_JS = fileURLToPath(new URL('../../node_modules/binaryen/bin/wasm2js', import.meta.url));
} catch {
  WASM_2_JS = new URL('../../node_modules/binaryen/bin/wasm2js', import.meta.url);
}

/**
 * @param {Uint8Array} source 
 * @returns {Promise<Uint8Array>}
 */
async function wasm2Js (source) {
  try {
    return await spawnIOTmp(WASM_2_JS, source, ['-Oz', '-o']);
  } catch (e) {
    if (e.toString().includes('BasicBlock requested'))
      return wasm2Js(source);
    throw e;
  }
}

/**
 * 
 * @param {Uint8Array} component 
 * @param {{
 *   name: string,
 *   instantiation?: bool,
 *   map?: Record<string, string>,
 *   validLiftingOptimization?: bool,
 *   noNodejsCompat?: bool,
 *   tlaCompat?: bool,
 *   base64Cutoff?: bool,
 *   js?: bool,
 *   minify?: bool,
 *   optimize?: bool,
 *   optArgs?: string[],
 * }} opts 
 * @returns {Promise<{ files: { [filename: string]: Uint8Array }, imports: string[], exports: [string, 'function' | 'instance'][] }>}
 */
export async function transpileComponent (component, opts = {}) {
  await $init;
  if (opts.noWasiShim || opts.instantiation) opts.wasiShim = false;

  let spinner;
  const showSpinner = getShowSpinner();
  if (opts.optimize) {
    if (showSpinner) setShowSpinner(true);
    ({ component } = await optimizeComponent(component, opts));
  }

  if (opts.wasiShim !== false) {
    opts.map = Object.assign({
      'wasi:cli/*': '@bytecodealliance/preview2-shim/cli#*',
      'wasi:clocks/*': '@bytecodealliance/preview2-shim/clocks#*',
      'wasi:filesystem/*': '@bytecodealliance/preview2-shim/filesystem#*',
      'wasi:http/*': '@bytecodealliance/preview2-shim/http#*',
      'wasi:io/*': '@bytecodealliance/preview2-shim/io#*',
      'wasi:logging/*': '@bytecodealliance/preview2-shim/logging#*',
      'wasi:poll/*': '@bytecodealliance/preview2-shim/poll#*',
      'wasi:random/*': '@bytecodealliance/preview2-shim/random#*',
      'wasi:sockets/*': '@bytecodealliance/preview2-shim/sockets#*',
    }, opts.map || {});
  }

  let { files, imports, exports } = generate(component, {
    name: opts.name ?? 'component',
    map: Object.entries(opts.map ?? {}),
    instantiation: opts.instantiation || opts.js,
    validLiftingOptimization: opts.validLiftingOptimization ?? false,
    noNodejsCompat: !(opts.nodejsCompat ?? true),
    tlaCompat: opts.tlaCompat ?? false,
    base64Cutoff: opts.js ? 0 : opts.base64Cutoff ?? 5000
  });

  let outDir = (opts.outDir ?? '').replace(/\\/g, '/');
  if (!outDir.endsWith('/') && outDir !== '')
    outDir += '/';
  files = files.map(([name, source]) => [`${outDir}${name}`, source]);

  const jsFile = files.find(([name]) => name.endsWith('.js'));

  if (opts.js) {
    const source = Buffer.from(jsFile[1]).toString('utf8')
      // update imports manging to match emscripten asm
      .replace(/exports(\d+)\['([^']+)']/g, (_, i, s) => `exports${i}['${asmMangle(s)}']`);
    
    const wasmFiles = files.filter(([name]) => name.endsWith('.wasm'));
    files = files.filter(([name]) => !name.endsWith('.wasm'));

    // TODO: imports as specifier list

    let completed = 0;
    const spinnerText = () => c`{cyan ${completed} / ${wasmFiles.length}} Running Binaryen wasm2js on Wasm core modules (this takes a while)...\n`;
    if (showSpinner) {
      spinner = ora({
        color: 'cyan',
        spinner: 'bouncingBar'
      }).start();
      spinner.text = spinnerText();
    }

    try {
      const asmFiles = await Promise.all(wasmFiles.map(async ([, source]) => {
        const output = (await wasm2Js(source)).toString('utf8');
        if (spinner) {
          completed++;
          spinner.text = spinnerText();
        }
        return output;
      }));

      const asms = asmFiles.map((asm, i) =>`function asm${i}(imports) {
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
      }`).join(',\n');

      const outSource = `${
        imports.map((impt, i) => `import * as import${i} from '${impt}';`).join('\n')}
${source.replace('export async function instantiate', 'async function instantiate')}

let ${exports.filter(([, ty]) => ty === 'function').map(([name]) => '_' + name).join(', ')};

${exports.map(([name, ty]) => ty === 'function' ? `\nfunction ${asmMangle(name)} () {
  return _${name}.apply(this, arguments);
}` : `\nlet ${asmMangle(name)};`).join('\n')}

const asmInit = [${asms}];

${opts.tlaCompat ? 'export ' : ''}const $init = (async () => {
  let idx = 0;
  ({ ${exports.map(([name, ty]) => asmMangle(name) === name ? name : `'${name}': ${asmMangle(name)}`).join(',\n')} } = await instantiate(n => idx++, {
${imports.map((impt, i) => `    '${impt}': import${i},`).join('\n')}
  }, (i, imports) => ({ exports: asmInit[i](imports) })));
})();${exports.length > 0 ? `\nexport { ${exports.map(([name]) => name === asmMangle(name) ? `${name}` : `${asmMangle(name)} as "${name}"`).join(', ')} }` : ''}
${opts.tlaCompat ? '' : '\nawait $init;\n'}`;

      jsFile[1] = Buffer.from(outSource);
    }
    finally {
      if (spinner)
        spinner.stop();
    }
  }

  if (opts.minify) {
    ({ code: jsFile[1] } = await minify(Buffer.from(jsFile[1]).toString('utf8'), {
      module: true,
      compress: {
        ecma: 9,
        unsafe: true
      },
      mangle: {
        keep_classnames: true
      }
    }));
  }

  return { files: Object.fromEntries(files), imports, exports };
}

// emscripten asm mangles specifiers to be valid identifiers
// for imports to match up we must do the same
// See https://github.com/WebAssembly/binaryen/blob/main/src/asmjs/asmangle.cpp
function asmMangle (name) {
  if (name === '')
    return '$';
  
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
      if (!(chNum >= 97 && chNum <= 122) && !(chNum >= 65 && chNum <= 90)) {
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
        if (!(chNum >= 97 && chNum <= 122) && !(chNum >= 65 && chNum <= 90)) {
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
        if (name == "arguments")
          return name + '_';
        break;
      }
      case 'b': {
        if (name == "break")
          return name + '_';
        break;
      }
      case 'c': {
        if (name == "case" || name == "continue" || name == "catch" ||
            name == "const" || name == "class")
          return name + '_';
        break;
      }
      case 'd': {
        if (name == "do" || name == "default" || name == "debugger")
          return name + '_';
        break;
      }
      case 'e': {
        if (name == "else" || name == "enum" || name == "eval" || // to be sure
            name == "export" || name == "extends")
          return name + '_';
        break;
      }
      case 'f': {
        if (name == "for" || name == "false" || name == "finally" ||
            name == "function")
          return name + '_';
        break;
      }
      case 'i': {
        if (name == "if" || name == "in" || name == "import" ||
            name == "interface" || name == "implements" ||
            name == "instanceof")
          return name + '_';
        break;
      }
      case 'l': {
        if (name == "let")
          return name + '_';
        break;
      }
      case 'n': {
        if (name == "new" || name == "null")
          return name + '_';
        break;
      }
      case 'p': {
        if (name == "public" || name == "package" || name == "private" ||
            name == "protected")
          return name + '_';
        break;
      }
      case 'r': {
        if (name == "return")
          return name + '_';
        break;
      }
      case 's': {
        if (name == "super" || name == "static" || name == "switch")
          return name + '_';
        break;
      }
      case 't': {
        if (name == "try" || name == "this" || name == "true" ||
            name == "throw" || name == "typeof")
          return name + '_';
        break;
      }
      case 'v': {
        if (name == "var" || name == "void")
          return name + '_';
        break;
      }
      case 'w': {
        if (name == "with" || name == "while")
          return name + '_';
        break;
      }
      case 'y': {
        if (name == "yield")
          return name + '_';
        break;
      }
    }
  }
  return name;
}