import { fileURLToPath } from "node:url";

import type { Plugin } from "rolldown";

const PATH_SPECIFIERS = new Map([
    ["node:path", "default"],
    ["node:path/posix", "posix"],
    ["node:path/win32", "win32"],
]);
const VIRTUAL_PREFIX = "\0jco-node-builtin:";

/** Interface of a WIT world, as reported by `componentWitMetadataForWorld` */
interface WorldInterface {
    namespace?: string;
    package?: string;
    interface?: string;
    version?: { major: bigint; minor: bigint; patch: bigint; pre?: string } | null;
}

/** Metadata of the WIT world a component is being built against */
export interface WorldMetadata {
    imports: WorldInterface[];
    exports: WorldInterface[];
}

export interface NodeBuiltinOptions {
    /** Path to jco-std's `node/path` module (overridable for tests) */
    pathFactory?: string;
}

/**
 * Determine the `wasi:cli/environment` version a WIT world imports.
 *
 * `node:path` is backed by WASI, so the world has to import the interface it needs, at exactly
 * one version.
 */
function environmentVersion(worldMetadata: WorldMetadata): string {
    const matches = (worldMetadata?.imports ?? []).filter(
        (iface) =>
            iface.namespace === "wasi" &&
            iface.package === "cli" &&
            iface.interface === "environment" &&
            iface.version?.major === 0n &&
            iface.version?.minor === 2n,
    );
    if (matches.length === 0) {
        throw new Error(
            "node:path requires the selected WIT world to import wasi:cli/environment@0.2.x; add that interface to the world",
        );
    }
    if (matches.length > 1) {
        throw new Error(
            "node:path cannot select a WASI environment adapter because the selected WIT world imports multiple wasi:cli/environment@0.2.x versions",
        );
    }
    const { major, minor, patch, pre } = matches[0].version!;
    return `${major}.${minor}.${patch}${pre ? `-${pre}` : ""}`;
}

/** Source of the shared `node:path` core, which owns the single WASI-backed path instance */
function pathCore(version: string, factoryPath: string) {
    return `
import { initialCwd, getEnvironment } from "wasi:cli/environment@${version}";
import { createPath } from ${JSON.stringify(factoryPath)};
export const portablePath = createPath({ initialCwd, getEnvironment });
`;
}

/** Source of a `node:path`, `node:path/posix`, or `node:path/win32` adapter */
function pathAdapter(specifier: string, version: string) {
    const namespace = PATH_SPECIFIERS.get(specifier);
    return `
import { portablePath } from ${JSON.stringify(`${VIRTUAL_PREFIX}path-core@${version}`)};
const path = ${namespace === "default" ? "portablePath" : `portablePath.${namespace}`};
export default path;
export const basename = path.basename;
export const delimiter = path.delimiter;
export const dirname = path.dirname;
export const extname = path.extname;
export const format = path.format;
export const matchesGlob = path.matchesGlob;
export const isAbsolute = path.isAbsolute;
export const join = path.join;
export const normalize = path.normalize;
export const parse = path.parse;
export const posix = path.posix;
export const relative = path.relative;
export const resolve = path.resolve;
export const sep = path.sep;
export const toNamespacedPath = path.toNamespacedPath;
export const win32 = path.win32;
`;
}

/** Create Jco's virtual adapters for supported Node builtins. */
export function nodeBuiltinPlugin(worldMetadata: WorldMetadata, options: NodeBuiltinOptions = {}): Plugin {
    const factoryPath =
        options.pathFactory ?? fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/node/path"));
    return {
        name: "jco-node-builtins",
        resolveId(id) {
            if (id.startsWith(VIRTUAL_PREFIX)) {
                return id;
            }
            if (!PATH_SPECIFIERS.has(id)) {
                return null;
            }
            const version = environmentVersion(worldMetadata);
            return `${VIRTUAL_PREFIX}${id}@${version}`;
        },
        load(id) {
            if (!id.startsWith(VIRTUAL_PREFIX)) {
                return null;
            }
            const value = id.slice(VIRTUAL_PREFIX.length);
            const separator = value.lastIndexOf("@");
            const specifier = value.slice(0, separator);
            const version = value.slice(separator + 1);
            return specifier === "path-core" ? pathCore(version, factoryPath) : pathAdapter(specifier, version);
        },
    };
}
