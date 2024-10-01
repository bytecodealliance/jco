import { $init, generateTypescriptStubs} from '../../obj/js-component-bindgen-component.js';
import { resolve } from 'node:path';
import { platform } from 'node:process';
import { writeFiles } from '../common.js'

const isWindows = platform === 'win32';

export async function stubgen (witPath, opts) {
  const files = await stubgenWit(witPath, opts);
  await writeFiles(files, opts.quiet ? false : 'Generated Typescript Files');
}

/**
 * @param {string} witPath
 * @param {{
 *   worldName?: string,
 *   outDir?: string,
 * }} opts
 * @returns {Promise<{ [filename: string]: Uint8Array }>}
 */
async function stubgenWit (witPath, opts) {
  await $init;
  let outDir = (opts.outDir ?? '').replace(/\\/g, '/');
  if (!outDir.endsWith('/') && outDir !== '')
    outDir += '/';
  return Object.fromEntries(generateTypescriptStubs({
    wit: { tag: 'path', val: (isWindows ? '//?/' : '') + resolve(witPath) },
    world: opts.worldName
  }).map(([name, file]) => [`${outDir}${name}`, file]));
}