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
    'wasi:http/outgoing-handler': typeof import('./interfaces/wasi-http-outgoing-handler.d.ts');
};

type WASIImportObject = VersionedWASIImportObject<''>;

type VersionedWASIImportObject<V extends string> = {
    [K in keyof _WASIImportObject as AppendVersion<K, V>]: _WASIImportObject[K];
};

/** Used to append versions to generated WASI import objects */
type AppendVersion<
    Key extends string | number | symbol,
    Version extends string,
> = Version extends `${infer V}`
    ? Key extends `${infer K}`
        ? Key extends ''
            ? `${K}`
            : `${K}@${V}`
        : never
    : never;

/**
 * Sandbox configuration options for WASIShim
 */
interface SandboxConfig {
    /** Filesystem preopens mapping (virtual path -> host path) */
    preopens?: Record<string, string>;
    /** Environment variables visible to the guest */
    env?: Record<string, string>;
    /** Command-line arguments */
    args?: string[];
    /** Whether to enable network access (sockets, HTTP). Default: true */
    enableNetwork?: boolean;
}

/**
 * Configuration options for WASIShim
 */
interface WASIShimConfig {
    /** Custom CLI shim */
    cli?: object;
    /** Custom filesystem shim */
    filesystem?: object;
    /** Custom I/O shim */
    io?: object;
    /** Custom random shim */
    random?: object;
    /** Custom clocks shim */
    clocks?: object;
    /** Custom sockets shim */
    sockets?: object;
    /** Custom HTTP shim */
    http?: object;
    /** Sandbox configuration for restricting guest capabilities */
    sandbox?: SandboxConfig;
}

/**
 * (EXPERIMENTAL) A class that holds WASI shims and can be used to configure
 * an instantiation of a WebAssembly component transpiled with jco
 * (i.e. via `jco transpile`).
 *
 * Normally, transpiled components contain mapping for WASI interfaces
 * and/or imports that import the relevant packages (ex. `@bytecodealliance/preview2-shim/clocks`)
 * from the right sources.
 *
 * This function makes use of the `WASIShim` object to provide an object that can be easily
 * fed to the `instantiate` function produced by a transpiled component:
 *
 * ```js
 * import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation"
 * // ...
 * import { instantiate } from "path/to/transpiled/component.js"
 * // ...
 * const component = await instantiate(null, new WASIShim().getImportObject())
 * ```
 *
 * You can also replace imports that you'd like to override with custom implementations,
 * by using the `WASIShim` object directly:
 *
 * ```js
 * import { random } from "@bytecodealliance/preview2-shim"
 * import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation"
 * // ...
 * import { instantiate } from "path/to/transpiled/component.js"
 * // ...
 * const customWASIShim = new WASIShim({
 *     random: {
 *         // For these two interfaces we re-use the default provided shim
 *         random: random.random,
 *         insecure-seed: random.insecureSeed,
 *         // For insecure, we can supply our own custom implementation
 *         insecure: {
 *             ...
 *         }
 *     }
 * });
 *
 * const component = await instantiate(null, customWASIShim.getImportObject())
 * ```
 *
 * For sandboxing, you can configure preopens, environment variables, and other
 * capabilities via the `sandbox` option:
 *
 * ```js
 * import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation"
 *
 * // Fully sandboxed - no filesystem, network, or env access
 * const sandboxedShim = new WASIShim({
 *     sandbox: {
 *         preopens: {},           // No filesystem access
 *         env: {},                // No environment variables
 *         args: ['program'],      // Custom arguments
 *         enableNetwork: false,   // Disable network
 *     }
 * });
 *
 * // Limited filesystem access
 * const limitedShim = new WASIShim({
 *     sandbox: {
 *         preopens: {
 *             '/data': '/tmp/guest-data',  // Guest sees /data, maps to /tmp/guest-data
 *             '/config': '/etc/app'        // Guest sees /config, maps to /etc/app
 *         }
 *     }
 * });
 * ```
 *
 * Note that this object is similar but not identical to the Node `WASI` object --
 * it is solely concerned with shimming of preview2 when dealing with a WebAssembly
 * component transpiled by Jco. While this object *does* work with Node (and the browser)
 * semantics are not the same as Node's `WASI` object.
 *
 * @class WASIShim
 */
export class WASIShim {
    constructor(config?: WASIShimConfig);

    /**
     * Generate an import object for the shim that can be used with
     * functions like `instantiate` that are exposed from a transpiled
     * WebAssembly component.
     *
     * @param {options} [opt]
     * @returns {object}
     */
    getImportObject<V extends string = ''>(
        opts?: GetImportObjectArgs
    ): VersionedWASIImportObject<V>;
}

interface GetImportObjectArgs {
    asVersion?: string;
}
