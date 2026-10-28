import { mergeNodeWitRequirement } from "../node-wit.js";
import { cp, mkdir, mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, basename, dirname, extname, join } from "node:path";

import { componentWitMetadataForWorld, createComponent, createWorld } from "@bytecodealliance/jco-transpile";

import { bundleComponentChunk, bundleComponentSource, classifyComponentSource, loadBundleConfig } from "../bundle.js";
import { engineCompatPlugin } from "../engine-compat.js";
import { styleText, isWindows } from "../common.js";
import { componentizePerry } from "./componentize/perry.js";
import {
    nodeBuiltinPlugin,
    nodeGlobals,
    type NodejsHttp2Via,
    type NodejsHttpVia,
    type NodejsVfsVia,
    type WorldMetadata,
} from "../node-builtins/index.js";
import {
    injectNodeWitImports,
    witInjectionWarnings,
    type NodeGuestExport,
    type NodeWitRequirement,
} from "../node-wit.js";

/** All features that can be enabled/disabled */
const ALL_FEATURES = ["clocks", "http", "random", "stdio", "fetch-event"];

/** Features that should be used for --debug mode */
const DEBUG_FEATURES = ["stdio"];

type ComponentizeJSBackend = "qjs" | "quickjs" | "starlingmonkey" | "sm" | "perry";

/** Fully-qualified world every script engine implements, which script-only components record. */
export const SCRIPT_ENGINE_WORLD = "jco:script-engine/engine@0.1.0";

/** File name of the engine component written by {@link componentizeScriptOnly}. */
const SCRIPT_ENGINE_FILE = "engine.wasm";

export interface ComponentizeOptions {
    /** Required by the JavaScript engine backends; Perry supplies its own WASI P2 world. */
    wit?: string;
    out: string;
    /**
     * Engine build to componentize with: a StarlingMonkey build for the starlingmonkey backend,
     * or a QuickJS runtime module for the quickjs backend.
     */
    engine?: string;
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
    nodejsVfsVia?: NodejsVfsVia;
    withNodejsVfsVia?: NodejsVfsVia;
    withNodejsVfsWasiConfig?: string;
    nodejsHttp2Via?: NodejsHttp2Via;
    /**
     * The CLI spelling of {@link nodejsHttpVia}.
     *
     * Commander names the option after the flag, `--with-nodejs-http-via`, so a value given on
     * the command line arrives under this key rather than the API one.
     */
    withNodejsHttpVia?: NodejsHttpVia;
    withNodejsCryptoVia?: "portable" | "direct";
    withNodejsHttp2Via?: NodejsHttp2Via;
    backend?: ComponentizeJSBackend;
    /** Project-installed npm package exposing Perry's CLI (supports npm aliases). */
    backendPerryPackage?: string;
    /** Explicit Perry CLI path, relative to the invocation directory. */
    backendPerryCliPath?: string;
    backendQjsDisableAsync?: boolean;
    backendQjsStubWasi?: boolean;
    aot?: boolean;
    aotMinStackSizeBytes?: number;
    wevalBin?: string;
    wizerBin?: string;
    disable?: string[];
    enable?: string[];
    debug?: boolean;
    preview2Adapter?: string;
    debugStarlingmonkeyBuild?: boolean;
    debugBindings?: boolean;
    debugBindingsDir?: string;
    debugBinary?: boolean;
    debugBinaryPath?: string;
    debugEnableWizerLogging?: boolean;
}

/**
 * Options for {@link componentizeScriptOnly}.
 *
 * The engine is built against the union of every `wit` world, so `wit` accepts several paths.
 * `worldName` selects the world in each: omit it to use each package's only world, or give one
 * name per `wit` path.
 */
export interface ComponentizeScriptOnlyOptions extends Omit<ComponentizeOptions, "wit" | "worldName" | "out"> {
    wit: string | string[];
    worldName?: string | string[];
    /** Directory that receives `engine.wasm`, `engine.wit` and one `<script>.wasm` per source. */
    out: string;
}

/**
 * CLI options for `jco componentize`.
 *
 * Commander collects repeatable `--wit` and `--world-name` flags into arrays, which only
 * `--script-only` accepts more than one of.
 */
export interface ComponentizeCommandOptions extends Omit<ComponentizeOptions, "wit" | "worldName"> {
    wit?: string[];
    worldName?: string[];
    scriptOnly?: boolean;
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
    perry: "perry",
};

const STARLINGMONKEY_OPTIONS: Array<keyof Omit<ComponentizeOptions, "wit" | "worldName">> = [
    "aot",
    "aotMinStackSizeBytes",
    "wevalBin",
    "disable",
    "enable",
    "debug",
    "preview2Adapter",
    "debugStarlingmonkeyBuild",
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
export async function worldMetadataFor(witPath: string, worldName?: string): Promise<WorldMetadata> {
    const directory = await isolateWitFile(witPath);
    try {
        const path = (isWindows ? "//?/" : "") + resolve(directory ?? witPath);
        return (await componentWitMetadataForWorld({ tag: "path", val: path }, worldName)) as WorldMetadata;
    } finally {
        if (directory) {
            await rm(directory, { recursive: true, force: true });
        }
    }
}

/** Resolve a selected WIT file with its dependencies, excluding sibling worlds. */
async function isolateWitFile(witPath: string): Promise<string | undefined> {
    const path = resolve(witPath);
    if (!(await stat(path)).isFile()) {
        return undefined;
    }
    const directory = await mkdtemp(join(tmpdir(), "jco-wit-"));
    try {
        await cp(path, join(directory, basename(path)));
        const dependencies = join(dirname(path), "deps");
        let hasDependencies = true;
        try {
            await stat(dependencies);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                throw error;
            }
            hasDependencies = false;
        }
        if (hasDependencies) {
            await cp(dependencies, join(directory, "deps"), { recursive: true });
        }
        return directory;
    } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
    }
}

/** Re-bundle an entry wrapper that explicitly implements guest callback interface exports. */
export async function bundleNodeGuestExportsWrapper(
    jsSource: string,
    guestExports: readonly NodeGuestExport[],
    bundleOptions: Parameters<typeof bundleComponentSource>[1],
): Promise<string> {
    const wrapperDir = await mkdtemp(join(tmpdir(), "jco-node-exports-"));
    const wrapperPath = join(wrapperDir, "wrapper.mjs");
    const entry = resolve(jsSource);
    const exports = [
        `export * from ${JSON.stringify(entry)};`,
        ...guestExports.map(
            ({ jsExport, moduleSpecifier }) => `export { ${jsExport} } from ${JSON.stringify(moduleSpecifier)};`,
        ),
    ];
    try {
        await writeFile(wrapperPath, `${exports.join("\n")}\n`);
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
            iface.package === "http" &&
            iface.version != null &&
            iface.version.major === 0n &&
            iface.version.minor < 3n &&
            iface.version.patch < 10n
        );
    });

    const importsOldFetch = worldMetadata.imports.some((iface) => {
        return (
            iface.namespace === "wasi" &&
            iface.package === "http" &&
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
    jsSource = resolve(jsSource);
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
    if (backend === "perry") {
        // Perry compiles the original module graph, including TypeScript and Node-style
        // builtins, to WASI. Do not erase types or inject Jco's Node compatibility layer.
        await writeComponent(opts.out, await componentizePerry(jsSource, opts));
        return;
    }
    if (!opts.wit) {
        throw new Error(`--wit is required for the ${backend} backend`);
    }
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
            inject: nodeGlobals({ webGlobals: backend === "quickjs" }),
            // Node builtin adapters are supplied while the source graph is bundled, which is
            // why `node:path` only works together with `--bundle`.
            plugins: [
                nodeBuiltinPlugin(await worldMetadataFor(witPath, opts.worldName), {
                    // QuickJS needs host timers, whose callback resources require the async ABI.
                    // Omit them when the caller explicitly disables async support.
                    hostTaskTimers: backend === "quickjs" && !opts.backendQjsDisableAsync,
                    nodejsCryptoVia: opts.withNodejsCryptoVia,
                    nodejsHttpVia: opts.nodejsHttpVia ?? opts.withNodejsHttpVia,
                    nodejsVfsVia: opts.nodejsVfsVia ?? opts.withNodejsVfsVia,
                    vfsWasiConfigModule: opts.withNodejsVfsWasiConfig
                        ? resolve(opts.withNodejsVfsWasiConfig)
                        : undefined,
                    nodejsHttp2Via: opts.nodejsHttp2Via ?? opts.withNodejsHttp2Via,
                    // Match the socket bindings supplied by the selected component engine.
                    wasiSocketsVersion: backend === "starlingmonkey" ? "0.2.10" : "0.2.12",
                    onWitRequirement(requirement: NodeWitRequirement) {
                        witRequirements.set(
                            requirement.witImport,
                            mergeNodeWitRequirement(witRequirements.get(requirement.witImport), requirement),
                        );
                    },
                }),
                // Rewrites regular-expression syntax the component engines cannot parse, so
                // that a dependency using it fails to bundle rather than at pre-initialization.
                engineCompatPlugin(),
            ],
        };
        source = await bundleComponentSource(jsSource, bundleOptions);
        const guestExports = [
            ...new Map(
                [...witRequirements.values()]
                    .flatMap((requirement) => requirement.guestExports ?? [])
                    .map((guestExport) => [guestExport.jsExport, guestExport]),
            ).values(),
        ];
        if (guestExports.length > 0) {
            source = await bundleNodeGuestExportsWrapper(jsSource, guestExports, bundleOptions);
        }
    } else {
        source = await readFile(jsSource, "utf8");
    }
    const injection = await injectNodeWitImports(witPath, opts.worldName, [...witRequirements.values()], {
        asyncGuestCallbacks: backend === "quickjs" && !opts.backendQjsDisableAsync,
    });
    if (injection) {
        witPath = injection.witPath;
        const warning = styleText(["yellow", "bold"], "warning");
        for (const message of witInjectionWarnings(injection)) {
            console.error(`${warning} ${message}`);
        }
    }
    const temporaryWitDirectory = await isolateWitFile(opts.wit);
    witPath = temporaryWitDirectory ?? witPath;
    const sourceName = isTypeScript ? `${basename(jsSource, extname(jsSource))}.js` : basename(jsSource);

    // Build the component
    let component;
    try {
        component = await buildWithBackend(
            backend,
            { source, sourceName, jsSource, witPath, opts },
            resolve(opts.cwd ?? dirname(resolve(jsSource))),
        );
    } finally {
        if (temporaryWitDirectory) {
            await rm(temporaryWitDirectory, { recursive: true, force: true });
        }
    }

    // Write out the component
    await writeComponent(opts.out, component);
}

/**
 * Run the selected JavaScript engine backend from `cwd`.
 *
 * componentize-js reads the process working directory to decide the path prefix baked into the
 * component and the directory it preopens. Pin it so the build does not depend on where the
 * command ran, restoring the caller's directory afterwards.
 */
async function buildWithBackend(
    backend: ComponentizeJSBackend,
    backendArgs: BackendComponentizeArgs,
    cwd: string,
): Promise<Uint8Array> {
    const { witPath } = backendArgs;
    const callerCwd = process.cwd();
    try {
        process.chdir(cwd);
        switch (backend) {
            case "quickjs":
                return await componentizeQJS(backendArgs);
            case "starlingmonkey":
                return await componentizeCJS(backendArgs);
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
}

/**
 * Entry point for the `jco componentize` CLI command.
 *
 * Dispatches between the one-script-one-component build and `--script-only`, and validates
 * the option shapes that only make sense for one of them.
 */
export async function componentizeCommand(sources: string[], opts: ComponentizeCommandOptions): Promise<void> {
    const { wit = [], worldName = [], scriptOnly, ...rest } = opts;
    if (scriptOnly) {
        await componentizeScriptOnly(sources, { ...rest, wit, worldName });
        return;
    }
    if (sources.length !== 1) {
        throw new Error(
            `expected exactly one source module, received ${sources.length}; building several scripts requires --script-only`,
        );
    }
    if (wit.length > 1) {
        throw new Error("several --wit paths can only be combined with --script-only");
    }
    if (worldName.length > 1) {
        throw new Error("several --world-name values can only be combined with --script-only");
    }
    await componentize(sources[0], { ...rest, wit: wit[0], worldName: worldName[0] });
}

/**
 * Build a script engine component and script-only components that run on it.
 *
 * The engine is the selected JavaScript engine componentized against the union of the given WIT
 * worlds plus `jco:script-engine/script-loader`; its exports forward to whichever script was
 * loaded last. Each source is bundled to an ES module and packaged as a component exporting
 * `jco:script/script`, from which a host reads the script to hand to the engine.
 *
 * Scripts loaded into one engine instance share a JavaScript realm, so the engine is not a
 * sandbox between scripts.
 *
 * @param {string[]} sources - script entry modules to package; may be empty to build only the engine
 * @param {ComponentizeScriptOnlyOptions} opts
 */
export async function componentizeScriptOnly(sources: string[], opts: ComponentizeScriptOnlyOptions): Promise<void> {
    const backend = normalizeBackend(opts.backend);
    if (backend === "perry") {
        throw new Error("--script-only requires a JavaScript engine backend (starlingmonkey or quickjs)");
    }
    validateBackendOptions(backend, opts);

    const witPaths = (Array.isArray(opts.wit) ? opts.wit : [opts.wit]).filter((path) => path !== undefined);
    if (witPaths.length === 0) {
        throw new Error("--script-only requires at least one --wit path describing a world the engine must support");
    }
    const worldNames =
        opts.worldName === undefined ? [] : Array.isArray(opts.worldName) ? opts.worldName : [opts.worldName];
    if (worldNames.length !== 0 && worldNames.length !== witPaths.length) {
        throw new Error(
            `received ${worldNames.length} --world-name value(s) for ${witPaths.length} --wit path(s); give one world per WIT path, in the same order, or none`,
        );
    }
    for (const source of sources) {
        if (classifyComponentSource(source) === "typescript-declaration") {
            throw new Error(
                `TypeScript declaration files cannot be componentized directly: ${source}. Provide a .ts, .mts, .cts, or .tsx entry module instead.`,
            );
        }
    }

    const outDir = resolve(opts.out);
    await mkdir(outDir, { recursive: true });
    if (!(await stat(outDir)).isDirectory()) {
        throw new Error(`--script-only writes several components, so --out must be a directory: ${opts.out}`);
    }
    const scriptOutputs = sources.map((source) => join(outDir, `${basename(source, extname(source))}.wasm`));
    for (const [index, output] of scriptOutputs.entries()) {
        if (basename(output) === SCRIPT_ENGINE_FILE) {
            throw new Error(
                `the script ${sources[index]} would be written to ${output}, which is reserved for the engine`,
            );
        }
        const duplicate = scriptOutputs.indexOf(output);
        if (duplicate !== index) {
            throw new Error(
                `the scripts ${sources[duplicate]} and ${sources[index]} would both be written to ${output}`,
            );
        }
    }

    // Merge the worlds and generate the engine's bootstrap module
    const engine = await createWorld(
        witPaths.map((path, index) => ({
            path: (isWindows ? "//?/" : "") + resolve(path),
            world: worldNames[index],
        })),
        backend === "quickjs" ? "quickjs" : "starlingmonkey",
    );

    // Build the engine: the bootstrap module is componentized like any other script
    const workDir = await mkdtemp(join(tmpdir(), "jco-script-engine-"));
    try {
        const witPath = join(workDir, "engine.wit");
        const bootstrapPath = join(workDir, "engine.js");
        await writeFile(witPath, engine.wit);
        await writeFile(bootstrapPath, engine.bootstrap);
        const component = await buildWithBackend(
            backend,
            {
                source: engine.bootstrap,
                sourceName: "engine.js",
                jsSource: bootstrapPath,
                witPath,
                opts: { ...opts, wit: witPath, worldName: engine.worldName, out: join(outDir, SCRIPT_ENGINE_FILE) },
            },
            resolve(opts.cwd ?? workDir),
        );
        await writeComponent(join(outDir, SCRIPT_ENGINE_FILE), component);
        await writeFile(join(outDir, "engine.wit"), engine.wit);
    } finally {
        await rm(workDir, { recursive: true, force: true });
    }

    // Package each script
    const bundleConfig = opts.bundleConfig ? await loadBundleConfig(opts.bundleConfig) : undefined;
    for (const [index, source] of sources.entries()) {
        const entry = resolve(source);
        const isTypeScript = classifyComponentSource(entry) === "typescript";
        // Rolldown hoists imports and emits one trailing export list, which is the module shape
        // the engine's loader rewrites at runtime.
        const { code, exports, imports } = await bundleComponentChunk(entry, {
            config: bundleConfig,
            typescript: isTypeScript,
            external: engine.imports,
            plugins: [engineCompatPlugin()],
        });
        const unknownImports = imports.filter((specifier) => !engine.imports.includes(specifier));
        if (unknownImports.length > 0) {
            throw new Error(
                `${source} imports ${unknownImports.map((specifier) => `"${specifier}"`).join(", ")}, which the engine world does not import. Pass a WIT world that imports ${unknownImports.length === 1 ? "it" : "them"} with --wit.`,
            );
        }
        const unknownExports = exports.filter((name) => !engine.exports.includes(name));
        if (unknownExports.length > 0) {
            console.error(
                `${styleText(["yellow", "bold"], "warning")} ${source} exports ${unknownExports.map((name) => `"${name}"`).join(", ")}, which the engine world does not export; the engine will never call ${unknownExports.length === 1 ? "it" : "them"}.`,
            );
        }
        const component = await createComponent({
            name: isTypeScript ? `${basename(entry, extname(entry))}.js` : basename(entry),
            source: code,
            engineWorld: SCRIPT_ENGINE_WORLD,
            exports,
        });
        await writeComponent(scriptOutputs[index], component);
    }
}

async function writeComponent(out: string, component: Uint8Array) {
    await writeFile(out, component);
    console.log(`${styleText("green", "OK")} Successfully written ${styleText("bold", out)}.`);
}

function normalizeBackend(backend = "starlingmonkey") {
    const normalized = COMPONENTIZE_BACKENDS[backend];
    if (!normalized) {
        throw new Error(
            `Unknown componentization backend "${backend}". Expected one of: starlingmonkey, sm, quickjs, qjs, perry.`,
        );
    }
    return normalized;
}

function validateBackendOptions(backend: ComponentizeJSBackend, opts: Omit<ComponentizeOptions, "wit" | "worldName">) {
    for (const option of ["backendPerryPackage", "backendPerryCliPath"] as const) {
        if (backend !== "perry" && opts[option] !== undefined) {
            const flag = option.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
            throw new Error(`--${flag} is only supported by the perry backend`);
        }
    }
    if (backend === "perry" && opts.engine !== undefined) {
        throw new Error("--engine is only supported by the starlingmonkey and quickjs backends");
    }
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
    const componentizeQJSModule = process.env.JCO_QJS_BINDING_PATH
        ? (await import("node:module")).createRequire(import.meta.url)(resolve(process.env.JCO_QJS_BINDING_PATH))
        : await eval('import("componentize-qjs")');
    const result = await componentizeQJSModule.componentize({
        witPath,
        jsSource: source,
        jsPath: resolve(jsSource),
        world: opts.worldName,
        sync: opts.backendQjsDisableAsync,
        stubWasi: opts.backendQjsStubWasi,
        runtime: opts.engine ?? process.env.JCO_QJS_RUNTIME_PATH,
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
