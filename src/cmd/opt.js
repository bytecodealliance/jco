import { $init, tools } from '../../obj/wasm-tools.js';
const { metadataShow, print } = tools;
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import c from 'chalk-template';
import { readFile, sizeStr, fixedDigitDisplay, table, spawnIOTmp, setShowSpinner, getShowSpinner } from '../common.js';
import ora from '#ora';

let WASM_OPT;
try {
  WASM_OPT = fileURLToPath(new URL('../../node_modules/binaryen/bin/wasm-opt', import.meta.url));
} catch (e) {
  WASM_OPT = new URL('../../node_modules/binaryen/bin/wasm-opt', import.meta.url);
}

export async function opt (componentPath, opts, program) {
  await $init;
  const varIdx = program.parent.rawArgs.indexOf('--');
  if (varIdx !== -1)
    opts.optArgs = program.parent.rawArgs.slice(varIdx + 1);
  const componentBytes = await readFile(componentPath);

  if (!opts.quiet) setShowSpinner(true);
  const optPromise = optimizeComponent(componentBytes, opts);
  const { component, compressionInfo } = await optPromise;

  await writeFile(opts.output, component);

  let totalBeforeBytes = 0, totalAfterBytes = 0;

  if (!opts.quiet)
    console.log(c`
{bold Optimized WebAssembly Component Internal Core Modules:}

${table([...compressionInfo.map(({ beforeBytes, afterBytes }, i) => {
  totalBeforeBytes += beforeBytes;
  totalAfterBytes += afterBytes;
  return [
    ` - Core Module ${i + 1}:  `,
    sizeStr(beforeBytes),
    ' -> ',
    c`{cyan ${sizeStr(afterBytes)}} `,
    `(${fixedDigitDisplay(afterBytes / beforeBytes * 100, 2)}%)`
  ];
}), ['', '', '', '', ''], [
  ` = Total:  `,
  `${sizeStr(totalBeforeBytes)}`,
  ` => `,
  c`{cyan ${sizeStr(totalAfterBytes)}} `,
  `(${fixedDigitDisplay(totalAfterBytes / totalBeforeBytes * 100, 2)}%)`
]], [,,,,'right'])}`);
}

/**
 * 
 * @param {Uint8Array} componentBytes 
 * @param {{ quiet: boolean, optArgs?: string[] }} options?
 * @returns {Promise<{ component: Uint8Array, compressionInfo: { beforeBytes: number, afterBytes: number }[] >}
 */
export async function optimizeComponent (componentBytes, opts) {
  await $init;
  const showSpinner = getShowSpinner();
  let spinner;
  try {
    const coreModules = metadataShow(componentBytes).slice(1, -1).map(({ range }) => range);

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
      const optimized = wasmOpt(componentBytes.subarray(coreModuleStart, coreModuleEnd), opts?.optArgs);
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

    return {
      component: outComponentBytes,
      compressionInfo: coreModules.map(([s, e], i) => ({ beforeBytes: e - s, afterBytes: optimizedCoreModules[i].byteLength }))
    };
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
async function wasmOpt (source, args = ['-O1', '--low-memory-unused', '--enable-bulk-memory']) {
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
