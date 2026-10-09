/**
 * Type alias that represents the kind of imports that the average
 * transpiled Jco component will require.
 *
 * For example, `wasi:http/types` and `wasi:http/outgoing-handler` are present due to
 * the ability for a component to call `fetch()` at any point in time.
 *
 * While the feature can be disabled when building with `jco componentize` or `componentize-js`,
 * by default it is enabled, and as such included here (practically, the implementations can be no-ops).
 */
type _WASIImportObject = {
    'wasi:cli/environment': typeof import('./interfaces/wasi-cli-environment.d.ts');
    'wasi:cli/exit': typeof import('./interfaces/wasi-cli-exit.d.ts');
    'wasi:cli/stderr': typeof import('./interfaces/wasi-cli-stderr.d.ts');
    'wasi:cli/stdin': typeof import('./interfaces/wasi-cli-stdin.d.ts');
    'wasi:cli/stdout': typeof import('./interfaces/wasi-cli-stdout.d.ts');
    'wasi:cli/terminal-input': typeof import('./interfaces/wasi-cli-terminal-input.d.ts');
    'wasi:cli/terminal-output': typeof import('./interfaces/wasi-cli-terminal-output.d.ts');
    'wasi:cli/terminal-stderr': typeof import('./interfaces/wasi-cli-terminal-stderr.d.ts');
    'wasi:cli/terminal-stdin': typeof import('./interfaces/wasi-cli-terminal-stdin.d.ts');
    'wasi:cli/terminal-stdout': typeof import('./interfaces/wasi-cli-terminal-stdout.d.ts');

    'wasi:sockets/instance-network': typeof import('./interfaces/wasi-sockets-instance-network.d.ts');
    'wasi:sockets/ip-name-lookup': typeof import('./interfaces/wasi-sockets-ip-name-lookup.d.ts');
    'wasi:sockets/network': typeof import('./interfaces/wasi-sockets-network.d.ts');
    'wasi:sockets/tcp': typeof import('./interfaces/wasi-sockets-tcp.d.ts');
    'wasi:sockets/tcp-create-socket': typeof import('./interfaces/wasi-sockets-tcp-create-socket.d.ts');
    'wasi:sockets/udp': typeof import('./interfaces/wasi-sockets-udp.d.ts');
    'wasi:sockets/udp-create-socket': typeof import('./interfaces/wasi-sockets-udp-create-socket.d.ts');

    'wasi:filesystem/preopens': typeof import('./interfaces/wasi-filesystem-preopens.d.ts');
    'wasi:filesystem/types': typeof import('./interfaces/wasi-filesystem-types.d.ts');

    'wasi:io/error': typeof import('./interfaces/wasi-io-error.d.ts');
    'wasi:io/poll': typeof import('./interfaces/wasi-io-poll.d.ts');
    'wasi:io/streams': typeof import('./interfaces/wasi-io-streams.d.ts');

    'wasi:random/random': typeof import('./interfaces/wasi-random-random.d.ts');
    'wasi:random/insecure': typeof import('./interfaces/wasi-random-insecure.d.ts');
    'wasi:random/insecure-seed': typeof import('./interfaces/wasi-random-insecure-seed.d.ts');

    'wasi:clocks/monotonic-clock': typeof import('./interfaces/wasi-clocks-monotonic-clock.d.ts');
    'wasi:clocks/wall-clock': typeof import('./interfaces/wasi-clocks-wall-clock.d.ts');

    'wasi:http/types': typeof import('./interfaces/wasi-http-types.d.ts');
    'wasi:http/incoming-handler': typeof import('./interfaces/wasi-http-incoming-handler.d.ts');
    'wasi:http/outgoing-handler': typeof import('./interfaces/wasi-http-outgoing-handler.d.ts');
};

export type WASIImportObject = VersionedWASIImportObject<''>;

export type VersionedWASIImportObject<V extends string> = {
    [K in keyof _WASIImportObject as AppendVersion<K, V>]: _WASIImportObject[K];
};

/** Used to append versions to generated WASI import objects */
type AppendVersion<Key extends string | number | symbol, Version extends string> = Version extends ''
    ? Key
    : Version extends `${infer V}`
      ? Key extends `${infer K}`
          ? `${K}@${V}`
          : never
      : never;

/**
 * Sandbox configuration options for WASIShim
 */
export interface SandboxConfig {
    /** Filesystem-specific preopens mapping (virtual path -> host path or capability). */
    preopens?: Record<string, unknown>;
    /** Environment variables visible to the guest */
    env?: Record<string, string>;
    /** Command-line arguments */
    args?: string[];
    /** Whether to enable network access (sockets, HTTP). Default: true */
    enableNetwork?: boolean;
}

/**
 * Application-provided implementation of the two `wasi:filesystem` namespaces.
 * Browser applications can use this boundary to select their own storage and
 * permission model without the shim choosing a filesystem implementation.
 */
export interface FilesystemShim {
    preopens: typeof import('./interfaces/wasi-filesystem-preopens.d.ts');
    types: typeof import('./interfaces/wasi-filesystem-types.d.ts');
    /** Interpret sandbox preopen properties and return this filesystem's preopens namespace. */
    createPreopens?(
        preopens: Record<string, unknown>,
    ): typeof import('./interfaces/wasi-filesystem-preopens.d.ts');
    dispose?(): void;
}

/** Application-provided implementation of the WASI TCP namespaces. */
export interface TcpSocketsShim {
    tcp: typeof import('./interfaces/wasi-sockets-tcp.d.ts');
    tcpCreateSocket: typeof import('./interfaces/wasi-sockets-tcp-create-socket.d.ts');
}

/** Application-provided implementation of the WASI UDP namespaces. */
export interface UdpSocketsShim {
    udp: typeof import('./interfaces/wasi-sockets-udp.d.ts');
    udpCreateSocket: typeof import('./interfaces/wasi-sockets-udp-create-socket.d.ts');
}

/** Browser HTTP handler using standard Web Request and Response objects. */
export type WebIncomingHandler = (request: Request) => Response | Promise<Response>;

/**
 * Configuration options for WASIShim
 */
export interface WASIShimConfig {
    /** Custom CLI shim */
    cli?: object;
    /** Application-provided filesystem namespaces. */
    filesystem?: FilesystemShim;
    /** Explicit ephemeral browser file-data adapter and guest-path mappings. */
    browserFilesystem?: {
        adapter: object;
        preopens: Record<string, unknown>;
    };
    /** Custom I/O shim */
    io?: object;
    /** Custom random shim */
    random?: object;
    /** Custom clocks shim */
    clocks?: object;
    /** Custom sockets shim */
    sockets?: object;
    /** Custom TCP socket namespaces. */
    tcpSockets?: TcpSocketsShim;
    /** Custom UDP socket namespaces. */
    udpSockets?: UdpSocketsShim;
    /** Custom HTTP shim */
    http?: object;
    /** Browser incoming HTTP handler. */
    incomingHandler?: WebIncomingHandler;
    /** Browser-only isolated environment variables. */
    environment?: Record<string, string>;
    /** Browser-only isolated command-line arguments. */
    arguments?: string[];
    /** Browser-only initial working directory. */
    initialCwd?: string;
    /** Browser input stream handler. */
    stdin?: object;
    /** Browser output stream handler. */
    stdout?: object;
    /** Browser error stream handler. */
    stderr?: object;
    /** Sandbox configuration for restricting guest capabilities */
    sandbox?: SandboxConfig;
}

/**
 * Options accepted by `WASIShim.getImportObject`. `V` is inferred from
 * `asVersion` so the returned `VersionedWASIImportObject<V>` always matches
 * the version actually requested.
 */
export interface GetImportObjectArgs<V extends string = string> {
    asVersion?: V;
}
