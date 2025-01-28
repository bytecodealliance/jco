import { $init, tools } from '../../obj/wasm-tools.js';
const { metadataShow, print } = tools;
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import c from 'chalk-template';
import { readFile, sizeStr, fixedDigitDisplay, table, spawnIOTmp, setShowSpinner, getShowSpinner } from '../common.js';
import ora from '#ora';

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
 * @param {{ quiet: boolean, asyncMode?: string, optArgs?: string[] }} opts?
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

    const args = opts?.optArgs ? [...opts.optArgs] : ['-Oz', '--low-memory-unused', '--enable-bulk-memory', '--strip-debug'];
    if (opts?.asyncMode === 'asyncify') args.push('--asyncify');

    const optimizedCoreModules = await Promise.all(coreModules.map(async ([coreModuleStart, coreModuleEnd]) => {
      const optimized = wasmOpt(componentBytes.subarray(coreModuleStart, coreModuleEnd), args);
      if (spinner) {
        completed++;
        spinner.text = spinnerText();
      }
      return optimized;
    }));

    // With the optional asyncify pass, the size may increase rather than shrink
    const previousModulesTotalSize = coreModules.reduce((total, [coreModuleStart, coreModuleEnd]) => total + (coreModuleEnd - coreModuleStart), 0);
    const optimizedModulesTotalSize = optimizedCoreModules.reduce((total, buf) => total + buf.byteLength, 0);
    const sizeChange = optimizedModulesTotalSize - previousModulesTotalSize;

    // Adds an extra 100 bytes to be safe. Sometimes an extra byte appears to be required.
    let outComponentBytes = new Uint8Array(componentBytes.byteLength + sizeChange + 100);
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

    outComponentBytes.set(componentBytes.subarray(nextReadPos), nextWritePos);
    nextWritePos += componentBytes.byteLength - nextReadPos;

    // truncate to the bytes written
    outComponentBytes = outComponentBytes.subarray(0, nextWritePos);

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
 * @param {Array<string>} args
 * @returns {Promise<Uint8Array>}
 */
async function wasmOpt(source, args) {
  const wasmOptPath = fileURLToPath(import.meta.resolve('binaryen/bin/wasm-opt'));

  try {
    return await spawnIOTmp(wasmOptPath, source, [
      ...args, '-o'
    ]);
  } catch (e) {
    if (e.toString().includes('BasicBlock requested'))
      return wasmOpt(source, args);
    throw e;
  }
}
