import { $init, extractCoreModules, print } from '../../obj/wasm-tools.js';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import c from 'chalk-template';
import { sizeStr, fixedDigitDisplay, table, spawnIOTmp, setShowSpinner, getShowSpinner } from '../common.js';
import ora from 'ora';

try {
  var WASM_OPT = fileURLToPath(new URL('../../node_modules/binaryen/bin/wasm-opt', import.meta.url));
} catch (e) {
  var WASM_OPT = new URL('../../node_modules/binaryen/bin/wasm-opt', import.meta.url);
}

export async function opt (componentPath, opts, program) {
  const varIdx = program.parent.rawArgs.indexOf('--');
  if (varIdx !== -1)
    opts.optArgs = program.parent.rawArgs.slice(varIdx + 1);
  const componentBytes = await readFile(componentPath);

  if (!opts.quiet) setShowSpinner(true);
  const optPromise = optimizeComponent(componentBytes, opts);
  const { component, coreModules, optimizedCoreModules } = await optPromise;

  await writeFile(opts.output, component);

  if (!opts.quiet)
    console.log(c`
{bold Optimized WebAssembly Component Internal Core Modules:}

${table(coreModules.map(([s, e], i) => [
  c` - Core Module ${i + 1}: `,
  c`{black ${sizeStr(e - s)}}`,
  ' -> ',
  c`{cyan ${sizeStr(optimizedCoreModules[i].byteLength)}} `,
  c`{italic (${fixedDigitDisplay(optimizedCoreModules[i].byteLength / (e - s) * 100, 2)}%)}`
]), [,,,,'right'])}`);
}

/**
 * 
 * @param {Uint8Array} componentBytes 
 * @param {{ quiet: boolean, optArgs?: string[] }} options?
 * @returns {Promise<Uint8Array>}
 */
export async function optimizeComponent (componentBytes, opts) {
  await $init;
  const showSpinner = getShowSpinner();
  let spinner;
  try {
    const coreModules = extractCoreModules(componentBytes);

    let completed = 0;
    const spinnerText = () => c`{cyan ${completed} / ${coreModules.length}} Running Binaryen on WebAssembly Component Internal Core Modules \n`;
    if (showSpinner) {
      spinner = ora({
        color: 'cyan',
        spinner: 'bouncingBar'
      }).start();
      spinner.text = spinnerText();
    }

    const optimizedCoreModules = await Promise.all(coreModules.map(async ([coreModuleStart, coreModuleEnd]) => {
      const optimized = wasmOpt(componentBytes.subarray(coreModuleStart, coreModuleEnd), opts?.args);
      if (spinner) {
        completed++;
        spinner.text = spinnerText();
      }
      return optimized;
    }));

    let outComponentBytes = new Uint8Array(componentBytes.byteLength);
    let nextReadPos = 0, nextWritePos = 0;
    for (let i = 0; i < coreModules.length; i++) {
      const [coreModuleStart, coreModuleEnd] = coreModules[i];
      const optimizedCoreModule = optimizedCoreModules[i];

      let lebByteLen = 1;
      while (componentBytes[coreModuleStart - 1 - lebByteLen] & 0x80) lebByteLen++;

      // Write from the last read to the LEB byte start of the core module
      outComponentBytes.set(componentBytes.subarray(nextReadPos, coreModuleStart - lebByteLen), nextWritePos);
      nextWritePos += coreModuleStart - lebByteLen - nextReadPos;

      // Write the new LEB bytes
      let val = optimizedCoreModule.byteLength;
      do {
        const byte = val & 0x7F;
        val >>>= 7;
        outComponentBytes[nextWritePos++] = val === 0 ? byte : byte | 0x80;
      } while (val !== 0);

      // Write the core module
      outComponentBytes.set(optimizedCoreModule, nextWritePos);
      nextWritePos += optimizedCoreModule.byteLength;

      nextReadPos = coreModuleEnd;
    }

    outComponentBytes.set(componentBytes.subarray(nextReadPos, componentBytes.byteLength), nextWritePos);
    nextWritePos += componentBytes.byteLength - nextReadPos;
    nextReadPos += componentBytes.byteLength - nextReadPos;

    outComponentBytes = outComponentBytes.subarray(0, outComponentBytes.length + nextWritePos - nextReadPos);

    // verify it still parses ok
    try {
      await print(outComponentBytes);
    } catch (e) {
      throw new Error(`Internal error performing optimization.\n${e.message}`)
    }

    return outComponentBytes;
  }
  finally {
    if (spinner)
      spinner.stop();
  }
}

/**
 * @param {Uint8Array} source 
 * @returns {Promise<Uint8Array>}
 */
async function wasmOpt (source, args = ['-tnh', '--gufa', '--flatten', '--rereloop', '-Oz', '-Oz', '--low-memory-unused']) {
  try {
    return await spawnIOTmp(WASM_OPT, source, [
      ...args, '-o'
    ]);
  } catch (e) {
    if (e.toString().includes('BasicBlock requested'))
      return wasmOpt(source, args);
    throw e;
  }
}
