import * as wasi from '@bytecodealliance/preview2-shim';

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
 * Note that this object is similar but not identical to the Node `WASI` object --
 * it is solely concerned with shimming of preview2 when dealing with a WebAssembly
 * component transpiled by Jco. While this object *does* work with Node (and the browser)
 * semantics are not the same as Node's `WASI` object.
 *
 * @class WASIShim
 */
export class WASIShim {
    /** Object that confirms to the shim interface for `wasi:cli` */
    #cli;
    /** Object that confirms to the shim interface for `wasi:filesystem` */
    #filesystem;
    /** Object that confirms to the shim interface for `wasi:io` */
    #io;
    /** Object that confirms to the shim interface for `wasi:random` */
    #random;
    /** Object that confirms to the shim interface for `wasi:clocks` */
    #clocks;
    /** Object that confirms to the shim interface for `wasi:sockets` */
    #sockets;
    /** Object that confirms to the shim interface for `wasi:http` */
    #http;

    constructor(shims) {
        this.#cli = shims?.cli ?? wasi.cli;
        this.#filesystem = shims?.filesystem ?? wasi.filesystem;
        this.#io = shims?.io ?? wasi.io;
        this.#random = shims?.random ?? wasi.random;
        this.#clocks = shims?.clocks ?? wasi.clocks;
        this.#sockets = shims?.sockets ?? wasi.sockets;
        this.#http = shims?.http ?? wasi.http;
    }

    /**
     * Generate an import object for the shim that can be used with
     * functions like `instantiate` that are exposed from a transpiled
     * WebAssembly component.
     *
     * @param {GetImportObjectArgs} [opts] - options for import object generation
     * @returns {WASIImportObject}
     *
     * @typedef {{
     *   asVersion?: number,
     * }} GetImportObjectArgs
     */
    getImportObject(opts) {
        const versionSuffix = opts?.asVersion ? `@${opts.asVersion}` : '';

        const obj = {};
        obj[`wasi:cli/environment${versionSuffix}`] = this.#cli.environment;
        obj[`wasi:cli/exit${versionSuffix}`] = this.#cli.exit;
        obj[`wasi:cli/stderr${versionSuffix}`] = this.#cli.stderr;
        obj[`wasi:cli/stdin${versionSuffix}`] = this.#cli.stdin;
        obj[`wasi:cli/stdout${versionSuffix}`] = this.#cli.stdout;
        obj[`wasi:cli/terminal-input${versionSuffix}`] = this.#cli.terminalInput;
        obj[`wasi:cli/terminal-output${versionSuffix}`] = this.#cli.terminalOutput;
        obj[`wasi:cli/terminal-stderr${versionSuffix}`] = this.#cli.terminalStderr;
        obj[`wasi:cli/terminal-stdin${versionSuffix}`] = this.#cli.terminalStdin;
        obj[`wasi:cli/terminal-stdout${versionSuffix}`] = this.#cli.terminalStdout;

        obj[`wasi:sockets/instance-network${versionSuffix}`] = this.#sockets.instanceNetwork;
        obj[`wasi:sockets/ip-name-lookup${versionSuffix}`] = this.#sockets.ipNameLookup;
        obj[`wasi:sockets/network${versionSuffix}`] = this.#sockets.network;
        obj[`wasi:sockets/tcp${versionSuffix}`] = this.#sockets.tcp;
        obj[`wasi:sockets/tcp-create-socket${versionSuffix}`] = this.#sockets.tcpCreateSocket;
        obj[`wasi:sockets/udp${versionSuffix}`] = this.#sockets.udp;
        obj[`wasi:sockets/udp-create-socket${versionSuffix}`] = this.#sockets.udpCreateSocket;

        obj[`wasi:filesystem/preopens${versionSuffix}`] = this.#filesystem.preopens;
        obj[`wasi:filesystem/types${versionSuffix}`] = this.#filesystem.types;

        obj[`wasi:io/error${versionSuffix}`] = this.#io.error;
        obj[`wasi:io/poll${versionSuffix}`] = this.#io.poll;
        obj[`wasi:io/streams${versionSuffix}`] = this.#io.streams;

        obj[`wasi:random/random${versionSuffix}`] = this.#random.random;
        obj[`wasi:random/insecure${versionSuffix}`] = this.#random.insecure;
        obj[`wasi:random/insecure-seed${versionSuffix}`] = this.#random.insecureSeed;

        obj[`wasi:clocks/monotonic-clock${versionSuffix}`] = this.#clocks.monotonicClock;
        obj[`wasi:clocks/wall-clock${versionSuffix}`] = this.#clocks.wallClock;

        obj[`wasi:http/types${versionSuffix}`] = this.#http.types;
        obj[`wasi:http/outgoing-handler${versionSuffix}`] = this.#http.outgoingHandler;

        return obj;
    }
}
