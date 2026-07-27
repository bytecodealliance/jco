import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

/** Regular expression for detecting a component import */
export const REGEX_COMPONENT_ID = /\.wasm(?:\?.*)?$/i;

/** Virtual import prefix */
export const VIRTUAL_PREFIX = "\0jco-component:";

/** Virtual import prefix for proxy */
const PROXY_PREFIX = `${VIRTUAL_PREFIX}proxy:`;

/** Virtual import prefix for generated file */
const GENERATED_PREFIX = `${VIRTUAL_PREFIX}generated:`;

/** Identifier of a given component import */
export interface ComponentId {
    path: string;
    query: string;
}

type HashAlgorithm = "sha256";

/** Helper for hashing a value with SHA256 */
export function hash(value: string | Uint8Array, algo: HashAlgorithm = "sha256"): string {
    return createHash(algo).update(value).digest("hex");
}

/** Generate a component ID, given a raw ID */
export function splitComponentId(id: string): ComponentId {
    const queryIndex = id.indexOf("?");
    const path = queryIndex === -1 ? id : id.slice(0, queryIndex);
    return {
        path: path.startsWith("file:") ? fileURLToPath(path) : path,
        query: queryIndex === -1 ? "" : id.slice(queryIndex),
    };
}

/** Create a canonical component ID */
export function canonicalComponentId(path: string, query: string): string {
    return `${path}${normalizeQuery(query)}`;
}

/** Create a proxy ID */
export function createProxyId(canonicalId: string): string {
    return `${PROXY_PREFIX}${encodeURIComponent(canonicalId)}`;
}

/** Parse a given ID as a proxy (if it is one) */
export function parseProxyId(id: string): string | undefined {
    if (!id.startsWith(PROXY_PREFIX)) {
        return undefined;
    }
    return decodeURIComponent(id.slice(PROXY_PREFIX.length));
}

/** Create a generated ID, which includes a hash of the canonical ID and a prefix */
export function createGeneratedId(canonicalId: string): string {
    const hashed = hash(canonicalId);
    return `${GENERATED_PREFIX}${hashed}`;
}

/** Check whether an ID is generated */
export function isGeneratedId(id: string): boolean {
    return id.startsWith(GENERATED_PREFIX);
}

/** Generate a unique component name from a given path & canonical ID */
export function componentName(path: string, canonicalId: string): string {
    const filename = path.split(/[\\/]/).pop() ?? "component";
    const basename = filename.replace(/\.wasm$/i, "") || "component";
    const safeName = basename.replace(/[^A-Za-z0-9_-]/g, "-");
    const hashPrefix = hash(canonicalId).slice(0, 8);
    return `${safeName}-${hashPrefix}`;
}

function normalizeQuery(query: string): string {
    if (!query) {
        return "";
    }
    const params = new URLSearchParams(query.slice(1));
    params.sort();
    return params.size === 0 ? "" : `?${params.toString()}`;
}
