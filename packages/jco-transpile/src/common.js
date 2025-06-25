import { normalize, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
    readFile as fsReadFile,
    writeFile,
    rm,
    mkdtemp,
} from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { platform, argv0 } from 'node:process';

import c from 'chalk-template';

/** Detect a windows environment */
export const isWindows = platform === 'win32';

/** Default number of significant figures to use */
const DEFAULT_SIGNIFICANT_DIGITS = 4;

/** Nubmer of bytes in a kilobyte */
const BYTES_MAGNITUDE = 1024;

/**
 * Convert a given number into the string that would appropriately represent it,
 * in either KiB or MiB.
 *
 * @param {number} num
 */
export function sizeStr(num, opts) {
    const significantDigits =
        opts?.significantDigits ?? DEFAULT_SIGNIFICANT_DIGITS;
    num /= BYTES_MAGNITUDE;
    if (num < 1000) {
        return `${fixedDigitDisplay(num, significantDigits)} KiB`;
    }
    num /= BYTES_MAGNITUDE;
    if (num < 1000) {
        return `${fixedDigitDisplay(num, significantDigits)} MiB`;
    }
    num /= BYTES_MAGNITUDE;
    if (num < 1000) {
        return `${fixedDigitDisplay(num, significantDigits)} GiB`;
    }
    throw new Error(
        'unexpected magnitude while sizing string, greater than 1000 GiB'
    );
}

/**
 * Display a given number with a fixed number of digits
 *
 * @param {number} num - number to display
 * @param {number} maxChars - character limit
 * @returns {string} The number, displayed
 */
export function fixedDigitDisplay(num, maxChars) {
    const significantDigits = String(num).split('.')[0].length;
    let str;
    if (significantDigits >= maxChars - 1) {
        str = String(Math.round(num));
    } else {
        const decimalPlaces = maxChars - significantDigits - 1;
        const rounding = 10 ** decimalPlaces;
        str = String(Math.round(num * rounding) / rounding);
    }
    if (maxChars - str.length < 0) {
        return str;
    }
    return ' '.repeat(maxChars - str.length) + str;
}

/**
 * Tabulate an array of data for display as a table
 *
 * @param {any[][]} data - row-major array of data
 * @param {string[]} align - preferred alignment of cells
 * @returns {string} Tabulated data
 */
export function table(data, cellAlignment = []) {
    if (data.length === 0) {
        return '';
    }
    const colLens = data.reduce(
        (maxLens, cur) => maxLens.map((len, i) => Math.max(len, cur[i].length)),
        data[0].map((cell) => cell.length)
    );
    let outTable = '';
    for (const row of data) {
        for (const [i, cell] of row.entries()) {
            const prefix = ' '.repeat(colLens[i] - cell.length);
            if (cellAlignment[i] === 'right') {
                outTable += prefix + cell;
            } else {
                outTable += cell + prefix;
            }
        }
        outTable += '\n';
    }
    return outTable;
}

/**
 * Securely creates a temporary directory and returns its path.
 *
 * The new directory is created using `fsPromises.mkdtemp()`.
 *
 * @return {Promise<string>} A Promise that resolves to the created temporary directory
 */
export async function getTmpDir() {
    return await mkdtemp(normalize(tmpdir() + sep));
}

/**
 * Read a file, throwing and error when a file coudl not be read
 *
 * @param {string} file - file to read
 * @param {string} encoding - encoding of the file
 */
export async function readFile(file, encoding) {
    try {
        return await fsReadFile(file, encoding);
    } catch {
        throw c`Unable to read file {bold ${file}}`;
    }
}

/**
 * Spawn an command that modified a WebAssembly component as a subprocess,
 * with a temporary (scratch) directory for performing work in.
 *
 * @param {string} cmd - the command to run
 * @param {string} input - wasm input to write to a temporary input file
 * @param {string[]} args
 */
export async function runWASMTransformProgram(cmd, input, args) {
    const tmpDir = await getTmpDir();
    try {
        const inFile = resolve(tmpDir, 'in.wasm');
        let outFile = resolve(tmpDir, 'out.wasm');

        await writeFile(inFile, input);

        const cp = spawn(argv0, [cmd, inFile, ...args, outFile], {
            stdio: 'pipe',
        });

        let stderr = '';
        const p = new Promise((resolve, reject) => {
            cp.stderr.on('data', (data) => (stderr += data.toString()));
            cp.on('error', (e) => {
                reject(e);
            });
            cp.on('exit', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(stderr);
                }
            });
        });

        await p;
        var output = await fsReadFile(outFile);
        return output;
    } finally {
        await rm(tmpDir, { recursive: true });
    }
}

/**
 * Counts the byte length for the LEB128 encoding of a number.
 *
 * @param {number} val
 * @returns {number}
 */
export function byteLengthLEB128(val) {
    let len = 0;
    do {
        val >>>= 7;
        len++;
    } while (val !== 0);
    return len;
}
