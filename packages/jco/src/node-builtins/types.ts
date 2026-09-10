import { type NodeWitRequirement } from "../node-wit.js";

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
    /** Path to the versioned perf_hooks implementation (overridable for tests). */
    perfHooksModule?: string;
    /** Paths to the versioned timer modules (overridable for tests). */
    timersModule?: string;
    timersPromisesModule?: string;
    /** Path to jco-std's versioned `node:inspector/promises` module (overridable for tests) */
    inspectorPromisesModule?: string;
    /** Path to jco-std's versioned `node:module` module (overridable for tests) */
    moduleModule?: string;
    /** Path to jco-std's versioned `node:diagnostics_channel` module (overridable for tests) */
    diagnosticsChannelModule?: string;
    /** Path to the native Abort globals compatibility adapter (overridable for tests). */
    abortGlobalsModule?: string;
    /** Path to jco-std's versioned Errors globals module (overridable for tests) */
    errorsModule?: string;
    /** Path to jco-std's versioned `node:events` module (overridable for tests) */
    eventsModule?: string;
    /** Path to jco-std's versioned `node:os` module (overridable for tests) */
    osModule?: string;
    /** Path to the versioned node:sqlite guest module. */
    sqliteModule?: string;
    /** Override the lazy node:process facade for integration tests. */
    processModule?: string;
    /** Path to jco-std's versioned `node:string_decoder` module (overridable for tests) */
    stringDecoderModule?: string;
    /** Path to jco-std's versioned `node:tty` module (overridable for tests) */
    ttyModule?: string;
    /** Paths to jco-std's capability-free readline modules (overridable for tests). */
    readlineModule?: string;
    readlinePromisesModule?: string;
    /** Path to jco-std's capability-free `node:repl` module (overridable for tests). */
    replModule?: string;
    /** Paths to jco-std's versioned stream modules (overridable for tests) */
    streamModule?: string;
    streamPromisesModule?: string;
    streamSchedulerModule?: string;
    streamEmitterModule?: string;
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
    /** Path to jco-std's portable `node:net` core module (overridable for tests). */
    netCoreModule?: string;
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

export interface NodeErrorGlobalsOptions {
    /** Path to jco-std's versioned Errors globals module (overridable for tests). */
    errorsModule?: string;
}

export interface NodeGlobalsOptions extends NodeErrorGlobalsOptions {
    /** Path to the native Abort globals compatibility adapter (overridable for tests). */
    abortGlobalsModule?: string;
    /** Path to Jco's audited `node:buffer` adapter (overridable for tests). */
    bufferModule?: string;
}
