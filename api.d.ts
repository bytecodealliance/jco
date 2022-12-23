/**
 * Optimize a Component with Binaryen wasm-opt optimizations
 */
export function opt(componentBytes: Uint8Array, opts?: { quiet: boolean; optArgs?: string[] }): Promise<{
  component: Uint8Array,
  compressionInfo: { beforeBytes: number, afterBytes: number }[]
}>;

export interface TranspileOpts {
  /// name for the generated JS file.
  name?: string,
  /// instead of a direct ES module, output the raw 
  /// instantiation function for custom virtualization.
  instantiation?: boolean,
  /// remap Component imports
  map?: Record<string, string>,
  /// optimization to reduce code size
  validLiftingOptimization?: boolean,
  /// disables Node.js compatible output
  noNodejsCompat?: boolean,
  /// enable compat in JS runtimes without TLA support
  tlaCompat?: boolean,
  /// size in bytes, under which Wasm modules get inlined as base64.
  base64Cutoff?: number,
  /// use asm.js instead of core WebAssembly for execution.
  asm?: boolean,
  /// minify the output JS.
  minify?: boolean,
  /// optimize the Component with Binaryen wasm-opt first.
  optimize?: boolean,
  /// if using optimize, custom optimization options
  /// (defaults to best optimization, but this is very slow)
  optArgs?: string[],
}

/**
 * Transpile a Component into a JS-executable package
 */
export function transpile(component: Uint8Array, opts?: TranspileOpts): Promise<{ files, imports, exports }>;

/**
 * Parse a WAT string into a Wasm binary
 */
export function parse(wat: string): Uint8Array;

/**
 * Print a Wasm binary as a WAT string
 */
export function print(binary: Uint8Array | ArrayBuffer): string;

/**
 * WIT Component - create a Component from a Wasm core binary
 */
export function componentNew(binary: Uint8Array | ArrayBuffer | null, opts: ComponentOpts | null): Uint8Array;

/**
 * Extract the WIT world from a Wasm Component
 */
export function componentWit(binary: Uint8Array | ArrayBuffer): string;

export type StringEncoding = 'utf8' | 'utf16' | 'compact-utf16';

export interface ComponentOpts {
  /// wit world for the Component
  /// (only needed if not provided in the Component itself,
  /// which it usually is)
  wit?: string,
  /// create a type only Component shell, without implementations
  typesOnly?: boolean,
  /// adapters to use
  adapters?: [string, Uint8Array][],
  /// string encoding used by the Component (this should
  /// also be picked up from the Component itself)
  stringEncoding?: StringEncoding,
}

export const $init: Promise<void>;
