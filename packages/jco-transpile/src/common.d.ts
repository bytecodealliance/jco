import { FileHandle } from 'node:fs/promises';
/** Detect a windows environment */
export declare const isWindows: boolean;
export type FileBytes = Record<string, Uint8Array>;
export interface SizeStrOptions {
    significantDigits?: number;
}
/**
 * Convert a given number into the string that would appropriately represent it,
 * in either KiB or MiB.
 *
 * @param {number} num
 */
export declare function sizeStr(num: number, opts?: SizeStrOptions): string;
/**
 * Display a given number with a fixed number of digits
 *
 * @param {number} num - number to display
 * @param {number} maxChars - character limit
 * @returns {string} The number, displayed
 */
export declare function fixedDigitDisplay(num: number, maxChars: number): string;
/**
 * Tabulate an array of data for display as a table
 *
 * @param {any[][]} data - row-major array of data
 * @param {string[]} align - preferred alignment of cells
 * @returns {string} Tabulated data
 */
export declare function table(data: any[][], cellAlignment?: string[]): string;
/**
 * Securely creates a temporary directory and returns its path.
 *
 * The new directory is created using `fsPromises.mkdtemp()`.
 *
 * @return {Promise<string>} A Promise that resolves to the created temporary directory
 */
export declare function getTmpDir(): Promise<string>;
/**
 * Read a file, throwing and error when a file could not be read
 *
 * @param {string} file - file to read
 * @param {string} encoding - encoding of the file
 */
export declare function readFile(file: string | Buffer | URL | FileHandle, encoding?: BufferEncoding): Promise<Buffer | string>;
/**
 * Spawn an command that modified a WebAssembly component as a subprocess,
 * with a temporary (scratch) directory for performing work in.
 *
 * @param {string} cmd - the command to run
 * @param {string} input - wasm input to write to a temporary input file
 * @param {string[]} args
 */
export declare function runWASMTransformProgram(cmd: string, input: Uint8Array, args: string[]): Promise<Buffer>;
/**
 * Counts the byte length for the LEB128 encoding of a number.
 *
 * @param {number} val
 * @returns {number}
 */
export declare function byteLengthLEB128(val: number): number;
