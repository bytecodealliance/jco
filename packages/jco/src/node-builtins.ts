import { fileURLToPath } from "node:url";

import type { Plugin } from "rolldown";
import { defineEnv } from "unenv";

import { CHILD_PROCESS_WIT_REQUIREMENT, CLUSTER_WIT_REQUIREMENT, type NodeWitRequirement } from "./node-wit.js";

const PATH_SPECIFIERS = new Map([
    ["node:path", "default"],
    ["node:path/posix", "posix"],
    ["node:path/win32", "win32"],
]);
const ASSERT_SPECIFIERS = new Set(["node:assert", "node:assert/strict"]);
const CHILD_PROCESS_SPECIFIER = "node:child_process";
const CLUSTER_SPECIFIER = "node:cluster";
const AUDITED_UNENV_SPECIFIERS = new Set(["node:buffer", "node:querystring"]);
const VIRTUAL_PREFIX = "\0jco-node-builtin:";
const UNENV_BUFFER_CORE = `${VIRTUAL_PREFIX}unenv-buffer-core`;

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

function unenvModule(specifier: string, options: NodeBuiltinOptions): string {
    const resolved = getUnenvAliases(options)[specifier];
    if (!resolved || resolved.startsWith("node:")) {
        throw new Error(`unenv did not provide a bundleable implementation for audited builtin ${specifier}`);
    }
    return resolved;
}

function unenvAdapter(specifier: string, options: NodeBuiltinOptions): string {
    if (specifier === "node:buffer") {
        return `
export { default } from ${JSON.stringify(UNENV_BUFFER_CORE)};
export * from ${JSON.stringify(UNENV_BUFFER_CORE)};
`;
    }
    if (specifier === "node:querystring") {
        const querystringModule = unenvModule(specifier, options);
        return `
import ${JSON.stringify(UNENV_BUFFER_CORE)};
import querystring from ${JSON.stringify(querystringModule)};
export * from ${JSON.stringify(querystringModule)};
export default querystring;
`;
    }
    throw new Error(`missing Jco adapter for audited unenv builtin ${specifier}`);
}

function unenvBufferCore(options: NodeBuiltinOptions): string {
    // Implementation source: unenv@2.0.0-rc.24's
    // runtime/node/internal/buffer/buffer module, which wraps the MIT-licensed
    // Feross buffer implementation. Node-facing constants and the public export
    // shape follow Node.js v24 lib/buffer.js.
    const bufferModule = unenvModule("unenv:buffer-core", options);
    return `
import {
    Buffer as UnenvBuffer,
    INSPECT_MAX_BYTES,
    kMaxLength,
} from ${JSON.stringify(bufferModule)};
function deprecatedBufferConstructor() {
    const error = new Error("The deprecated Buffer() constructor is not supported; use Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() instead");
    error.code = "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API";
    throw error;
}
function unsupported(api) {
    const error = new Error(api + " is not supported by the Jco component runtime");
    error.code = "ERR_JCO_UNSUPPORTED_NODE_API";
    throw error;
}
export const Buffer = new Proxy(UnenvBuffer, {
    apply: deprecatedBufferConstructor,
    construct: deprecatedBufferConstructor,
});
Buffer.prototype.constructor = Buffer;
// TypedArray-derived methods must allocate through the upstream implementation,
// not the deprecated-constructor guard exposed to users.
Object.defineProperty(Buffer, Symbol.species, { value: UnenvBuffer });
export const SlowBuffer = new Proxy(function SlowBuffer() {}, {
    apply: deprecatedBufferConstructor,
    construct: deprecatedBufferConstructor,
});
export const Blob = globalThis.Blob ?? class Blob {
    constructor() { unsupported("buffer.Blob"); }
};
export const File = globalThis.File ?? class File {
    constructor() { unsupported("buffer.File"); }
};
export { INSPECT_MAX_BYTES, kMaxLength };
export const kStringMaxLength = 536870888;
export const constants = {
    MAX_LENGTH: Number.MAX_SAFE_INTEGER,
    MAX_STRING_LENGTH: kStringMaxLength,
};
export const atob = globalThis.atob?.bind(globalThis) ?? ((value) => UnenvBuffer.from(value, "base64").toString("latin1"));
export const btoa = globalThis.btoa?.bind(globalThis) ?? ((value) => UnenvBuffer.from(value, "latin1").toString("base64"));
export const isAscii = () => unsupported("buffer.isAscii");
export const isUtf8 = () => unsupported("buffer.isUtf8");
export const resolveObjectURL = () => unsupported("buffer.resolveObjectURL");
export const transcode = () => unsupported("buffer.transcode");
globalThis.Buffer = Buffer;
export default {
    atob,
    Blob,
    Buffer,
    btoa,
    constants,
    File,
    INSPECT_MAX_BYTES,
    isAscii,
    isUtf8,
    kMaxLength,
    kStringMaxLength,
    resolveObjectURL,
    SlowBuffer,
    transcode,
};
`;
}

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
    /** Path to jco-std's `wasi/0.2.x/node/24.x.x/path` module (overridable for tests) */
    pathFactory?: string;
    /** Path to jco-std's `wasi/0.2.x/node/24.x.x/assert` module (overridable for tests) */
    assertModule?: string;
    /** Path to jco-std's versioned `node:child_process` module (overridable for tests) */
    childProcessModule?: string;
    /** Path to jco-std's versioned `node:cluster` module (overridable for tests) */
    clusterModule?: string;
    /** Reports WIT imports required by builtins found while bundling. */
    onWitRequirement?: (requirement: NodeWitRequirement) => void;
    /** unenv aliases to resolve audited builtins against (overridable for tests) */
    unenvAliases?: Readonly<Record<string, string>>;
}

/**
 * Source of the `node:cluster` adapter.
 *
 * Like `node:child_process`, the jco-std module imports the host interface itself, so the adapter
 * only has to re-export Node's module shape.
 */
function clusterAdapter(clusterModule: string): string {
    return `
import cluster from ${JSON.stringify(clusterModule)};
export default cluster;
export {
    SCHED_NONE,
    SCHED_RR,
    Worker,
    disconnect,
    fork,
    setupMaster,
    setupPrimary,
} from ${JSON.stringify(clusterModule)};
`;
}

function childProcessAdapter(childProcessModule: string): string {
    return `
import childProcess from ${JSON.stringify(childProcessModule)};
export default childProcess;
export {
    ChildProcess,
    exec,
    execFile,
    execFileSync,
    execSync,
    fork,
    spawn,
    spawnSync,
} from ${JSON.stringify(childProcessModule)};
`;
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

/** Source of a `node:assert` or `node:assert/strict` adapter */
function assertAdapter(specifier: string, assertModule: string): string {
    if (specifier === "node:assert") {
        return `
import assert from ${JSON.stringify(assertModule)};
export default assert;
export {
    Assert,
    AssertionError,
    CallTracker,
    deepEqual,
    deepStrictEqual,
    doesNotMatch,
    doesNotReject,
    doesNotThrow,
    equal,
    fail,
    ifError,
    match,
    notDeepEqual,
    notDeepStrictEqual,
    notEqual,
    notStrictEqual,
    ok,
    partialDeepStrictEqual,
    rejects,
    strict,
    strictEqual,
    throws,
} from ${JSON.stringify(assertModule)};
`;
    }
    return `
import { strict } from ${JSON.stringify(assertModule)};
export default strict;
export const Assert = strict.Assert;
export const AssertionError = strict.AssertionError;
export const CallTracker = strict.CallTracker;
export const deepEqual = strict.deepEqual;
export const deepStrictEqual = strict.deepStrictEqual;
export const doesNotMatch = strict.doesNotMatch;
export const doesNotReject = strict.doesNotReject;
export const doesNotThrow = strict.doesNotThrow;
export const equal = strict.equal;
export const fail = strict.fail;
export const ifError = strict.ifError;
export const match = strict.match;
export const notDeepEqual = strict.notDeepEqual;
export const notDeepStrictEqual = strict.notDeepStrictEqual;
export const notEqual = strict.notEqual;
export const notStrictEqual = strict.notStrictEqual;
export const ok = strict.ok;
export const partialDeepStrictEqual = strict.partialDeepStrictEqual;
export const rejects = strict.rejects;
export { strict };
export const strictEqual = strict.strictEqual;
export const throws = strict.throws;
`;
}

/** Create Jco's virtual adapters for supported Node builtins. */
export function nodeBuiltinPlugin(worldMetadata: WorldMetadata, options: NodeBuiltinOptions = {}): Plugin {
    // NOTE: jco-std namespaces these by the WASI version they adapt Node to and then by the
    // Node major: `wasi/0.2.x/node/24.x.x/*`. Both axes move independently -- Node's builtin
    // semantics change across majors, and the same module adapted to WASI p3 is a different
    // implementation -- so both are pinned here rather than resolved through an unversioned
    // alias. Selecting either at build time, or detecting them, is future work.
    const pathFactory = () =>
        options.pathFactory ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/path"));
    const assertModule = () =>
        options.assertModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/assert"));
    const clusterModule = () =>
        options.clusterModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/cluster"));
    const childProcessModule = () =>
        options.childProcessModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process"));
    return {
        name: "jco-node-builtins",
        resolveId(id) {
            if (id.startsWith(VIRTUAL_PREFIX)) {
                return id;
            }
            if (ASSERT_SPECIFIERS.has(id)) {
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === CLUSTER_SPECIFIER) {
                options.onWitRequirement?.(CLUSTER_WIT_REQUIREMENT);
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === CHILD_PROCESS_SPECIFIER) {
                options.onWitRequirement?.(CHILD_PROCESS_WIT_REQUIREMENT);
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (PATH_SPECIFIERS.has(id)) {
                const version = environmentVersion(worldMetadata);
                return `${VIRTUAL_PREFIX}${id}@${version}`;
            }
            if (AUDITED_UNENV_SPECIFIERS.has(id)) {
                unenvAdapter(id, options);
                return `${VIRTUAL_PREFIX}${id}`;
            }
            return null;
        },
        load(id) {
            if (!id.startsWith(VIRTUAL_PREFIX)) {
                return null;
            }
            const value = id.slice(VIRTUAL_PREFIX.length);
            if (id === UNENV_BUFFER_CORE) {
                return unenvBufferCore(options);
            }
            if (ASSERT_SPECIFIERS.has(value)) {
                return assertAdapter(value, assertModule());
            }
            if (value === CLUSTER_SPECIFIER) {
                return clusterAdapter(clusterModule());
            }
            if (value === CHILD_PROCESS_SPECIFIER) {
                return childProcessAdapter(childProcessModule());
            }
            if (AUDITED_UNENV_SPECIFIERS.has(value)) {
                return unenvAdapter(value, options);
            }
            const separator = value.lastIndexOf("@");
            const specifier = value.slice(0, separator);
            const version = value.slice(separator + 1);
            return specifier === "path-core" ? pathCore(version, pathFactory()) : pathAdapter(specifier, version);
        },
    };
}
