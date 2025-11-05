import { join, normalize, resolve, sep, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
    readFile as fsReadFile,
    writeFile,
    rm,
    mkdtemp,
    mkdir,
} from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { platform, argv0 } from 'node:process';
import * as nodeUtils from 'node:util';
import { AsyncMode, WITAsyncMode } from './transpile.js';

/** Detect a windows environment */
export const isWindows = platform === 'win32';

/** Default number of significant figures to use */
const DEFAULT_SIGNIFICANT_DIGITS = 4;

/** Nubmer of bytes in a kilobyte */
const BYTES_MAGNITUDE = 1024;

/** Bytes for files that have been produced, indexed by path */
export type FileBytes = Record<string, Uint8Array>;

/** Options for `sizeStr()` */
interface SizeStrOptions {
    significantDigits?: number;
}

/**
 * Convert a given number into the string that would appropriately represent it,
 * in either KiB or MiB.
 *
 * @param num - number to convert
 * @param opts - Options for printing
 */
export function sizeStr(num: number, opts: SizeStrOptions): string {
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
 * @param num - number to display
 * @param maxChars - character limit
 * @returns The number, displayed
 */
export function fixedDigitDisplay(num: number, maxChars: number): string {
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
 * @param data - row-major array of data
 * @param align - preferred alignment of cells
 * @returns Tabulated data
 */
export function table(data: string[][], cellAlignment: string[] = []) {
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
 * @returns A `Promise` that resolves to the created temporary directory
 */
export async function getTmpDir(): Promise<string> {
    return await mkdtemp(normalize(tmpdir() + sep));
}

/**
 * Read a file, throwing and error when a file coudl not be read
 *
 * @param file - path to a file to read
 * @param encoding - file encoding
 */
export async function readFile(file: string, encoding?: BufferEncoding): Promise<Uint8Array | string> {
    try {
        return await fsReadFile(file, { encoding });
    } catch {
        throw `Unable to read file ${styleText('bold', file)}`;
    }
}

/**
 * Spawn an command that modified a WebAssembly component as a subprocess,
 * with a temporary (scratch) directory for performing work in.
 *
 * @param cmd - the command to run
 * @param input - wasm input to write to a temporary input file
 * @param args
 * @returns {Promise<Buffer>} A `Promise` that resolves to the wasm binary contents
 */
export async function runWASMTransformProgram(cmd: string, input: Uint8Array, args: string[]): Promise<Uint8Array | null> {
    const tmpDir = await getTmpDir();
    try {
        const inFile = resolve(tmpDir, 'in.wasm');
        const outFile = resolve(tmpDir, 'out.wasm');

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
                    resolve(null);
                } else {
                    reject(stderr);
                }
            });
        });

        await p;
        const output = await fsReadFile(outFile);
        return output;
    } finally {
        await rm(tmpDir, { recursive: true });
    }
}

/**
 * Counts the byte length for the LEB128 encoding of a number.
 *
 * @param val
 * @returns
 */
export function byteLengthLEB128(val: number): number {
    let len = 0;
    do {
        val >>>= 7;
        len++;
    } while (val !== 0);
    return len;
}

/** Partial polyfill for 'node:util' `styleText()` */
export function styleText(...args: Parameters<typeof nodeUtils.styleText>) {
    if (nodeUtils.styleText) {
        return nodeUtils.styleText(...args);
    }
    return args[1];
}

interface AsyncOptionsLike {
    asyncMode?: AsyncMode;
    asyncImports?: string[];
    asyncExports?: string[];
}

/** Extract a WIT enum for async mode from a given set of async options */
export function extractWITAsyncModeFromOpts(opts: AsyncOptionsLike): WITAsyncMode {
    if (opts.asyncMode === undefined || opts.asyncMode === 'sync') {
        return { tag: 'sync' };
    }
    return {
        tag: opts.asyncMode,
        val: {
            imports: opts.asyncImports || [],
            exports: opts.asyncExports || [],
        },
    };
}

/** Options for `writeFiles()` utility function */
interface WriteFileOpts {
    /** Change (prepend) the base directory before writing each file */
    baseDir?: string;
}

/** Utility function for easily writing output files packaged as `FileBytes` to a directory */
export async function writeFiles(files: FileBytes, opts?: WriteFileOpts): Promise<void> {
    await Promise.all(
        Object.entries(files).map(async ([filePath, contents]) => {
            if (opts?.baseDir) {
                filePath = join(opts.baseDir, filePath);
            }
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, contents);
        })
    );
}
