import { fileURLToPath } from "node:url";

import type { Plugin } from "rolldown";
import { defineEnv } from "unenv";

import {
    CHILD_PROCESS_WIT_REQUIREMENT,
    CLUSTER_WIT_REQUIREMENT,
    CONSOLE_WIT_REQUIREMENT,
    DNS_PROMISES_WIT_REQUIREMENT,
    DNS_WIT_REQUIREMENT,
    FS_WIT_REQUIREMENT,
    FFI_WIT_REQUIREMENT,
    OS_WIT_REQUIREMENT,
    type NodeWitRequirement,
} from "./node-wit.js";

const PATH_SPECIFIERS = new Map([
    ["node:path", "default"],
    ["node:path/posix", "posix"],
    ["node:path/win32", "win32"],
]);
const ASSERT_SPECIFIERS = new Set(["node:assert", "node:assert/strict"]);
const CHILD_PROCESS_SPECIFIER = "node:child_process";
const CLUSTER_SPECIFIER = "node:cluster";
const CONSOLE_SPECIFIER = "node:console";
const FS_SPECIFIERS = new Set(["node:fs", "node:fs/promises"]);
const ASYNC_HOOKS_SPECIFIER = "node:async_hooks";
const DOMAIN_SPECIFIER = "node:domain";
const FFI_SPECIFIER = "node:ffi";
const DIAGNOSTICS_CHANNEL_SPECIFIER = "node:diagnostics_channel";
const EVENTS_SPECIFIER = "node:events";
const OS_SPECIFIER = "node:os";
const DNS_SPECIFIERS = new Set(["node:dns", "node:dns/promises"]);
const AUDITED_UNENV_SPECIFIERS = new Set(["node:buffer", "node:querystring"]);
const VIRTUAL_PREFIX = "\0jco-node-builtin:";
const UNENV_BUFFER_CORE = `${VIRTUAL_PREFIX}unenv-buffer-core`;
const ERROR_GLOBALS_SPECIFIER = "jco:node-error-globals";
const ERROR_GLOBALS_MODULE = `${VIRTUAL_PREFIX}error-globals`;

const NODE_ERROR_GLOBAL_NAMES = [
    "AggregateError",
    "DOMException",
    "Error",
    "EvalError",
    "RangeError",
    "ReferenceError",
    "SuppressedError",
    "SyntaxError",
    "TypeError",
    "URIError",
] as const;

export interface NodeErrorGlobalsOptions {
    /** Path to jco-std's versioned Errors globals module (overridable for tests). */
    errorsModule?: string;
}

export interface NodeGlobalsOptions extends NodeErrorGlobalsOptions {
    /** Path to Jco's audited `node:buffer` adapter (overridable for tests). */
    bufferModule?: string;
}

/**
 * Rolldown injection map for Node's global error constructors.
 *
 * Injection is demand-driven: if source never references one of these globals,
 * Rolldown does not include the errors module in the generated bundle.
 */
export function nodeErrorGlobals(
    options: NodeErrorGlobalsOptions = {},
): Record<string, [module: string, exportName: string]> {
    const errorsModule = options.errorsModule ?? ERROR_GLOBALS_SPECIFIER;
    return Object.fromEntries(NODE_ERROR_GLOBAL_NAMES.map((name) => [name, [errorsModule, name]]));
}

/**
 * Rolldown injection map for Node globals backed by Jco implementations.
 *
 * Web globals already supplied by the component engine are intentionally absent.
 * Rolldown includes these adapters only when their free identifiers survive bundling.
 */
export function nodeGlobals(options: NodeGlobalsOptions = {}): Record<string, [module: string, exportName: string]> {
    return {
        ...nodeErrorGlobals(options),
        Buffer: [options.bufferModule ?? "node:buffer", "Buffer"],
    };
}

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
    /** Path to jco-std's versioned `node:console` module (overridable for tests) */
    consoleModule?: string;
    /** Path to jco-std's versioned `node:fs` module (overridable for tests) */
    fsModule?: string;
    /** Path to jco-std's versioned `node:fs/promises` module (overridable for tests) */
    fsPromisesModule?: string;
    /** Path to jco-std's versioned `node:async_hooks` module (overridable for tests) */
    asyncHooksModule?: string;
    /** Path to jco-std's versioned `node:domain` module (overridable for tests) */
    domainModule?: string;
    /** Path to jco-std's versioned `node:ffi` module (overridable for tests) */
    ffiModule?: string;
    /** Path to jco-std's versioned `node:diagnostics_channel` module (overridable for tests) */
    diagnosticsChannelModule?: string;
    /** Path to jco-std's versioned Errors globals module (overridable for tests) */
    errorsModule?: string;
    /** Path to jco-std's versioned `node:events` module (overridable for tests) */
    eventsModule?: string;
    /** Path to jco-std's versioned `node:os` module (overridable for tests) */
    osModule?: string;
    /** Paths to jco-std's versioned DNS modules (overridable for tests) */
    dnsModule?: string;
    dnsPromisesModule?: string;
    /** Reports WIT imports required by builtins found while bundling. */
    onWitRequirement?: (requirement: NodeWitRequirement) => void;
    /** unenv aliases to resolve audited builtins against (overridable for tests) */
    unenvAliases?: Readonly<Record<string, string>>;
}

/**
 * Source of the `node:ffi` adapter.
 *
 * Host-backed, like `node:child_process`: WASI has no dynamic loader and a component has no host
 * address space, so the jco-std module imports the WIT interface itself and this adapter only has
 * to re-export Node's module shape.
 *
 * Note the module this resolves to lives under `node/26.x.x`: `node:ffi` does not exist in Node 24.
 */
function ffiAdapter(ffiModule: string): string {
    return `
import ffi from ${JSON.stringify(ffiModule)};
export default ffi;
export {
    DynamicLibrary,
    dlclose,
    dlopen,
    dlsym,
    exportArrayBuffer,
    exportArrayBufferView,
    exportBuffer,
    exportString,
    getCurrentEventLoop,
    getFloat32,
    getFloat64,
    getInt16,
    getInt32,
    getInt64,
    getInt8,
    getRawPointer,
    getUint16,
    getUint32,
    getUint64,
    getUint8,
    setFloat32,
    setFloat64,
    setInt16,
    setInt32,
    setInt64,
    setInt8,
    setUint16,
    setUint32,
    setUint64,
    setUint8,
    suffix,
    toArrayBuffer,
    toBuffer,
    toString,
    types,
} from ${JSON.stringify(ffiModule)};
`;
}

/**
 * Source of the `node:domain` adapter.
 *
 * Resolves so the failure can explain itself: `node:domain` is deprecated upstream and every use
 * throws. Leaving it unresolved would fail the build with an unrelated-sounding message.
 */
function domainAdapter(domainModule: string): string {
    return `
import domain from ${JSON.stringify(domainModule)};
export default domain;
export { Domain, create, createDomain } from ${JSON.stringify(domainModule)};
`;
}

/**
 * Source of the `node:diagnostics_channel` adapter.
 *
 * Capability-free: in-process publish/subscribe with no host involvement.
 */
function diagnosticsChannelAdapter(diagnosticsChannelModule: string): string {
    return `
import diagnosticsChannel from ${JSON.stringify(diagnosticsChannelModule)};
export default diagnosticsChannel;
export {
    Channel,
    TracingChannel,
    channel,
    hasSubscribers,
    subscribe,
    tracingChannel,
    unsubscribe,
} from ${JSON.stringify(diagnosticsChannelModule)};
`;
}

/**
 * Source of the `node:async_hooks` adapter.
 *
 * Capability-free: synchronous context tracking with no host involvement, so it resolves for a
 * world with no imports at all.
 */
function asyncHooksAdapter(asyncHooksModule: string): string {
    return `
import asyncHooks from ${JSON.stringify(asyncHooksModule)};
export default asyncHooks;
export {
    AsyncLocalStorage,
    AsyncResource,
    asyncWrapProviders,
    createHook,
    executionAsyncId,
    executionAsyncResource,
    triggerAsyncId,
} from ${JSON.stringify(asyncHooksModule)};
`;
}

/**
 * Source of the `node:events` adapter.
 *
 * unenv's `EventEmitter` is faithful to Node and is reused whole, including `once`, `on`,
 * `getEventListeners`, `addAbortListener` and `EventEmitterAsyncResource`. Three module-level
 * functions are not: `listenerCount` and `setMaxListeners` are `notImplemented` stubs that throw
 * when called, and `getMaxListeners` throws when handed an `EventTarget`. jco-std implements those
 * three against the core, so guests get a complete module rather than one that fails at runtime.
 *
 * @param eventsCoreModule - unenv's `node:events`, supplying `EventEmitter`
 * @param eventsModule - jco-std's `completeEvents`
 */
function eventsAdapter(eventsCoreModule: string, eventsModule: string): string {
    return `
import { completeEvents } from ${JSON.stringify(eventsModule)};
import events from ${JSON.stringify(eventsCoreModule)};
export * from ${JSON.stringify(eventsCoreModule)};
const completed = completeEvents(events);
// Explicit exports shadow the star re-export above, replacing the stubs with the real thing.
export const getMaxListeners = completed.getMaxListeners;
export const listenerCount = completed.listenerCount;
export const setMaxListeners = completed.setMaxListeners;
// Node's module object *is* the EventEmitter class, so \`events === events.EventEmitter\` holds and
// every module export is also a static. Anything reaching these through the class -- or through a
// captured default export -- has to see the completed versions too. Defined rather than assigned:
// unenv exposes \`getMaxListeners\` as a getter-only accessor, so assigning to it throws.
for (const [name, value] of Object.entries(completed)) {
    Object.defineProperty(events, name, { configurable: true, value, writable: true });
}
export default events;
`;
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

function dnsAdapter(dnsModule: string): string {
    return `
import dns from ${JSON.stringify(dnsModule)};
export default dns;
export * from ${JSON.stringify(dnsModule)};
`;
}

/** Source of the host-backed `node:os` ESM facade. */
function osAdapter(osModule: string): string {
    return `
import os from ${JSON.stringify(osModule)};
export default os;
export {
    EOL,
    arch,
    availableParallelism,
    constants,
    cpus,
    devNull,
    endianness,
    freemem,
    getPriority,
    homedir,
    hostname,
    loadavg,
    machine,
    networkInterfaces,
    platform,
    release,
    setPriority,
    tmpdir,
    totalmem,
    type,
    uptime,
    userInfo,
    version,
} from ${JSON.stringify(osModule)};
`;
}

/** Source of the `node:fs` and `node:fs/promises` ESM facades. */
function fsAdapter(specifier: string, fsModule: string, fsPromisesModule: string): string {
    const module = specifier === "node:fs" ? fsModule : fsPromisesModule;
    return `
import fs from ${JSON.stringify(module)};
export * from ${JSON.stringify(module)};
export default fs;
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

/** Source of the `node:console` ESM facade. */
function consoleAdapter(consoleModule: string): string {
    return `
import console from ${JSON.stringify(consoleModule)};
export default console;
export {
    Console,
    assert,
    clear,
    count,
    countReset,
    debug,
    dir,
    dirxml,
    error,
    group,
    groupCollapsed,
    groupEnd,
    info,
    log,
    profile,
    profileEnd,
    table,
    time,
    timeEnd,
    timeLog,
    timeStamp,
    trace,
    warn,
} from ${JSON.stringify(consoleModule)};
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
    // NOTE: `node:ffi` resolves under `node/26.x.x`, not 24: it does not exist in Node 24. This is
    // the first place the Node major in the path differs per module rather than per build.
    const ffiModule = () =>
        options.ffiModule ?? fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi"));
    const domainModule = () =>
        options.domainModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/domain"));
    const diagnosticsChannelModule = () =>
        options.diagnosticsChannelModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/diagnostics-channel"));
    const asyncHooksModule = () =>
        options.asyncHooksModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/async-hooks"));
    const eventsModule = () =>
        options.eventsModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/events"));
    const osModule = () =>
        options.osModule ?? fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/os"));
    const clusterModule = () =>
        options.clusterModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/cluster"));
    const childProcessModule = () =>
        options.childProcessModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process"));
    const consoleModule = () =>
        options.consoleModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console"));
    const fsModule = () =>
        options.fsModule ?? fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs"));
    const fsPromisesModule = () =>
        options.fsPromisesModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs/promises"));
    const errorsModule = () =>
        options.errorsModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/errors"));
    const dnsModule = (specifier: string) =>
        specifier === "node:dns/promises"
            ? (options.dnsPromisesModule ??
              fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dns/promises")))
            : (options.dnsModule ??
              fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dns")));
    return {
        name: "jco-node-builtins",
        resolveId(id) {
            if (id.startsWith(VIRTUAL_PREFIX)) {
                return id;
            }
            if (id === ERROR_GLOBALS_SPECIFIER) {
                return ERROR_GLOBALS_MODULE;
            }
            if (ASSERT_SPECIFIERS.has(id)) {
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === FFI_SPECIFIER) {
                options.onWitRequirement?.(FFI_WIT_REQUIREMENT);
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === DOMAIN_SPECIFIER) {
                // No onWitRequirement: nothing here reaches the host.
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === DIAGNOSTICS_CHANNEL_SPECIFIER) {
                // No onWitRequirement: this needs no host capability.
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === ASYNC_HOOKS_SPECIFIER) {
                // No onWitRequirement: this needs no host capability.
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === EVENTS_SPECIFIER) {
                // No onWitRequirement: in-process emitters need no host capability.
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === OS_SPECIFIER) {
                options.onWitRequirement?.(OS_WIT_REQUIREMENT);
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
            if (id === CONSOLE_SPECIFIER) {
                options.onWitRequirement?.(CONSOLE_WIT_REQUIREMENT);
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (DNS_SPECIFIERS.has(id)) {
                options.onWitRequirement?.(
                    id === "node:dns/promises" ? DNS_PROMISES_WIT_REQUIREMENT : DNS_WIT_REQUIREMENT,
                );
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (FS_SPECIFIERS.has(id)) {
                options.onWitRequirement?.(FS_WIT_REQUIREMENT);
                return `${VIRTUAL_PREFIX}${id}`;
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
            if (id === ERROR_GLOBALS_MODULE) {
                return `export * from ${JSON.stringify(errorsModule())};`;
            }
            if (ASSERT_SPECIFIERS.has(value)) {
                return assertAdapter(value, assertModule());
            }
            if (value === FFI_SPECIFIER) {
                return ffiAdapter(ffiModule());
            }
            if (value === DOMAIN_SPECIFIER) {
                return domainAdapter(domainModule());
            }
            if (value === DIAGNOSTICS_CHANNEL_SPECIFIER) {
                return diagnosticsChannelAdapter(diagnosticsChannelModule());
            }
            if (value === ASYNC_HOOKS_SPECIFIER) {
                return asyncHooksAdapter(asyncHooksModule());
            }
            if (value === EVENTS_SPECIFIER) {
                return eventsAdapter(unenvModule(EVENTS_SPECIFIER, options), eventsModule());
            }
            if (value === OS_SPECIFIER) {
                return osAdapter(osModule());
            }
            if (value === CLUSTER_SPECIFIER) {
                return clusterAdapter(clusterModule());
            }
            if (value === CHILD_PROCESS_SPECIFIER) {
                return childProcessAdapter(childProcessModule());
            }
            if (value === CONSOLE_SPECIFIER) {
                return consoleAdapter(consoleModule());
            }
            if (DNS_SPECIFIERS.has(value)) {
                return dnsAdapter(dnsModule(value));
            }
            if (FS_SPECIFIERS.has(value)) {
                return fsAdapter(value, fsModule(), fsPromisesModule());
            }
            if (AUDITED_UNENV_SPECIFIERS.has(value)) {
                return unenvAdapter(value, options);
            }
            const separator = value.lastIndexOf("@");
            const specifier = value.slice(0, separator);
            const version = value.slice(separator + 1);
            if (specifier === "path-core") {
                return pathCore(version, pathFactory());
            }
            return pathAdapter(specifier, version);
        },
    };
}
