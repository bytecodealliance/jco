/**
 * This interface abstracts over different versions of `wasi:config`, normally
 * in the 0.2.x range, but meant to be used across ranges (0.3.x and beyond).
 *
 * By amalgamating the interfaces here, we can build a common abstraction over them.
 */
export type WASICLIEnvironmentLike = WasiCliEnvironment02xLike;

/** Similar to `wasi:cli/environment@0.2.x` */
export interface WasiCliEnvironment02xLike {
  getEnvironment: () => Array<[string, string]>;
  getArguments: () => Array<string>;
  initialCwd: () => string | undefined;
}

/**
 * Helper for working with ENV via WASI
 *
 * This interface is ideally used by other pieces of a framework
 * or library to interact with environment in a generic way across WASI versions.
 */
export interface WasiEnvironmentHelper {
  /**
   * Get all environment variables, as a list
   *
   * @returns {Record<string, string>}  config value
   */
  getAll: () => Array<[string, string]>;

  /**
   * Get all environment variables, as an object
   *
   * @returns {Record<string, string>}  config value
   */
  getAllObject: () => Record<string, string>;
}

/**
 * Build a helper for accessing environment variables via `wasi:cli/environment`
 *
 * @param {WASICLIEnvironmentLike} imports - an object that represents `wasi:cli/environment` imports
 * @returns {Record<string, string>}
 */
export function buildEnvHelperFromWASI(imports: WASICLIEnvironmentLike): WasiEnvironmentHelper {
  return {
    getAll: () => imports.getEnvironment(),
    getAllObject: () => Object.fromEntries(imports.getEnvironment()),
  };
}
