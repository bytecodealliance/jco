export function setShowSpinner(val: boolean): void;
export function getShowSpinner(): boolean;

interface SizeStrOpts {
    significantDigits?: number;
}
export function sizeStr(num: any, opts?: SizeStrOpts): string;

export function fixedDigitDisplay(num: number, maxChars: number): string;

type CellAlignment = 'left' | 'right';
export function table(data: any[][], cellAlignment?: CellAlignment[]): string;

export function getTmpDir(): Promise<string>;

export function spawnIOTmp(
    cmd: any,
    input: any,
    args: any
): Promise<Buffer<ArrayBufferLike>>;

export const isWindows: boolean;

export function readFile(
    file: string,
    encoding: string
): Promise<Buffer<ArrayBufferLike>>;

export function spawnIOTmp(
    cmd: string,
    input: Buffer | string | any,
    args: string[]
): Promise<void>;

export function byteLengthLEB128(val: number): number;

/** Bytes that belong in one or more files */
type FileBytes = {
    [filename: string]: Uint8Array;
};

//# sourceMappingURL=common.d.ts.map
