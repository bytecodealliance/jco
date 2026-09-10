import { PATH_WIT_REQUIREMENT } from "../node-wit.js";
import { type WorldMetadata } from "./types.js";
import { VIRTUAL_PREFIX, type BuiltinContext, type BuiltinAdapter, stdModule } from "./shared.js";

const PATH_SPECIFIERS = new Map([
    ["node:path", "default"],
    ["node:path/posix", "posix"],
    ["node:path/win32", "win32"],
]);

/**
 * Determine the `wasi:cli/environment` version a WIT world imports.
 *
 * `node:path` is backed by WASI, so the world has to import the interface it needs, at exactly
 * one version.
 */
function environmentVersion(worldMetadata: WorldMetadata): string | undefined {
    const matches = (worldMetadata?.imports ?? []).filter(
        (iface) =>
            iface.namespace === "wasi" &&
            iface.package === "cli" &&
            iface.interface === "environment" &&
            iface.version?.major === 0n &&
            iface.version?.minor === 2n,
    );
    if (matches.length === 0) {
        return undefined;
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
export const _makeLong = path._makeLong;
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

export function createPathBuiltin({ options, worldMetadata }: BuiltinContext): BuiltinAdapter {
    return {
        resolveId(id) {
            if (!PATH_SPECIFIERS.has(id)) {
                return null;
            }
            let version = environmentVersion(worldMetadata);
            if (!version) {
                options.onWitRequirement?.(PATH_WIT_REQUIREMENT);
                version = "0.2.12";
            }
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
            if (specifier === "path-core") {
                return pathCore(version, stdModule(options.pathFactory, "path"));
            }
            return PATH_SPECIFIERS.has(specifier) ? pathAdapter(specifier, version) : null;
        },
    };
}
