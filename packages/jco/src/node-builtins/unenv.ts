import { type BuiltinContext, type BuiltinAdapter, builtin, starReexportAdapter } from "./shared.js";
import { type NodeBuiltinOptions } from "./types.js";
import { defineEnv } from "unenv";
import { fileURLToPath } from "node:url";

let defaultUnenvAliases: Readonly<Record<string, string>> | undefined;

function getUnenvAliases(options: NodeBuiltinOptions): Readonly<Record<string, string>> {
    if (options.unenvAliases) {
        return options.unenvAliases;
    }
    // NOTE: read back through the assignment rather than the module-level binding, which is
    // only non-nullable here by narrowing
    return (defaultUnenvAliases ??= {
        ...defineEnv({ resolve: true }).env.alias,
        "unenv:buffer-core": fileURLToPath(import.meta.resolve("unenv/node/internal/buffer/buffer")),
    });
}

export function unenvModule(specifier: string, options: NodeBuiltinOptions): string {
    const resolved = getUnenvAliases(options)[specifier];
    if (!resolved || resolved.startsWith("node:")) {
        throw new Error(`unenv did not provide a bundleable implementation for audited builtin ${specifier}`);
    }
    return resolved;
}

/** Limited dependency fallbacks; zlib operations remain unsupported. */
export function createPortableUnenvBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin("node:zlib", (specifier) => starReexportAdapter(unenvModule(specifier, options), "implementation"));
}
