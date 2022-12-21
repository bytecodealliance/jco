export function opt(componentBytes: Uint8Array, opts?: { quiet: boolean; optArgs?: string[] }): Promise<{
  component: Uint8Array,
  compressionInfo: { beforeBytes: number, afterBytes: number }[]
}>;

export interface TranspileOpts {
  name?: string,
  instantiation?: bool,
  map?: Record<string, string>,
  validLiftingOptimization?: bool,
  compat?: bool,
  noNodejsCompat?: bool,
  tlaCompat?: bool,
  base64Cutoff?: number,
  asm?: bool,
  minify?: bool,
  optimize?: bool,
  optArgs?: string[],
}

export function transpile(component: Uint8Array, opts?: TranspileOpts): Promise<{ files, imports, exports }>;

export function parse(wat: string): Uint8Array;

export function print(binary: Uint8Array | ArrayBuffer): string;

export function componentNew(binary: Uint8Array | ArrayBuffer | null, opts: ComponentOpts | null): Uint8Array;

export function componentWit(binary: Uint8Array | ArrayBuffer): string;

export type StringEncoding = 'utf8' | 'utf16' | 'compact-utf16';

export interface ComponentOpts {
  wit?: string,
  typesOnly?: boolean,
  adapters?: [string, Uint8Array][],
  stringEncoding?: StringEncoding,
}

export const $init: Promise<void>;
