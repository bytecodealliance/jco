import { isBuiltin } from "./builtins.js";
import { moduleNotFound, unsupported } from "./errors.js";

/** The `require` function `createRequire` hands back. */
export interface NodeRequire {
  (specifier: string): unknown;
  resolve: RequireResolve;
  cache: Record<string, unknown>;
  extensions: Record<string, unknown>;
  main: undefined;
}

interface RequireResolve {
  (specifier: string): string;
  paths(specifier: string): string[] | null;
}

/**
 * Node's `module.createRequire(filename)`.
 *
 * This **succeeds**, deliberately. Code routinely writes
 * `const require = createRequire(import.meta.url)` at module top level and only calls it on some
 * paths; refusing at creation would break modules that never require anything. The refusal belongs
 * to the call that actually needs a loader.
 *
 * @param filename - the path or URL to resolve against, as Node takes it
 */
export function createRequire(filename: string | URL): NodeRequire {
  void filename;

  const require = ((specifier: string): unknown => {
    throw unsupported(
      `require(${JSON.stringify(specifier)})`,
      "Use a static `import` instead, which the bundler can resolve at build time",
    );
  }) as NodeRequire;

  /**
   * `require.resolve` is not a refusal.
   *
   * For a builtin it answers exactly as Node does, returning the specifier in the form it was
   * given. For anything else it reports `MODULE_NOT_FOUND` -- which is the truth here, not a
   * stand-in for one: nothing else exists to resolve to.
   */
  const resolve = ((specifier: string): string => {
    if (isBuiltin(specifier)) {
      return specifier;
    }
    throw moduleNotFound(specifier);
  }) as RequireResolve;

  // Node returns null for a builtin and a search-path list otherwise; there are no search paths.
  resolve.paths = (specifier: string): string[] | null => (isBuiltin(specifier) ? null : []);

  require.resolve = resolve;
  // Genuinely empty rather than withheld: nothing can be loaded, so nothing is cached.
  require.cache = Object.create(null) as Record<string, unknown>;
  require.extensions = Object.create(null) as Record<string, unknown>;
  // No entry module owns a component the way a CJS main module owns a Node process.
  require.main = undefined;
  return require;
}
