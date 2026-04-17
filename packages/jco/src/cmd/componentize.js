import { stat, readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";

import * as wasmToolsComponent from "../../obj/wasm-tools.js";

import { styleText, isWindows } from "../common.js";

/** All features that can be enabled/disabled */
const ALL_FEATURES = ["clocks", "http", "random", "stdio", "fetch-event"];

/** Features that should be used for --debug mode */
const DEBUG_FEATURES = ["stdio"];

/**
 * Detect whether the WIT of a given component contains an older version of
 * `wasi:http` which necessitates an older version of `componentize-js`
 *
 * @param {string} witPath
 * @returns bool
 */
async function usesOlderWasiHTTP(witPath, worldName) {
    await wasmToolsComponent.$init;

    witPath = (isWindows ? "//?/" : "") + resolve(witPath);
    const worldMetadata = wasmToolsComponent.tools.componentWitMetadataForWorld(
        { tag: "path", val: witPath },
        worldName ?? null,
    );

    // Check if the an old `wasi:http/incoming-handler` version is exported
    const exportsOldIncomingHandler = worldMetadata.exports.some((iface) => {
        return (
            iface.namespace === "wasi" &&
            iface.package === "http" &&
            iface.interface === "incoming-handler" &&
            iface.version !== null &&
            iface.version.major === 0n &&
            iface.version.minor < 3n &&
            iface.version.patch < 10n
        );
    });

    return exportsOldIncomingHandler;
}
export async function componentize(jsSource, opts) {
    const { disableFeatures, enableFeatures } = calculateFeatureSet(opts);

    const source = await readFile(jsSource, "utf8");
    const witPath = resolve(opts.wit);
    const sourceName = basename(jsSource);

    // Load an older version of componentize-js if we detect an older version of WASI HTTP in use
    // as the version that is usable is baked into the StarlingMonkey version provided by a given version
    // of componentize-js
    let componentizeJSModule;
    const useOldComponentizeJS = await usesOlderWasiHTTP(witPath, opts.worldName);
    if (useOldComponentizeJS) {
        // NOTE: if we were to use a version of componentize-js 0.20.0 or newer here,
        // the build would fail, as newer versions do not support wasi:http < 0.2.10
        // for fetch.
        componentizeJSModule = await eval('import("@bytecodealliance/componentize-js-0-19-3")');
    } else {
        componentizeJSModule = await eval('import("@bytecodealliance/componentize-js")');
    }

    let component;
    try {
        const result = await componentizeJSModule.componentize(source, {
            enableAot: opts.aot,
            aotMinStackSizeBytes: opts.aotMinStackSizeBytes,
            wevalBin: opts.wevalBin,
            sourceName,
            witPath,
            worldName: opts.worldName,
            disableFeatures,
            enableFeatures,
            preview2Adapter: opts.preview2Adapter,
            debugBuild: opts.debugStarlingmonkeyBuild,
            engine: opts.engine,
            debug: {
                bindings: opts.debugBindings,
                bindingsDir: opts.debugBindingsDir,
                binary: opts.debugBinary,
                binaryPath: opts.debugBinaryPath,
                enableWizerLogging: opts.debugEnableWizerLogging,
            },
        });
        if (result.debug) {
            console.error(`${styleText("cyan", "DEBUG")} Debug output\n${JSON.stringify(result.debug, null, 2)}\n`);
        }

        component = result.component;
    } catch (err) {
        // Detect package resolution issues that usually mean a misconfigured "witPath"
        if (err.toString().includes("no known packages")) {
            const isFile = await stat(witPath).then((s) => s.isFile());
            if (isFile) {
                const hint = await printWITPathHint(witPath);
                if (err.message) {
                    err.message += `\n${hint}`;
                }
            }
        }
        throw err;
    }

    await writeFile(opts.out, component);

    console.log(`${styleText("green", "OK")} Successfully written ${styleText("bold", opts.out)}.`);
}

/**
 * Print a hint about the witPath option that may be incorrect
 *
 * @param {string} witPath - witPath option that was used (which is a path that resolves to a file or directory)
 * @returns {string} user-visible, highlighted output that can be printed
 */
async function printWITPathHint(witPath) {
    const warningPrefix = styleText(["yellow", "bold"], "warning");
    const pathMeta = await stat(witPath);
    let output = "\n";
    if (!pathMeta.isFile() && !pathMeta.isDirectory()) {
        output += `${warningPrefix} The supplited WIT path [${witPath}] is neither a file or directory.\n`;
        return output;
    }
    output += `${warningPrefix} Your WIT path option [${witPath}] may be incorrect\n`;
    output += `${warningPrefix} When using a world with dependencies, you must pass the enclosing WIT folder, not a single file.\n`;
    output += `${warningPrefix} (e.g. 'wit/', rather than 'wit/component.wit').\n`;
    return output;
}

/**
 * Build set of disabled features
 *
 * At present, `componentize-js` does not use enabled features but exclusively
 * takes into account disabled features.
 *
 * @param {{ debug: boolean, disable: string[], enable: string[] }} opts
 * @returns {{ disableFeatures: string[], enableFeatures: string[] }}
 */
function calculateFeatureSet(opts) {
    const disableFeatures = new Set(opts?.debug ? DEBUG_FEATURES : []);
    const disable = opts?.disable ?? [];
    const enable = opts?.enable ?? [];

    // Process disabled features
    if (disable.includes("all")) {
        ALL_FEATURES.forEach((v) => disableFeatures.add(v));
    } else {
        disable.forEach((v) => disableFeatures.add(v));
    }

    // Process enabled features
    if (enable.includes("all")) {
        ALL_FEATURES.forEach((v) => disableFeatures.delete(v));
    } else {
        enable.forEach((v) => disableFeatures.delete(v));
    }

    return {
        disableFeatures: [...disableFeatures],
        enableFeatures: ALL_FEATURES.filter((v) => !disableFeatures.has(v)),
    };
}
