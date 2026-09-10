import { type WorldMetadata, type NodeBuiltinOptions } from "./types.js";
import { fileURLToPath } from "node:url";

export const VIRTUAL_PREFIX = "\0jco-node-builtin:";

/**
 * Source of an adapter that forwards a module's default export and re-exports its whole named
 * surface. `localName` only names the default-import binding in the generated source.
 */
export function starReexportAdapter(module: string, localName: string): string {
    return `
import ${localName} from ${JSON.stringify(module)};
export default ${localName};
export * from ${JSON.stringify(module)};
`;
}

export interface BuiltinAdapter {
    resolveId(id: string, importer?: string): string | null;
    load(id: string): string | null;
}

export interface BuiltinContext {
    worldMetadata: WorldMetadata;
    options: NodeBuiltinOptions;
}

/** Keep both the WASI and Node major pinned; resolve only when an adapter is loaded. */
export function stdModule(override: string | undefined, subpath: string, major = "24.x.x"): string {
    return (
        override ?? fileURLToPath(import.meta.resolve(`@bytecodealliance/jco-std/wasi/0.2.x/node/${major}/${subpath}`))
    );
}

/** Register ordinary node: specifiers without eagerly resolving their implementations. */
export function builtin(
    specifiers: string | Iterable<string>,
    load: (specifier: string) => string,
    onResolve?: (specifier: string) => void,
): BuiltinAdapter {
    const supported = new Set(typeof specifiers === "string" ? [specifiers] : specifiers);
    return {
        resolveId(id) {
            if (!supported.has(id)) {
                return null;
            }
            onResolve?.(id);
            return VIRTUAL_PREFIX + id;
        },
        load(id) {
            if (!id.startsWith(VIRTUAL_PREFIX)) {
                return null;
            }
            const specifier = id.slice(VIRTUAL_PREFIX.length);
            return supported.has(specifier) ? load(specifier) : null;
        },
    };
}

/** Register a shared virtual module, such as a guest callback interface. */
export function virtualBuiltin(specifier: string, virtualId: string, load: () => string): BuiltinAdapter {
    return {
        resolveId: (id) => (id === specifier ? virtualId : null),
        load: (id) => (id === virtualId ? load() : null),
    };
}

/** Compose adapters in order, stopping at the first one that handles the request. */
export function composeBuiltins(adapters: BuiltinAdapter[]): BuiltinAdapter {
    return {
        resolveId(id, importer) {
            for (const adapter of adapters) {
                const result = adapter.resolveId(id, importer);
                if (result !== null) {
                    return result;
                }
            }
            return null;
        },
        load(id) {
            for (const adapter of adapters) {
                const result = adapter.load(id);
                if (result !== null) {
                    return result;
                }
            }
            return null;
        },
    };
}
