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
    generatedId: string;
    source: string;
}

const TEXT_DECODER = new TextDecoder();

export function jcoPlugin(options: JcoPluginOptions = {}): Plugin {
    const filter = createFilter(options.include ?? REGEX_COMPONENT_ID, options.exclude);
    let components = new Map<string, Promise<GeneratedComponent>>();
    let generated = new Map<string, Promise<GeneratedComponent>>();
    let coreAssets = new Map<string, string>();

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
                    code: [
                        `import * as component from ${generatedId};`,
                        `export * from ${generatedId};`,
                        "export default component;",
                    ].join("\n"),
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
    let files: Record<string, Uint8Array>;
    try {
        const result = await transpile(bytes, {
            ...options.transpile,
            name,
            outDir: undefined,
        });
        files = result.files;
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
        generatedId: createGeneratedId(canonicalId),
        source,
    };
}
