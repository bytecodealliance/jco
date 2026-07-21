/**
 * Load one Rolldown configuration object using Rolldown's config loader.
 *
 * @param {string} configPath
 * @returns {Promise<import("rolldown").RolldownOptions>}
 */
export function loadBundleConfig(configPath: string): Promise<import("rolldown").RolldownOptions>;
/**
 * Bundle a JavaScript component entry point into the single ES module expected
 * by ComponentizeJS.
 *
 * `aliases` and `plugins` are intentionally exposed for Jco-owned source
 * adapters, such as future runtime compatibility modules. The output shape is
 * kept internal because ComponentizeJS accepts exactly one ES module.
 *
 * @param {string} entryPath
 * @param {{
 *   aliases?: Record<string, string | false | string[]>,
 *   external?: Array<string | RegExp>,
 *   plugins?: Array<import("rolldown").RolldownPluginOption>,
 *   config?: import("rolldown").RolldownOptions,
 * }} [options]
 * @returns {Promise<string>}
 */
export function bundleComponentSource(entryPath: string, options?: {
    aliases?: Record<string, string | false | string[]>;
    external?: Array<string | RegExp>;
    plugins?: Array<import("rolldown").RolldownPluginOption>;
    config?: import("rolldown").RolldownOptions;
}): Promise<string>;
//# sourceMappingURL=bundle.d.ts.map