import { dirname, resolve } from "node:path";

/** External imports that represent WebAssembly Component capabilities. */
const WASI_EXTERNAL = /^wasi:/;
const TYPESCRIPT_ENTRY = /\.(?:[cm]?ts|tsx)$/i;
const TYPESCRIPT_DECLARATION_ENTRY = /\.d\.(?:[cm]?ts|tsx)$/i;

/**
 * Classify a component source path for source preparation.
 *
 * @param {string} sourcePath
 * @returns {"javascript" | "typescript" | "typescript-declaration"}
 */
export function classifyComponentSource(sourcePath) {
    if (TYPESCRIPT_DECLARATION_ENTRY.test(sourcePath)) {
        return "typescript-declaration";
    }
    if (TYPESCRIPT_ENTRY.test(sourcePath)) {
        return "typescript";
    }
    return "javascript";
}

/**
 * Load one Rolldown configuration object using Rolldown's config loader.
 *
 * @param {string} configPath
 * @returns {Promise<import("rolldown").RolldownOptions>}
 */
export async function loadBundleConfig(configPath) {
    const { loadConfig } = await import("rolldown/config");
    let config = await loadConfig(resolve(configPath));
    if (typeof config === "function") {
        config = await config({ bundle: true });
    }
    if (Array.isArray(config)) {
        throw new TypeError("Jco bundle configuration must export a single configuration object");
    }
    if (!config || typeof config !== "object") {
        throw new TypeError("Jco bundle configuration must export a configuration object");
    }
    return config;
}

/**
 * Bundle a JavaScript or TypeScript component entry point into the single ES
 * module expected by ComponentizeJS.
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
 *   typescript?: boolean,
 * }} [options]
 * @returns {Promise<string>}
 */
export async function bundleComponentSource(entryPath, options = {}) {
    const { rolldown } = await import("rolldown");
    const absoluteEntryPath = resolve(entryPath);
    const config = options.config ?? {};
    if (Array.isArray(config.output)) {
        throw new TypeError("Jco bundle configuration must define at most one output");
    }
    const { output: configOutput, ...inputConfig } = config;
    const configAlias = config.resolve?.alias;
    const aliases = Array.isArray(configAlias)
        ? [
              ...configAlias,
              ...Object.entries(options.aliases ?? {}).map(([find, replacement]) => ({ find, replacement })),
          ]
        : { ...(configAlias ?? {}), ...(options.aliases ?? {}) };
    const build = await rolldown({
        ...inputConfig,
        input: absoluteEntryPath,
        cwd: dirname(absoluteEntryPath),
        platform: "neutral",
        tsconfig: options.typescript ? (inputConfig.tsconfig ?? true) : inputConfig.tsconfig,
        external: mergeExternal(config.external, options.external),
        plugins: [config.plugins ?? [], options.plugins ?? []],
        resolve: {
            ...config.resolve,
            alias: aliases,
        },
    });

    try {
        const { output } = await build.generate({
            ...(configOutput ?? {}),
            format: "esm",
            codeSplitting: false,
        });
        const chunks = output.filter((item) => item.type === "chunk");
        const assets = output.filter((item) => item.type === "asset");

        if (assets.length > 0) {
            throw new Error(
                `Component bundling produced unsupported assets: ${assets.map((asset) => asset.fileName).join(", ")}`,
            );
        }
        if (chunks.length !== 1 || !chunks[0].isEntry) {
            throw new Error(
                `Component bundling must produce exactly one entry chunk; received ${chunks.length} chunk(s). Dynamic or split chunks are not supported.`,
            );
        }

        return chunks[0].code;
    } finally {
        await build.close();
    }
}

function mergeExternal(configExternal, jcoExternal = []) {
    const external = [WASI_EXTERNAL, configExternal, ...jcoExternal].filter(Boolean);
    return (id, parentId, isResolved) => external.some((option) => matchesExternal(option, id, parentId, isResolved));
}

function matchesExternal(option, id, parentId, isResolved) {
    if (typeof option === "function") {
        return option(id, parentId, isResolved) === true;
    }
    if (Array.isArray(option)) {
        return option.some((item) => matchesExternal(item, id, parentId, isResolved));
    }
    if (typeof option === "string") {
        return option === id;
    }
    option.lastIndex = 0;
    return option.test(id);
}
