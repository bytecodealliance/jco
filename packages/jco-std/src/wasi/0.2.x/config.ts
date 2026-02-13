/**
 * This interface abstracts over different versions of `wasi:config`, normally
 * in the 0.2.x range, but meant to be used across ranges (0.3.x and beyond).
 *
 * By amalgamating the interfaces here, we can build a common abstraction over them.
 */
export type WASIConfigStoreLike = WasiConfigStore02xLike;

/** Similar to `wasi:config/store@0.2.x` */
export interface WasiConfigStore02xLike {
  get: (key: string) => string | undefined;
  getAll: () => Array<[string, string]>;
}

/**
 * Helper for retrieving configuration via WASI
 *
 * This interface is ideally used by other pieces of a framework
 * or library to interact with config in a generic way across WASI versions.
 */
export interface WasiConfigHelper {
  /**
   * Get a single configuration value as a string
   *
   * @param {string} key - configuration key
   * @returns {string | undefined} The config value
   */
  get: (key: string) => string | undefined;

  /**
   * Get all configuration as an array
   *
   * @returns {Array<[string, string]>} All configuration values
   */
  getAll: () => Array<[string, string]>;

  /**
   * Get all configuration as an object
   *
   * @returns {Record<string, string>} All configuration values
   */
  getAllObject: () => Record<string, string>;
}

/**
 * Build a helper that can use `wasi:config` to provide configuration values
 *
 * This mostly exists to present a consistent abstraction over different version of wasi config
 * that are used.
 */
export function buildConfigHelperFromWASI(imports: WASIConfigStoreLike): WasiConfigHelper {
  return {
    get(k: string): string | undefined {
      return imports.get(k);
    },
    getAll(): Array<[string, string]> {
      return imports.getAll();
    },
    getAllObject(): Record<string, string> {
      return Object.fromEntries(imports.getAll());
    },
  };
}
