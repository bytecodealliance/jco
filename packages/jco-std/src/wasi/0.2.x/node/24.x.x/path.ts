import { createPathImplementation } from "./path/implementation.js";

export type InitialCwd = () => string | undefined;
export type GetEnvironment = () => Array<[string, string]>;

export interface PathProviders {
  initialCwd: InitialCwd;
  getEnvironment: GetEnvironment;
}

export interface ParsedPath {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
}

export interface FormatInputPathObject {
  root?: string;
  dir?: string;
  base?: string;
  ext?: string;
  name?: string;
}

export interface PathModule {
  resolve(...paths: string[]): string;
  normalize(path: string): string;
  isAbsolute(path: string): boolean;
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  toNamespacedPath(path: string): string;
  dirname(path: string): string;
  basename(path: string, suffix?: string): string;
  extname(path: string): string;
  format(pathObject: FormatInputPathObject): string;
  parse(path: string): ParsedPath;
  matchesGlob(path: string, pattern: string): boolean;
  readonly sep: "/" | "\\";
  readonly delimiter: ":" | ";";
  readonly posix: PathModule;
  readonly win32: PathModule;
  /** Legacy internal alias retained by Node for compatibility. */
  _makeLong(path: string): string;
}

/** Build Node's POSIX-default path namespaces over explicit WASI providers. */
export function createPath(providers: PathProviders): PathModule {
  if (
    !providers ||
    typeof providers.initialCwd !== "function" ||
    typeof providers.getEnvironment !== "function"
  ) {
    throw new TypeError("createPath requires initialCwd and getEnvironment providers");
  }
  return createPathImplementation(providers);
}
