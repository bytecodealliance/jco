import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { resolve, basename, dirname, extname, join } from "node:path";
import { tmpdir } from "node:os";

import { componentWitMetadataForWorld } from "@bytecodealliance/jco-transpile";

import { bundleComponentSource, classifyComponentSource, loadBundleConfig } from "../bundle.js";
import { styleText, isWindows } from "../common.js";
import {
    INSPECTOR_CALLBACKS_SPECIFIER,
    nodeBuiltinPlugin,
    nodeGlobals,
    type NodejsHttpVia,
    type WorldMetadata,
} from "../node-builtins.js";
import {
    INSPECTOR_WIT_REQUIREMENT,
    injectNodeWitImports,
    witInjectionWarnings,
    type NodeWitRequirement,
} from "../node-wit.js";

/** All features that can be enabled/disabled */
const ALL_FEATURES = ["clocks", "http", "random", "stdio", "fetch-event"];

/** Features that should be used for --debug mode */
const DEBUG_FEATURES = ["stdio"];

type ComponentizeJSBackend = "qjs" | "quickjs" | "starlingmonkey" | "sm";

export interface ComponentizeOptions {
    wit: string;
    out: string;
    /**
     * Directory componentization runs from.
     *
     * We default to the entry module's directory here rather than a simple
     * cwd() so a build does not depend on where the command was invoked from.
     */
    cwd?: string;
    worldName?: string;
    bundle?: boolean;
    bundleConfig?: string;
    nodejsHttpVia?: NodejsHttpVia;
    backend?: ComponentizeJSBackend;
    backendQjsDisableAysnc: boolean;
    aot?: boolean;
    aotMinStackSizeBytes?: number;
    wevalBin?: string;
    wizerBin?: string;
    disable?: string[];
    enable?: string[];
    debug?: boolean;
    preview2Adapter?: string;
    debugStarlingmonkeyBuild?: boolean;
    engine?: string;
    debugBindings?: boolean;
    debugBindingsDir?: string;
    debugBinary?: boolean;
    debugBinaryPath?: string;
    debugEnableWizerLogging?: boolean;
}

/** Arguments to a componentize backend */
interface BackendComponentizeArgs {
    opts: ComponentizeOptions;
    sourceName: string;
    jsSource: string;
    source: string;
    witPath: string;
}

const COMPONENTIZE_BACKENDS: Record<string, ComponentizeJSBackend> = {
    starlingmonkey: "starlingmonkey",
    sm: "starlingmonkey",
    quickjs: "quickjs",
    qjs: "quickjs",
};

const STARLINGMONKEY_OPTIONS: Array<keyof ComponentizeOptions> = [
    "aot",
    "aotMinStackSizeBytes",
    "wevalBin",
    "disable",
    "enable",
    "debug",
    "preview2Adapter",
    "debugStarlingmonkeyBuild",
    "engine",
    "debugBindings",
    "debugBindingsDir",
    "debugBinary",
    "debugBinaryPath",
    "debugEnableWizerLogging",
];

/**
 * Detect whether the WIT of a given component contains an older version of
 * `wasi:http` which necessitates an older version of `componentize-js`
 *
 * @param {string} witPath
 * @returns bool
 */
async function worldMetadataFor(witPath: string, worldName?: string): Promise<WorldMetadata> {
    const path = (isWindows ? "//?/" : "") + resolve(witPath);
    return (await componentWitMetadataForWorld({ tag: "path", val: path }, worldName)) as WorldMetadata;
}

/**
 * Re-bundle the component with a wrapper that also exports the guest-side inspector callbacks.
 *
 * The user's entry only imports `node:inspector`; the callbacks the host uses to re-enter the
 * component are a guest-*exported* interface, so they must appear among the bundle's top-level
 * exports. The wrapper re-exports everything the original entry exports (the world's exports) and
 * adds `inspectorCallbacks`, which the Node builtin plugin resolves to the shared jco-std inspector
 * module. Bundled with the same plugin and options as the first pass, so nothing else changes.
 */
async function bundleInspectorCallbacksWrapper(
    jsSource: string,
    bundleOptions: Parameters<typeof bundleComponentSource>[1],
): Promise<string> {
    const entry = resolve(jsSource);
    const wrapperDir = await mkdtemp(join(tmpdir(), "jco-inspector-"));
    const wrapperPath = join(wrapperDir, "wrapper.mjs");
    const wrapperSource =
        `export * from ${JSON.stringify(entry)};
` +
        `export { inspectorCallbacks } from ${JSON.stringify(INSPECTOR_CALLBACKS_SPECIFIER)};
`;
    await writeFile(wrapperPath, wrapperSource);
    try {
        // The wrapper is plain JS regardless of the original's language; keep the original's
        // tsconfig handling so a TypeScript entry still transforms with its own settings.
        return await bundleComponentSource(wrapperPath, bundleOptions);
    } finally {
        await rm(wrapperDir, { recursive: true, force: true });
    }
}

async function usesOlderWasiHTTP(witPath: string, worldName?: string) {
    const worldMetadata = await worldMetadataFor(witPath, worldName);

    // Check if the an old `wasi:http/incoming-handler` version is exported
    const exportsOldIncomingHandler = worldMetadata.exports.some((iface) => {
        return (
            iface.namespace === "wasi" &&
            iface.version != null &&
            iface.version.major === 0n &&
            iface.version.minor < 3n &&
            iface.version.patch < 10n
        );
    });

    const importsOldFetch = worldMetadata.imports.some((iface) => {
        return (
            iface.namespace === "wasi" &&
            iface.version != null &&
            iface.version.major === 0n &&
            iface.version.minor < 3n &&
            iface.version.patch < 10n
        );
    });

    return exportsOldIncomingHandler || importsOldFetch;
}

/**
 * Componentize a JavaScript or TypeScript entry module against a WIT world.
 *
 * @param {string} jsSource
 * @param {ComponentizeOptions} opts
 */
export async function componentize(jsSource: string, opts: ComponentizeOptions): Promise<void> {
    // normalize the backend option
    const backend = normalizeBackend(opts.backend);
    validateBackendOptions(backend, opts);

    // Detect source code type
    const sourceType = classifyComponentSource(jsSource);
    if (sourceType === "typescript-declaration") {
        throw new Error(
            `TypeScript declaration files cannot be componentized directly: ${jsSource}. Provide a .ts, .mts, .cts, or .tsx entry module instead.`,
        );
    }
    const isTypeScript = sourceType === "typescript";
    const shouldBundle = opts.bundle === true || isTypeScript;

    // Perform bundling
    if (opts.bundleConfig && !shouldBundle) {
        throw new Error("--bundle-config requires --bundle");
    }
    const bundleConfig = opts.bundleConfig ? await loadBundleConfig(opts.bundleConfig) : undefined;
    let witPath = resolve(opts.wit);
    const witRequirements = new Map<string, NodeWitRequirement>();
    let source: string;
    if (shouldBundle) {
        const bundleOptions = {
            config: bundleConfig,
            typescript: isTypeScript,
            // The component engine supplies Web globals. Rolldown injects only Jco-backed Node
            // globals when referenced, so unused adapters add no bundle cost.
            inject: nodeGlobals(),
            // Node builtin adapters are supplied while the source graph is bundled, which is
            // why `node:path` only works together with `--bundle`.
            plugins: [
                nodeBuiltinPlugin(await worldMetadataFor(witPath, opts.worldName), {
                    nodejsHttpVia: opts.nodejsHttpVia,
                    onWitRequirement(requirement: NodeWitRequirement) {
                        witRequirements.set(requirement.witImport, requirement);
                    },
                }),
            ],
        };
        source = await bundleComponentSource(jsSource, bundleOptions);
        // `node:inspector` is host-backed *and* calls back into the component through a
        // guest-exported callbacks interface. The user's entry only imports `node:inspector`, so a
        // second pass re-bundles a wrapper that also exports that interface -- the JS half of the
        // `export jco:node/inspector-callbacks@0.1.0;` the WIT injection adds to the world.
        if (witRequirements.has(INSPECTOR_WIT_REQUIREMENT.witImport)) {
            source = await bundleInspectorCallbacksWrapper(jsSource, bundleOptions);
        }
    } else {
        source = await readFile(jsSource, "utf8");
    }
    const injection = await injectNodeWitImports(witPath, opts.worldName, [...witRequirements.values()]);
    if (injection) {
        witPath = injection.witPath;
        const warning = styleText(["yellow", "bold"], "warning");
        for (const message of witInjectionWarnings(injection)) {
            console.error(`${warning} ${message}`);
        }
    }
    const sourceName = isTypeScript ? `${basename(jsSource, extname(jsSource))}.js` : basename(jsSource);

    // Build the component
    let component;
    const backendArgs = { source, sourceName, jsSource, witPath, opts };
    // componentize-js reads the process working directory to decide the path prefix baked into
    // the component and the directory it preopens. Pin it so the build does not depend on where
    // the command ran, restoring the caller's directory afterwards.
    const componentizeCwd = resolve(opts.cwd ?? dirname(resolve(jsSource)));
    const callerCwd = process.cwd();
    try {
        process.chdir(componentizeCwd);
        switch (backend) {
            case "quickjs":
                component = await componentizeQJS(backendArgs);
                break;
            case "starlingmonkey":
                component = await componentizeCJS(backendArgs);
                break;
            default:
                throw new Error(`unrecognized componentization backend [${backend}]`);
        }
    } catch (err) {
        // Detect package resolution issues that usually mean a misconfigured "witPath"
        if (err instanceof Error && err.toString().includes("no known packages")) {
            const isFile = await stat(witPath).then((s) => s.isFile());
            if (isFile) {
                const hint = await printWITPathHint(witPath);
                if (err.message) {
                    err.message += `\n${hint}`;
                }
            }
        }
        throw err;
    } finally {
        process.chdir(callerCwd);
    }

    // Write out the component
    await writeFile(opts.out, component);

    console.log(`${styleText("green", "OK")} Successfully written ${styleText("bold", opts.out)}.`);
}

function normalizeBackend(backend = "starlingmonkey") {
    const normalized = COMPONENTIZE_BACKENDS[backend];
    if (!normalized) {
        throw new Error(
            `Unknown componentization backend "${backend}". Expected one of: starlingmonkey, sm, quickjs, qjs.`,
        );
    }
    return normalized;
}

function validateBackendOptions(backend: ComponentizeJSBackend, opts: ComponentizeOptions) {
    if (backend === "starlingmonkey") {
        return;
    }

    const incompatible = STARLINGMONKEY_OPTIONS.filter((option) => opts[option] !== undefined);
    if (incompatible.length > 0) {
        throw new Error(
            `The ${incompatible.map((option) => `--${option.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`).join(", ")} option${incompatible.length === 1 ? " is" : "s are"} only supported by the starlingmonkey backend.`,
        );
    }
}
/**
 * Print a hint about the witPath option that may be incorrect
 *
 * @param {string} witPath - witPath option that was used (which is a path that resolves to a file or directory)
 * @returns {string} user-visible, highlighted output that can be printed
 */
async function printWITPathHint(witPath: string): Promise<string> {
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
function calculateFeatureSet(opts: ComponentizeOptions) {
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

/** Componentize with componentize-qjs (QuickJS) */
async function componentizeQJS(args: BackendComponentizeArgs) {
    const { source, jsSource, opts, witPath } = args;
    const componentizeQJSModule = await eval('import("componentize-qjs")');
    const result = await componentizeQJSModule.componentize({
        witPath,
        jsSource: source,
        jsPath: resolve(jsSource),
        world: opts.worldName,
        sync: opts.backendQjsDisableAysnc,
    });
    return result.component;
}

/** Componentize with componentize-js (StarlingMonkey) */
async function componentizeCJS(args: BackendComponentizeArgs) {
    const { opts, sourceName, source, witPath } = args;
    const { disableFeatures, enableFeatures } = calculateFeatureSet(opts);
    // Load an older version of componentize-js if we detect an older version of WASI HTTP in use
    // as the version that is usable is baked into the StarlingMonkey version provided by a given version
    // of componentize-js
    let componentizeJSModule;
    const useOldComponentizeJS = await usesOlderWasiHTTP(witPath, opts.worldName);
    if (useOldComponentizeJS) {
        // NOTE: if we were to use a version of componentize-js 0.20.0 or newer here,
        // the build would fail, as newer versions do not support wasi:http < 0.2.10
        // for fetch.
        console.error(
            `${styleText(["yellow", "bold"], "warning")} Falling back to componentize-js 0.19.3 because this component requests Preview 2 WASI packages older than 0.2.10. See https://bytecodealliance.github.io/jco/troubleshooting/common-issues.html#componentize-js-0193-fallback for details and upgrade steps.`,
        );
        componentizeJSModule = await eval('import("@bytecodealliance/componentize-js-0-19-3")');
    } else {
        componentizeJSModule = await eval('import("@bytecodealliance/componentize-js")');
    }

    const result = await componentizeJSModule.componentize(source, {
        enableAot: opts.aot,
        aotMinStackSizeBytes: opts.aotMinStackSizeBytes,
        wevalBin: opts.wevalBin,
        wizerBin: opts.wizerBin,
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

    return result.component;
}
