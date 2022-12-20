export function opt(
  componentBytes: Uint8Array,
  opts?: { quiet: boolean; optArgs?: string[] }
): Promise<{
  component: Uint8Array;
  coreModules: any;
  optimizedCoreModules: Uint8Array[];
}>;

// TODO:
// export function transpile();

// export function parse();
// export function print();
// export function componentNew();
// export function componentWit();
