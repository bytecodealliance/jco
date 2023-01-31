import crypto from 'node:crypto';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { argv0 } from 'node:process';
import c from 'chalk-template';

let _showSpinner = false;
export function setShowSpinner (val) {
  _showSpinner = val;
}
export function getShowSpinner () {
  const showSpinner = _showSpinner;
  _showSpinner = false;
  return showSpinner;
}

export function sizeStr (num) {
  num /= 1024;
  if (num < 1000)
    return `${fixedDigitDisplay(num, 4)} KiB`;
  num /= 1024;
  if (num < 1000)
    return `${fixedDigitDisplay(num, 4)} MiB`;
}

export function fixedDigitDisplay (num, maxChars) {
  const significantDigits = String(num).split('.')[0].length;
  let str;
  if (significantDigits >= maxChars - 1) {
    str = String(Math.round(num));
  } else {
    const decimalPlaces = maxChars - significantDigits - 1;
    const rounding = 10 ** decimalPlaces;
    str = String(Math.round(num * rounding) / rounding);
  }
  if (maxChars - str.length < 0)
    return str;
  return ' '.repeat(maxChars - str.length) + str;
}

export function table (data, align = []) {
  if (data.length === 0) return '';
  const colLens = data.reduce((maxLens, cur) => maxLens.map((len, i) => Math.max(len, cur[i].length)), data[0].map(cell => cell.length));
  let outTable = '';
  for (const row of data) {
    for (const [i, cell] of row.entries()) {
      if (align[i] === 'right')
        outTable += ' '.repeat(colLens[i] - cell.length) + cell;
      else
        outTable += cell + ' '.repeat(colLens[i] - cell.length);
    }
    outTable += '\n';
  }
  return outTable;
}

export function getTmpFile (source, ext) {
  return resolve(tmpdir(), crypto.createHash('sha256').update(source).update(Math.random().toString()).digest('hex') + ext);
}

async function readFileCli (file, encoding) {
  try {
    return await readFile(file, encoding)
  }
  catch (e) {
    throw c`Unable to read file {bold ${file}}`;
  }
}
export { readFileCli as readFile }

export async function spawnIOTmp (cmd, input, args) {
  const inFile = getTmpFile(input, '.wasm');
  let outFile = getTmpFile(inFile, '.wasm');

  await writeFile(inFile, input);

  const cp = spawn(argv0, [cmd, inFile, ...args, outFile], { stdio: 'pipe' });

  let stderr = '';
  const p = new Promise((resolve, reject) => {
    cp.stderr.on('data', data => stderr += data.toString());
    cp.on('error', e => {
      reject(e);
    });
    cp.on('exit', code => {
      if (code === 0)
        resolve();
      else
        reject(stderr);
    });
  });

  try {
    await p;
    var output = await readFile(outFile);
    await Promise.all([unlink(inFile), unlink(outFile)]); 
    return output;
  } catch (e) {
    await unlink(inFile);
    throw e;
  }
}
