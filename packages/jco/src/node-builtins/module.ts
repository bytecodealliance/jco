import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";

const MODULE_SPECIFIER = "node:module";

/**
 * Source of the `node:module` adapter.
 *
 * Capability-free: what this module can do here is classification and source-map arithmetic, and
 * what it cannot do -- loading -- no host could supply, because the missing piece is the guest
 * engine's ability to instantiate code that was not bundled.
 */
function moduleAdapter(moduleModule: string): string {
    return `
import nodeModule from ${JSON.stringify(moduleModule)};
export default nodeModule;
export {
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
} from ${JSON.stringify(moduleModule)};
`;
}

export function createModuleBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(MODULE_SPECIFIER, () => moduleAdapter(stdModule(options.moduleModule, "module")));
}
