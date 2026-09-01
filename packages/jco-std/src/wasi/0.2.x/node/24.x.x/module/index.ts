import { builtinModules, isBuiltin } from "./builtins.js";
import { unsupported } from "./errors.js";
import { Module } from "./module-class.js";
import { createRequire } from "./require.js";
import { SourceMap } from "./source-map.js";

export { builtinModules, isBuiltin } from "./builtins.js";
export { UNSUPPORTED_CODE, unsupported } from "./errors.js";
export { Module } from "./module-class.js";
export { createRequire } from "./require.js";
export { SourceMap } from "./source-map.js";
export type { NodeRequire } from "./require.js";
export type { SourceMapEntry, SourceMapOrigin, SourceMapPayload } from "./source-map.js";

/**
 * Node's `module.constants`.
 *
 * Null-prototype, as Node's is. That is observable -- `assert.deepStrictEqual` compares prototypes
 * -- so a plain object literal here would be a visible difference.
 */
export const constants = Object.freeze(
  Object.assign(Object.create(null) as Record<string, unknown>, {
    compileCacheStatus: Object.freeze(
      Object.assign(Object.create(null) as Record<string, number>, {
        FAILED: 0,
        ENABLED: 1,
        ALREADY_ENABLED: 2,
        DISABLED: 3,
      }),
    ),
  }),
) as {
  compileCacheStatus: {
    FAILED: number;
    ENABLED: number;
    ALREADY_ENABLED: number;
    DISABLED: number;
  };
};

/**
 * Node's `module.globalPaths`.
 *
 * Empty, and that is a true statement rather than a refusal: a component has no `$HOME/.node_modules`
 * and no installation `lib/node` to search.
 */
export const globalPaths: readonly string[] = Object.freeze([]);

/**
 * Node's `module.findSourceMap(path)`.
 *
 * Always `undefined` -- which is exactly what Node returns for a file with no registered source
 * map. Nothing can register one here, so the answer is honest rather than a stub.
 */
export function findSourceMap(path: string): undefined {
  void path;
  return undefined;
}

/**
 * Node's `module.getSourceMapsSupport()`.
 *
 * All false, accurately: the engine applies no source maps to stack traces here.
 */
export function getSourceMapsSupport(): {
  enabled: boolean;
  nodeModules: boolean;
  generatedCode: boolean;
} {
  // Null-prototype, as Node's is; the difference is observable to `assert.deepStrictEqual`.
  return Object.assign(Object.create(null) as Record<string, boolean>, {
    enabled: false,
    nodeModules: false,
    generatedCode: false,
  });
}

/**
 * Node's `module.setSourceMapsSupport(enabled, options)`.
 *
 * Refused rather than accepted-and-ignored: it asks the runtime to rewrite stack traces, and
 * silently not doing that would leave a caller believing traces are mapped when they are not.
 */
export function setSourceMapsSupport(enabled: boolean, options?: unknown): void {
  void enabled;
  void options;
  throw unsupported(
    "module.setSourceMapsSupport()",
    "Source maps are not applied to stack traces in a component",
  );
}

/**
 * Node's `module.enableCompileCache()`.
 *
 * Reports failure through Node's own status protocol instead of throwing, so callers that branch on
 * `status` keep working. There is no V8 compile cache and no filesystem to hold one.
 */
export function enableCompileCache(cacheDir?: string): { status: number; message: string } {
  void cacheDir;
  return {
    status: constants.compileCacheStatus.FAILED,
    message: "the compile cache needs a filesystem, which a component does not have",
  };
}

/**
 * Node's `module.getCompileCacheDir()`.
 *
 * `undefined`, as Node returns when the cache was never enabled.
 */
export function getCompileCacheDir(): undefined {
  return undefined;
}

/**
 * Node's `module.flushCompileCache()`.
 *
 * A no-op, as Node documents when the cache is not enabled.
 */
export function flushCompileCache(): void {}

/**
 * Node's `module.syncBuiltinESMExports()`.
 *
 * A no-op. It exists to push mutations of CJS builtin exports into their ESM bindings; nothing here
 * can mutate a builtin, so there is nothing to flush.
 */
export function syncBuiltinESMExports(): void {}

/**
 * Node's `module.wrapper`: the two halves of the CJS function wrapper.
 *
 * Deprecated upstream, and pure string data -- no loader involved -- so it is real rather than
 * refused. Mutable, and `wrap` reads it live, which is the behaviour Node has and which code that
 * pokes at it depends on.
 */
export const wrapper: string[] = [
  "(function (exports, require, module, __filename, __dirname) { ",
  "\n});",
];

/**
 * Node's `module.wrap(script)`.
 *
 * Deprecated upstream, and pure concatenation. It only builds the wrapper text; nothing here
 * compiles or runs the result, so it works exactly as it does on Node.
 *
 * @param script - the source to wrap
 */
export function wrap(script: string): string {
  return `${wrapper[0]}${script}${wrapper[1]}`;
}

/** Build an entry point that refuses, for the half of this module that needs a loader. */
function refusing<T extends (...args: never[]) => unknown>(api: string, instead?: string): T {
  return ((): never => {
    throw unsupported(api, instead);
  }) as unknown as T;
}

const STATIC_IMPORT = "Use a static `import` instead, which the bundler can resolve at build time";

export const register = refusing<
  (specifier: string | URL, parentURL?: string | URL, options?: unknown) => void
>("module.register()", "Loader hooks run inside a module loader, and there is none");
export const registerHooks = refusing<(hooks: unknown) => unknown>(
  "module.registerHooks()",
  "Loader hooks run inside a module loader, and there is none",
);
export const runMain = refusing<(main?: string) => void>("module.runMain()");
export const findPackageJSON = refusing<
  (specifier: string | URL, base?: string | URL) => string | undefined
>("module.findPackageJSON()", "It reads package.json from disk, and a component has no filesystem");
export const stripTypeScriptTypes = refusing<(code: string, options?: unknown) => string>(
  "module.stripTypeScriptTypes()",
  "It needs Node's TypeScript parser, which is not bundled into a component",
);

/**
 * The CJS loader internals.
 *
 * Node marks these private and mostly deprecated, but real code reaches for them, so they exist and
 * explain themselves rather than being absent. Every one is part of resolving or loading a file.
 */
export const _cache: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
export const _pathCache: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
export const _extensions: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
export const _debug = refusing<() => void>("module._debug()");
export const _findPath =
  refusing<(request: string, paths: string[], isMain: boolean) => string | false>(
    "module._findPath()",
  );
export const _initPaths = refusing<() => void>("module._initPaths()");
export const _load = refusing<(request: string, parent: unknown, isMain: boolean) => unknown>(
  "module._load()",
  STATIC_IMPORT,
);
export const _nodeModulePaths = refusing<(from: string) => string[]>("module._nodeModulePaths()");
export const _preloadModules = refusing<(requests: string[]) => void>("module._preloadModules()");
export const _readPackage = refusing<(path: string) => unknown>("module._readPackage()");
export const _resolveFilename = refusing<
  (request: string, parent: unknown, isMain: boolean, options?: unknown) => string
>("module._resolveFilename()");
export const _resolveLookupPaths = refusing<(request: string, parent: unknown) => string[] | null>(
  "module._resolveLookupPaths()",
);
export const _stat = refusing<(path: string) => number>("module._stat()");

/**
 * The module object, matching what `require("node:module")` yields.
 *
 * Node's module object **is** the `Module` class, so the surface is hung off it as statics and
 * `module === module.Module` holds. Defined rather than assigned: a class has non-writable
 * `name` and `length`, and `Module` itself must point back at the class.
 */
const moduleSurface = {
  Module,
  SourceMap,
  _cache,
  _debug,
  _extensions,
  _findPath,
  _initPaths,
  _load,
  _nodeModulePaths,
  _pathCache,
  _preloadModules,
  _readPackage,
  _resolveFilename,
  _resolveLookupPaths,
  _stat,
  builtinModules,
  constants,
  createRequire,
  enableCompileCache,
  findPackageJSON,
  findSourceMap,
  flushCompileCache,
  getCompileCacheDir,
  getSourceMapsSupport,
  globalPaths,
  isBuiltin,
  register,
  registerHooks,
  runMain,
  setSourceMapsSupport,
  stripTypeScriptTypes,
  syncBuiltinESMExports,
  wrap,
  wrapper,
};

for (const [name, value] of Object.entries(moduleSurface)) {
  Object.defineProperty(Module, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

export default Module as typeof Module & typeof moduleSurface;
