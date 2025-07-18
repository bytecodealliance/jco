export function setShowSpinner(val: any): void;
export function getShowSpinner(): boolean;
export function sizeStr(num: any): string;
export function fixedDigitDisplay(num: any, maxChars: any): string;
export function table(data: any, align?: any[]): string;
/**
 * Securely creates a temporary directory and returns its path.
 *
 * The new directory is created using `fsPromises.mkdtemp()`.
 */
export function getTmpDir(): Promise<string>;
export function spawnIOTmp(cmd: any, input: any, args: any): Promise<Buffer<ArrayBufferLike>>;
export function writeFiles(files: any, summaryTitle: any): Promise<void>;
export const isWindows: boolean;
export const ASYNC_WASI_IMPORTS: string[];
export const ASYNC_WASI_EXPORTS: string[];
export { readFileCli as readFile };
declare function readFileCli(file: any, encoding: any): Promise<Buffer<ArrayBufferLike>>;
//# sourceMappingURL=common.d.ts.map