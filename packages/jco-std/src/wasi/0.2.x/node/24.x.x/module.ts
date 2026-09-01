/**
 * `node:module`, which is two halves.
 *
 * The half that classifies, computes and reports state is implemented in full: `builtinModules`,
 * `isBuiltin`, `constants`, `globalPaths`, the whole `SourceMap` class, `findSourceMap`,
 * `getSourceMapsSupport`, the compile-cache trio and `syncBuiltinESMExports`. None of it needs a
 * host, a filesystem, or a loader.
 *
 * The half that **loads** cannot exist here, and not for want of effort. `jco componentize` bundles
 * the whole module graph ahead of time, and StarlingMonkey cannot compile or link a module that was
 * not present at build time -- there is no `dlopen`, no filesystem, and no loader to hook. No host
 * capability would fix it either: the missing piece is the guest engine's ability to instantiate new
 * code. So `register`, `registerHooks`, `runMain`, `findPackageJSON`, `stripTypeScriptTypes`, every
 * `_*` loader internal, and `Module.prototype.require`/`load`/`_compile` all throw
 * `ERR_JCO_UNSUPPORTED_NODE_API` and say so.
 *
 * Two deliberate middles:
 *
 * - `createRequire()` **succeeds** and hands back a correctly shaped `require`. Code writes
 *   `const require = createRequire(import.meta.url)` at module top level and often never calls it;
 *   refusing at creation would break modules that require nothing. Calling it refuses, but
 *   `require.resolve` answers truthfully -- the specifier for a builtin, `MODULE_NOT_FOUND`
 *   otherwise, which is the honest answer rather than a stand-in for one.
 * - `new Module(id)` constructs, matching Node's own-property shape. It is cheap and harmless, and
 *   code builds these for bookkeeping. Its methods are where the loader is needed, so that is where
 *   the refusal lives.
 *
 * Like `node:events`, Node's module object *is* the `Module` class, so `module === module.Module`
 * holds here too.
 */

export {
  Module,
  SourceMap,
  UNSUPPORTED_CODE,
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
  unsupported,
  wrap,
  wrapper,
} from "./module/index.js";

export type {
  NodeRequire,
  SourceMapEntry,
  SourceMapOrigin,
  SourceMapPayload,
} from "./module/index.js";

export { default } from "./module/index.js";
