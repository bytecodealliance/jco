import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { transpile } from "@bytecodealliance/jco";
import { createFilter } from "@rollup/pluginutils";
import type { Plugin, PluginContext } from "rollup";

import {
    REGEX_COMPONENT_ID,
    VIRTUAL_PREFIX,
    canonicalComponentId,
    componentName,
    createGeneratedId,
    createProxyId,
    hash,
    isGeneratedId,
    parseProxyId,
    splitComponentId,
} from "./ids.js";
import { rewriteCoreUrl, hasSupportedQuery } from "./util.js";
import type { JcoPluginOptions } from "./types.js";

/** Metadata for generated components */
interface GeneratedComponent {
    canonicalId: string;
    exports: string[];
    generatedId: string;
    instantiation: "async" | "sync" | undefined;
    source: string;
}

const TEXT_DECODER = new TextDecoder();

export function jcoPlugin(options: JcoPluginOptions = {}): Plugin {
    const filter = createFilter(options.include ?? REGEX_COMPONENT_ID, options.exclude);
    let components = new Map<string, Promise<GeneratedComponent>>();
    let generated = new Map<string, Promise<GeneratedComponent>>();
    let coreAssets = new Map<string, string>();
    let workerAssets = new Map<string, string>();

    async function generate(context: PluginContext, canonicalId: string): Promise<GeneratedComponent> {
        const existing = components.get(canonicalId);
        if (existing) {
            return existing;
        }

        const pending = generateComponent(context, canonicalId, options, coreAssets);
        components.set(canonicalId, pending);
        generated.set(createGeneratedId(canonicalId), pending);
        try {
            return await pending;
        } catch (error) {
            components.delete(canonicalId);
            generated.delete(createGeneratedId(canonicalId));
            throw error;
        }
    }

    return {
        name: "jco-component",

        buildStart() {
            components = new Map();
            generated = new Map();
            coreAssets = new Map();
            workerAssets = new Map();
        },

        async transform(source, id) {
            return rewriteWorkerUrls(this, source, id, workerAssets);
        },

        async resolveId(source, importer, resolveOptions) {
            if (source.startsWith(VIRTUAL_PREFIX)) {
                return source;
            }
            if (!REGEX_COMPONENT_ID.test(source)) {
                return null;
            }

            const input = splitComponentId(source);
            if (!hasSupportedQuery(input.query)) {
                return null;
            }

            const resolved = await this.resolve(input.path, importer, {
                ...resolveOptions,
                skipSelf: true,
            });
            if (!resolved || resolved.external) {
                return resolved;
            }

            const resolvedInput = splitComponentId(resolved.id);
            if (!filter(resolvedInput.path)) {
                return null;
            }

            // `?component` is only an opt-in marker, not a semantic transpilation
            // option, so plain and marked imports share one module instance.
            const canonicalId = canonicalComponentId(resolvedInput.path, "");
            return {
                ...resolved,
                id: createProxyId(canonicalId),
                external: false,
                moduleSideEffects: true,
                meta: {
                    ...resolved.meta,
                    jco: {
                        componentId: canonicalId,
                    },
                },
            };
        },

        async load(id) {
            const canonicalId = parseProxyId(id);
            if (canonicalId) {
                const input = splitComponentId(canonicalId);
                this.addWatchFile(input.path);
                const component = await generate(this, canonicalId);
                const generatedId = JSON.stringify(component.generatedId);
                return {
                    code: createProxySource(generatedId, component.instantiation, component.exports),
                    map: { mappings: "" },
                };
            }

            if (isGeneratedId(id)) {
                const component = await generated.get(id);
                if (!component) {
                    this.error(`Unknown generated Jco module: ${id}`);
                }
                return {
                    code: component.source,
                    map: { mappings: "" },
                };
            }

            return null;
        },
    };
}

/** Emit self-contained workers referenced by canonical Worker URL expressions. */
async function rewriteWorkerUrls(
    context: PluginContext,
    source: string,
    importer: string,
    workerAssets: Map<string, string>,
): Promise<{ code: string; map: null } | null> {
    const pattern =
        /new\s+Worker\(\s*new\s+URL\(\s*(["'])(\.\.?(?:\/[^"']+)+\.bundle\.js)\1\s*,\s*import\.meta\.url\s*\)/g;
    const matches = [...source.matchAll(pattern)];
    if (matches.length === 0) {
        return null;
    }

    let rewritten = source;
    for (const match of matches) {
        const workerSpecifier = match[2]!;
        const resolved = await context.resolve(workerSpecifier, importer, { skipSelf: true });
        if (!resolved || resolved.external) {
            return context.error({
                id: importer,
                message: `Unable to resolve bundled worker ${workerSpecifier} from ${importer}`,
            });
        }

        let referenceId = workerAssets.get(resolved.id);
        if (!referenceId) {
            let workerSource: Uint8Array;
            try {
                workerSource = await readFile(resolved.id);
            } catch (cause) {
                return context.error({
                    id: importer,
                    message: `Unable to read bundled worker ${resolved.id}`,
                    cause: cause as Error,
                });
            }
            referenceId = context.emitFile({
                type: "asset",
                name: basename(resolved.id),
                source: workerSource,
            });
            workerAssets.set(resolved.id, referenceId);
        }

        const workerUrl = match[0].slice(match[0].indexOf("new URL"));
        const rewrittenUrl = `new URL(import.meta.ROLLUP_FILE_URL_${referenceId})`;
        rewritten = rewritten.replace(workerUrl, rewrittenUrl);
    }

    return { code: rewritten, map: null };
}

/** Generate outputs for a single component, given it's canonical ID */
async function generateComponent(
    context: PluginContext,
    canonicalId: string,
    options: JcoPluginOptions,
    coreAssets: Map<string, string>,
): Promise<GeneratedComponent> {
    const input = splitComponentId(canonicalId);
    let bytes: Uint8Array;
    try {
        bytes = await readFile(input.path);
    } catch (cause) {
        return context.error({
            id: input.path,
            message: `Unable to read WebAssembly Component: ${input.path}`,
            cause: cause as Error,
        });
    }

    const name = options.name?.(canonicalId) ?? componentName(input.path, canonicalId);
    let exports: string[];
    let files: Record<string, Uint8Array>;
    try {
        const result = await transpile(bytes, {
            ...options.transpile,
            name,
            outDir: undefined,
        });
        files = result.files;
        exports = [...new Set(result.exports.map(([name]) => name))].filter((name) => name !== "default");
    } catch (cause) {
        return context.error({
            id: input.path,
            message: `Jco could not transpile ${input.path}; expected a WebAssembly Component`,
            cause: cause as Error,
        });
    }

    const jsFiles = Object.entries(files).filter(([file]) => file.endsWith(".js"));
    if (jsFiles.length !== 1) {
        return context.error({
            id: input.path,
            message: `Expected Jco to generate exactly one JavaScript entry, received ${jsFiles.length}`,
        });
    }

    let source = TEXT_DECODER.decode(jsFiles[0]![1]);
    for (const [file, core] of Object.entries(files)) {
        if (!file.endsWith(".wasm")) {
            continue;
        }
        const contentHash = hash(core);
        let referenceId = coreAssets.get(contentHash);
        if (!referenceId) {
            referenceId = context.emitFile({
                type: "asset",
                name: `${basename(file, ".wasm")}-${contentHash.slice(0, 16)}.wasm`,
                source: core,
            });
            coreAssets.set(contentHash, referenceId);
        }
        source = rewriteCoreUrl(context, source, file, referenceId, input.path);
    }

    return {
        canonicalId,
        exports,
        generatedId: createGeneratedId(canonicalId),
        instantiation: options.transpile?.instantiation,
        source,
    };
}

/** Create the public module facade around Jco's generated bindings. */
export function createProxySource(
    generatedId: string,
    instantiation: "async" | "sync" | undefined,
    exports: string[],
): string {
    if (!instantiation) {
        return [
            `import * as component from ${generatedId};`,
            `export * from ${generatedId};`,
            "export default function instantiate() {",
            "  return component;",
            "}",
        ].join("\n");
    }

    const invoke = "generatedInstantiate(getCoreModule, imports, instantiateCore)";
    const bindings = exports.map((name, index) => ({
        exported: JSON.stringify(name),
        local: `componentExport${index}`,
    }));
    const common = [
        `import { instantiate as generatedInstantiate } from ${generatedId};`,
        ...bindings.map(({ local }) => `let ${local};`),
        ...bindings.map(({ exported, local }) => `export { ${local} as ${exported} };`),
        'let state = "idle";',
        "function finish(exports) {",
        ...bindings.map(({ exported, local }) => `  ${local} = exports[${exported}];`),
        '  state = "done";',
        "  return exports;",
        "}",
    ];

    if (instantiation === "async") {
        return [
            ...common,
            "export default function instantiate(getCoreModule, imports, instantiateCore) {",
            '  if (state !== "idle") throw new Error("This WebAssembly Component has already been instantiated");',
            '  state = "pending";',
            "  let pending;",
            "  try {",
            `    pending = ${invoke};`,
            "  } catch (error) {",
            '    state = "idle";',
            "    throw error;",
            "  }",
            "  return Promise.resolve(pending).then(finish, error => {",
            '    state = "idle";',
            "    throw error;",
            "  });",
            "}",
        ].join("\n");
    }

    return [
        ...common,
        "export default function instantiate(getCoreModule, imports, instantiateCore) {",
        '  if (state !== "idle") throw new Error("This WebAssembly Component has already been instantiated");',
        '  state = "pending";',
        "  try {",
        `    return finish(${invoke});`,
        "  } catch (error) {",
        '    state = "idle";',
        "    throw error;",
        "  }",
        "}",
    ].join("\n");
}
