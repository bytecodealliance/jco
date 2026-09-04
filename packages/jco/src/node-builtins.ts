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
    HTTP_WASI_HTTP_WIT_REQUIREMENTS,
    HTTP_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS,
    HTTP_WASI_SOCKETS_WIT_REQUIREMENTS,
    HTTP_WIT_REQUIREMENT,
    HTTPS_WASI_HTTP_WIT_REQUIREMENTS,
    HTTPS_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS,
    HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS,
    HTTPS_WIT_REQUIREMENT,
    HTTP2_WIT_REQUIREMENT,
    INSPECTOR_PROMISES_WIT_REQUIREMENT,
    INSPECTOR_WIT_REQUIREMENT,
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
const INSPECTOR_SPECIFIER = "node:inspector";
const INSPECTOR_PROMISES_SPECIFIER = "node:inspector/promises";
const INSPECTOR_SPECIFIERS = new Set([INSPECTOR_SPECIFIER, INSPECTOR_PROMISES_SPECIFIER]);
/**
 * Virtual specifier the two-pass bundler imports to reach the guest-exported callbacks interface.
 *
 * `node:inspector` is host-backed, but the host also has to call *back* into the component. A
 * component cannot implement a resource on an imported interface, so the callbacks live in a
 * guest-exported interface, and this virtual module re-exports its implementation from the shared
 * jco-std inspector module so the wrapper can add it to the component's top-level exports.
 */
export const INSPECTOR_CALLBACKS_SPECIFIER = "jco:node-inspector-callbacks";
const MODULE_SPECIFIER = "node:module";
const DIAGNOSTICS_CHANNEL_SPECIFIER = "node:diagnostics_channel";
const EVENTS_SPECIFIER = "node:events";
const OS_SPECIFIER = "node:os";
const STRING_DECODER_SPECIFIER = "node:string_decoder";
const STREAM_CONSUMERS_SPECIFIER = "node:stream/consumers";
const STREAM_ITER_SPECIFIER = "node:stream/iter";
const DNS_SPECIFIERS = new Set(["node:dns", "node:dns/promises"]);
const HTTP_SPECIFIER = "node:http";
const HTTPS_SPECIFIER = "node:https";
export const HTTP_CALLBACKS_SPECIFIER = "jco:node-http-callbacks";
const HTTP2_SPECIFIER = "node:http2";
export const HTTP2_CALLBACKS_SPECIFIER = "jco:node-http2-callbacks";
const AUDITED_UNENV_SPECIFIERS = new Set(["node:buffer", "node:querystring"]);
const VIRTUAL_PREFIX = "\0jco-node-builtin:";
const INSPECTOR_CALLBACKS_MODULE = `${VIRTUAL_PREFIX}inspector-callbacks`;
const HTTP_CALLBACKS_MODULE = `${VIRTUAL_PREFIX}http-callbacks`;
const HTTP2_CALLBACKS_MODULE = `${VIRTUAL_PREFIX}http2-callbacks`;
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
    /** Path to jco-std's versioned `node:inspector` module (overridable for tests) */
    inspectorModule?: string;
    /** Path to jco-std's versioned `node:inspector/promises` module (overridable for tests) */
    inspectorPromisesModule?: string;
    /** Path to jco-std's versioned `node:module` module (overridable for tests) */
    moduleModule?: string;
    /** Path to jco-std's versioned `node:diagnostics_channel` module (overridable for tests) */
    diagnosticsChannelModule?: string;
    /** Path to jco-std's versioned Errors globals module (overridable for tests) */
    errorsModule?: string;
    /** Path to jco-std's versioned `node:events` module (overridable for tests) */
    eventsModule?: string;
    /** Path to jco-std's versioned `node:os` module (overridable for tests) */
    osModule?: string;
    /** Path to jco-std's versioned `node:string_decoder` module (overridable for tests) */
    stringDecoderModule?: string;
    /** Paths to jco-std's versioned stream modules (overridable for tests) */
    streamConsumersModule?: string;
    streamIterModule?: string;
    /** Paths to jco-std's versioned DNS modules (overridable for tests) */
    dnsModule?: string;
    dnsPromisesModule?: string;
    /** Implementation used for `node:http` host operations. */
    nodejsHttpVia?: NodejsHttpVia;
    /** Paths to jco-std's HTTP modules (overridable for tests). */
    httpModule?: string;
    httpCoreModule?: string;
    httpWasiSocketsImplementationModule?: string;
    httpWasiHttpImplementationModule?: string;
    /** Paths to jco-std's HTTPS modules (overridable for tests). */
    httpsModule?: string;
    httpsCoreModule?: string;
    /** Implementation used for `node:http2` host operations. */
    nodejsHttp2Via?: NodejsHttp2Via;
    /** WASI socket module version supplied by the selected component engine. */
    wasiSocketsVersion?: "0.2.10" | "0.2.12";
    /** Paths to jco-std's HTTP/2 modules (overridable for tests). */
    http2Module?: string;
    http2CoreModule?: string;
    http2WasiSocketsImplementationModule?: string;
    http2WasiHttpImplementationModule?: string;
    /** Reports WIT imports required by builtins found while bundling. */
    onWitRequirement?: (requirement: NodeWitRequirement) => void;
    /** unenv aliases to resolve audited builtins against (overridable for tests) */
    unenvAliases?: Readonly<Record<string, string>>;
}

export type NodejsHttpVia = "direct" | "wasi-sockets" | "wasi-http";
export type NodejsHttp2Via = NodejsHttpVia;

/**
 * Source of the `node:module` adapter.
 *
 * Capability-free: what this module can do here is classification and source-map arithmetic, and
 * what it cannot do -- loading -- no host could supply, because the missing piece is the guest
 * engine's ability to instantiate code that was not bundled.
 */
function moduleAdapter(moduleModule: string): string {
    return `
import nodeModule from ${JSON.stringify(moduleModule)};
export default nodeModule;
export {
    Module,
    SourceMap,
    _cache,
    _debug,
    _extensions,
    _findPath,
    _initPaths,
    _load,
    _nodeModulePaths,
    _pathCache,
    _preloadModules,
    _readPackage,
    _resolveFilename,
    _resolveLookupPaths,
    _stat,
    builtinModules,
    constants,
    createRequire,
    enableCompileCache,
    findPackageJSON,
    findSourceMap,
    flushCompileCache,
    getCompileCacheDir,
    getSourceMapsSupport,
    globalPaths,
    isBuiltin,
    register,
    registerHooks,
    runMain,
    setSourceMapsSupport,
    stripTypeScriptTypes,
    syncBuiltinESMExports,
    wrap,
    wrapper,
} from ${JSON.stringify(moduleModule)};
`;
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
 * Source of the `node:inspector` adapter.
 *
 * Host-backed like `node:ffi`, but with a second half: the host also calls *back* into the
 * component when a protocol response or notification arrives. That channel is the guest-exported
 * `inspectorCallbacks` interface, added to the component's exports by Jco's two-pass bundling; this
 * adapter only re-exports the module surface.
 */
function inspectorAdapter(inspectorModule: string): string {
    return `
import inspector from ${JSON.stringify(inspectorModule)};
export default inspector;
export {
    close,
    console,
    DOMStorage,
    Network,
    NetworkResources,
    open,
    Session,
    url,
    waitForDebugger,
} from ${JSON.stringify(inspectorModule)};
`;
}

/**
 * Source of the `node:inspector/promises` adapter, sharing one core with `node:inspector`.
 *
 * The promises entry point re-exports the same public surface as `node:inspector`, so the adapter
 * source is identical apart from the module it points at.
 */
function inspectorPromisesAdapter(inspectorPromisesModule: string): string {
    return inspectorAdapter(inspectorPromisesModule);
}

/**
 * Source of the virtual module the two-pass bundler exports to satisfy the guest-exported
 * `jco:node/inspector-callbacks@0.1.0` interface.
 *
 * Always pulls from the base `node:inspector` module (not `/promises`), which owns the one callback
 * registry both entries register into.
 */
function inspectorCallbacksAdapter(inspectorModule: string): string {
    return `export { inspectorCallbacks } from ${JSON.stringify(inspectorModule)};`;
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

/** Source of the capability-free `node:string_decoder` ESM facade. */
function stringDecoderAdapter(stringDecoderModule: string): string {
    return `
import stringDecoder from ${JSON.stringify(stringDecoderModule)};
export default stringDecoder;
export { StringDecoder } from ${JSON.stringify(stringDecoderModule)};
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

/**
 * Source of an adapter that forwards a module's default export and re-exports its whole named
 * surface. `localName` only names the default-import binding in the generated source.
 */
function starReexportAdapter(module: string, localName: string): string {
    return `
import ${localName} from ${JSON.stringify(module)};
export default ${localName};
export * from ${JSON.stringify(module)};
`;
}

/** Source of a capability-free Node stream submodule adapter. */
function streamAdapter(module: string): string {
    return starReexportAdapter(module, "streamModule");
}

function dnsAdapter(dnsModule: string): string {
    return starReexportAdapter(dnsModule, "dns");
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

const HTTP_EXPORTS = [
    "Agent",
    "ClientRequest",
    "CloseEvent",
    "IncomingMessage",
    "METHODS",
    "MessageEvent",
    "OutgoingMessage",
    "STATUS_CODES",
    "Server",
    "ServerResponse",
    "WebSocket",
    "_connectionListener",
    "createServer",
    "get",
    "globalAgent",
    "maxHeaderSize",
    "request",
    "setGlobalProxyFromEnv",
    "setMaxIdleHTTPParsers",
    "validateHeaderName",
    "validateHeaderValue",
] as const;

/** `node:https` at the pinned release: six exports, no deprecated members. */
const HTTPS_EXPORTS = ["Agent", "Server", "createServer", "get", "globalAgent", "request"] as const;

/** The two protocol modules share one core, one implementation set, and one host interface. */
type HttpProtocol = "http" | "https";

const PROTOCOL_EXPORTS: Record<HttpProtocol, readonly string[]> = {
    http: HTTP_EXPORTS,
    https: HTTPS_EXPORTS,
};

/** Factory exported by the protocol's core module (`createHttp` / `createHttps`). */
const PROTOCOL_FACTORY: Record<HttpProtocol, string> = { http: "createHttp", https: "createHttps" };

function protocolExports(protocol: HttpProtocol, moduleExpression: string): string {
    return `
const ${protocol} = ${moduleExpression};
export default ${protocol};
export const { ${PROTOCOL_EXPORTS[protocol].join(", ")} } = ${protocol};
`;
}

function protocolDirectAdapter(protocol: HttpProtocol, entryModule: string): string {
    return `
import direct from ${JSON.stringify(entryModule)};
${protocolExports(protocol, "direct")}
`;
}

/** Source for the guest-exported HTTP callback interface used by the component entry wrapper. */
function httpCallbacksAdapter(httpModule: string): string {
    return `export { httpCallbacks } from ${JSON.stringify(httpModule)};`;
}

function protocolWasiSocketsAdapter(
    protocol: HttpProtocol,
    coreModule: string,
    implementationModule: string,
    version: string,
): string {
    const factory = PROTOCOL_FACTORY[protocol];
    const schedule = version === "0.2.10" ? ", schedule: task => setTimeout(task, 0)" : "";
    return `
import * as instanceNetwork from "wasi:sockets/instance-network@${version}";
import * as ipNameLookup from "wasi:sockets/ip-name-lookup@${version}";
import * as tcpCreateSocket from "wasi:sockets/tcp-create-socket@${version}";
import { ${factory} } from ${JSON.stringify(coreModule)};
import { createWasiSocketsHttpImplementation } from ${JSON.stringify(implementationModule)};
${protocolExports(protocol, `${factory}(createWasiSocketsHttpImplementation({ instanceNetwork, ipNameLookup, tcpCreateSocket, u64: value => ${version === "0.2.10" ? "BigInt(value)" : "value"}${schedule} }))`)}
`;
}

function protocolWasiHttpAdapter(protocol: HttpProtocol, coreModule: string, implementationModule: string): string {
    const factory = PROTOCOL_FACTORY[protocol];
    return `
import * as outgoingHandler from "wasi:http/outgoing-handler@0.2.12";
import * as types from "wasi:http/types@0.2.12";
import { ${factory} } from ${JSON.stringify(coreModule)};
import { createWasiHttpImplementation } from ${JSON.stringify(implementationModule)};
${protocolExports(protocol, `${factory}(createWasiHttpImplementation({ outgoingHandler, types }))`)}
`;
}

/** WIT requirements for one protocol module under one `--with-nodejs-http-via` selection. */
function protocolWitRequirements(
    protocol: HttpProtocol,
    via: NodejsHttpVia,
    wasiSocketsVersion: string,
): readonly NodeWitRequirement[] {
    const https = protocol === "https";
    if (via === "direct") {
        return [https ? HTTPS_WIT_REQUIREMENT : HTTP_WIT_REQUIREMENT];
    }
    if (via === "wasi-sockets") {
        if (wasiSocketsVersion === "0.2.12") {
            return https ? HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS : HTTP_WASI_SOCKETS_WIT_REQUIREMENTS;
        }
        return https ? HTTPS_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS : HTTP_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS;
    }
    return https ? HTTPS_WASI_HTTP_WIT_REQUIREMENTS : HTTP_WASI_HTTP_WIT_REQUIREMENTS;
}

const HTTP2_EXPORTS = [
    "Http2ServerRequest",
    "Http2ServerResponse",
    "connect",
    "constants",
    "createSecureServer",
    "createServer",
    "getDefaultSettings",
    "getPackedSettings",
    "getUnpackedSettings",
    "performServerHandshake",
    "sensitiveHeaders",
] as const;

function http2Exports(moduleExpression: string): string {
    return `
const http2 = ${moduleExpression};
export default http2;
export const { ${HTTP2_EXPORTS.join(", ")} } = http2;
`;
}

function http2DirectAdapter(http2Module: string): string {
    return `
import directHttp2 from ${JSON.stringify(http2Module)};
${http2Exports("directHttp2")}
`;
}

/** Source for the guest-exported HTTP/2 callback interface used by the component entry wrapper. */
function http2CallbacksAdapter(http2Module: string): string {
    return `export { http2Callbacks } from ${JSON.stringify(http2Module)};`;
}

function http2PortableAdapter(
    coreModule: string,
    implementationModule: string,
    via: Exclude<NodejsHttp2Via, "direct">,
    version: string,
): string {
    const factory =
        via === "wasi-sockets" ? "createWasiSocketsHttp2Implementation" : "createWasiHttpHttp2Implementation";
    const provider =
        via === "wasi-sockets"
            ? `
import * as instanceNetwork from "wasi:sockets/instance-network@${version}";
import * as ipNameLookup from "wasi:sockets/ip-name-lookup@${version}";
import * as tcpCreateSocket from "wasi:sockets/tcp-create-socket@${version}";
`
            : "";
    const factoryArguments =
        via === "wasi-sockets"
            ? `{ instanceNetwork, ipNameLookup, tcpCreateSocket, u64: value => ${version === "0.2.10" ? "BigInt(value)" : "value"}${version === "0.2.10" ? ", schedule: task => setTimeout(task, 0)" : ""} }`
            : "";
    return `
${provider}
import { createHttp2 } from ${JSON.stringify(coreModule)};
import { ${factory} } from ${JSON.stringify(implementationModule)};
${http2Exports(`createHttp2(${factory}(${factoryArguments}))`)}
`;
}

function requireWasiHttpVersion(
    worldMetadata: WorldMetadata,
    specifier: string,
    via: Exclude<NodejsHttpVia, "direct">,
    version = "0.2.12",
): void {
    const packageName = via === "wasi-http" ? "http" : "sockets";
    const incompatible = (worldMetadata.imports ?? []).find(
        (iface) =>
            iface.namespace === "wasi" &&
            iface.package === packageName &&
            iface.version !== null &&
            iface.version !== undefined &&
            `${iface.version.major}.${iface.version.minor}.${iface.version.patch}` !== version,
    );
    if (incompatible) {
        const { major, minor, patch } = incompatible.version!;
        throw new Error(
            `${specifier} via ${via} requires wasi:${packageName}@${version}, but the selected WIT world imports wasi:${packageName}@${major}.${minor}.${patch}`,
        );
    }
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
    // Resolve a jco-std module under `wasi/0.2.x/node/<major>.x.x/<subpath>` unless a test override
    // is supplied. Resolution stays lazy (a thunk) so nothing touches the package until a builtin
    // is actually bundled.
    const stdModule = (override: string | undefined, subpath: string, major = "24.x.x"): string =>
        override ?? fileURLToPath(import.meta.resolve(`@bytecodealliance/jco-std/wasi/0.2.x/node/${major}/${subpath}`));
    const pathFactory = () => stdModule(options.pathFactory, "path");
    const assertModule = () => stdModule(options.assertModule, "assert");
    const moduleModule = () => stdModule(options.moduleModule, "module");
    // NOTE: `node:ffi` resolves under `node/26.x.x`, not 24: it does not exist in Node 24. This is
    // the first place the Node major in the path differs per module rather than per build.
    const ffiModule = () => stdModule(options.ffiModule, "ffi", "26.x.x");
    const inspectorModule = () => stdModule(options.inspectorModule, "inspector");
    const inspectorPromisesModule = () => stdModule(options.inspectorPromisesModule, "inspector/promises");
    const domainModule = () => stdModule(options.domainModule, "domain");
    const diagnosticsChannelModule = () => stdModule(options.diagnosticsChannelModule, "diagnostics-channel");
    const asyncHooksModule = () => stdModule(options.asyncHooksModule, "async-hooks");
    const eventsModule = () => stdModule(options.eventsModule, "events");
    const osModule = () => stdModule(options.osModule, "os");
    const stringDecoderModule = () => stdModule(options.stringDecoderModule, "string-decoder");
    const streamConsumersModule = () => stdModule(options.streamConsumersModule, "stream/consumers");
    const streamIterModule = () => stdModule(options.streamIterModule, "stream/iter");
    const clusterModule = () => stdModule(options.clusterModule, "cluster");
    const childProcessModule = () => stdModule(options.childProcessModule, "child-process");
    const consoleModule = () => stdModule(options.consoleModule, "console");
    const fsModule = () => stdModule(options.fsModule, "fs");
    const fsPromisesModule = () => stdModule(options.fsPromisesModule, "fs/promises");
    const errorsModule = () => stdModule(options.errorsModule, "errors");
    const dnsModule = (specifier: string) =>
        specifier === "node:dns/promises"
            ? stdModule(options.dnsPromisesModule, "dns/promises")
            : stdModule(options.dnsModule, "dns");
    const httpModule = () => stdModule(options.httpModule, "http");
    const httpCoreModule = () => stdModule(options.httpCoreModule, "http/core");
    const httpWasiSocketsImplementationModule = () =>
        stdModule(options.httpWasiSocketsImplementationModule, "http/impl/wasi-sockets");
    const httpWasiHttpImplementationModule = () =>
        stdModule(options.httpWasiHttpImplementationModule, "http/impl/wasi-http");
    const httpsModule = () => stdModule(options.httpsModule, "https");
    const httpsCoreModule = () => stdModule(options.httpsCoreModule, "https/core");
    const httpVia = options.nodejsHttpVia ?? "direct";
    const wasiSocketsVersion = options.wasiSocketsVersion ?? "0.2.12";
    const protocolOf = (specifier: string): HttpProtocol | undefined =>
        specifier === HTTP_SPECIFIER ? "http" : specifier === HTTPS_SPECIFIER ? "https" : undefined;
    /**
     * Facade for `node:http` or `node:https` under the selected implementation. Each jco-std
     * path is resolved only on the branch that emits it, so a build never touches an entry point
     * it does not use.
     */
    const protocolAdapter = (protocol: HttpProtocol): string => {
        if (httpVia === "direct") {
            return protocolDirectAdapter(protocol, protocol === "http" ? httpModule() : httpsModule());
        }
        const coreModule = protocol === "http" ? httpCoreModule() : httpsCoreModule();
        return httpVia === "wasi-sockets"
            ? protocolWasiSocketsAdapter(
                  protocol,
                  coreModule,
                  httpWasiSocketsImplementationModule(),
                  wasiSocketsVersion,
              )
            : protocolWasiHttpAdapter(protocol, coreModule, httpWasiHttpImplementationModule());
    };
    const http2Module = () =>
        options.http2Module ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http2"));
    const http2CoreModule = () =>
        options.http2CoreModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http2/core"));
    const http2WasiSocketsImplementationModule = () =>
        options.http2WasiSocketsImplementationModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http2/impl/wasi-sockets"));
    const http2WasiHttpImplementationModule = () =>
        options.http2WasiHttpImplementationModule ??
        fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http2/impl/wasi-http"));
    const http2Via = options.nodejsHttp2Via ?? "direct";
    return {
        name: "jco-node-builtins",
        resolveId(id) {
            if (id.startsWith(VIRTUAL_PREFIX)) {
                return id;
            }
            if (id === ERROR_GLOBALS_SPECIFIER) {
                return ERROR_GLOBALS_MODULE;
            }
            if (id === HTTP_CALLBACKS_SPECIFIER) {
                return HTTP_CALLBACKS_MODULE;
            }
            if (id === HTTP2_CALLBACKS_SPECIFIER) {
                return HTTP2_CALLBACKS_MODULE;
            }
            if (ASSERT_SPECIFIERS.has(id)) {
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === MODULE_SPECIFIER) {
                // No onWitRequirement: classification and source-map arithmetic need no host, and
                // the loading half is unimplementable rather than unprovisioned.
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === FFI_SPECIFIER) {
                options.onWitRequirement?.(FFI_WIT_REQUIREMENT);
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === INSPECTOR_CALLBACKS_SPECIFIER) {
                // The two-pass wrapper's import of the guest-exported callbacks interface.
                return INSPECTOR_CALLBACKS_MODULE;
            }
            if (INSPECTOR_SPECIFIERS.has(id)) {
                options.onWitRequirement?.(
                    id === INSPECTOR_PROMISES_SPECIFIER
                        ? INSPECTOR_PROMISES_WIT_REQUIREMENT
                        : INSPECTOR_WIT_REQUIREMENT,
                );
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
            if (id === STRING_DECODER_SPECIFIER) {
                // No onWitRequirement: decoding and incomplete-byte state stay in the guest.
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === STREAM_CONSUMERS_SPECIFIER || id === STREAM_ITER_SPECIFIER) {
                // No onWitRequirement: iterable streams are entirely guest-side.
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
            const protocol = protocolOf(id);
            if (protocol !== undefined) {
                if (httpVia !== "direct") {
                    requireWasiHttpVersion(
                        worldMetadata,
                        id,
                        httpVia,
                        httpVia === "wasi-sockets" ? wasiSocketsVersion : "0.2.12",
                    );
                }
                for (const requirement of protocolWitRequirements(protocol, httpVia, wasiSocketsVersion)) {
                    options.onWitRequirement?.(requirement);
                }
                return `${VIRTUAL_PREFIX}${id}`;
            }
            if (id === HTTP2_SPECIFIER) {
                if (http2Via === "direct") {
                    options.onWitRequirement?.(HTTP2_WIT_REQUIREMENT);
                } else if (http2Via === "wasi-sockets") {
                    requireWasiHttpVersion(worldMetadata, HTTP2_SPECIFIER, http2Via, wasiSocketsVersion);
                    for (const requirement of wasiSocketsVersion === "0.2.12"
                        ? HTTP_WASI_SOCKETS_WIT_REQUIREMENTS
                        : HTTP_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS) {
                        options.onWitRequirement?.(requirement);
                    }
                }
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
            if (id === HTTP_CALLBACKS_MODULE) {
                return httpCallbacksAdapter(httpModule());
            }
            if (id === HTTP2_CALLBACKS_MODULE) {
                return http2CallbacksAdapter(http2Module());
            }
            if (ASSERT_SPECIFIERS.has(value)) {
                return assertAdapter(value, assertModule());
            }
            if (value === MODULE_SPECIFIER) {
                return moduleAdapter(moduleModule());
            }
            if (value === FFI_SPECIFIER) {
                return ffiAdapter(ffiModule());
            }
            if (id === INSPECTOR_CALLBACKS_MODULE) {
                return inspectorCallbacksAdapter(inspectorModule());
            }
            if (value === INSPECTOR_PROMISES_SPECIFIER) {
                return inspectorPromisesAdapter(inspectorPromisesModule());
            }
            if (value === INSPECTOR_SPECIFIER) {
                return inspectorAdapter(inspectorModule());
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
            if (value === STRING_DECODER_SPECIFIER) {
                return stringDecoderAdapter(stringDecoderModule());
            }
            if (value === STREAM_CONSUMERS_SPECIFIER) {
                return streamAdapter(streamConsumersModule());
            }
            if (value === STREAM_ITER_SPECIFIER) {
                return streamAdapter(streamIterModule());
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
            const protocol = protocolOf(value);
            if (protocol !== undefined) {
                return protocolAdapter(protocol);
            }
            if (value === HTTP2_SPECIFIER) {
                if (http2Via === "direct") {
                    return http2DirectAdapter(http2Module());
                }
                return http2PortableAdapter(
                    http2CoreModule(),
                    http2Via === "wasi-sockets"
                        ? http2WasiSocketsImplementationModule()
                        : http2WasiHttpImplementationModule(),
                    http2Via,
                    wasiSocketsVersion,
                );
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
