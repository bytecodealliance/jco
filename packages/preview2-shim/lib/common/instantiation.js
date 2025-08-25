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
     * @returns {object}
     */
    getImportObject() {
        return {
            'wasi:cli/environment': this.#cli.environment,
            'wasi:cli/exit': this.#cli.exit,
            'wasi:cli/stderr': this.#cli.stderr,
            'wasi:cli/stdin': this.#cli.stdin,
            'wasi:cli/stdout': this.#cli.stdout,
            'wasi:cli/terminal-input': this.#cli.terminalInput,
            'wasi:cli/terminal-output': this.#cli.terminalOutput,
            'wasi:cli/terminal-stderr': this.#cli.terminalStderr,
            'wasi:cli/terminal-stdin': this.#cli.terminalStdin,
            'wasi:cli/terminal-stdout': this.#cli.terminalStdout,

            'wasi:sockets/instance-network': this.#sockets.instanceNetwork,
            'wasi:sockets/ip-name-lookup': this.#sockets.ipNameLookup,
            'wasi:sockets/network': this.#sockets.network,
            'wasi:sockets/tcp': this.#sockets.tcp,
            'wasi:sockets/tcp-create-socket': this.#sockets.tcpCreateSocket,
            'wasi:sockets/udp': this.#sockets.udp,
            'wasi:sockets/udp-create-socket': this.#sockets.udpCreateSocket,

            'wasi:filesystem/preopens': this.#filesystem.preopens,
            'wasi:filesystem/types': this.#filesystem.types,

            'wasi:io/error': this.#io.error,
            'wasi:io/poll': this.#io.poll,
            'wasi:io/streams': this.#io.streams,

            'wasi:random/random': this.#random.random,
            'wasi:random/insecure': this.#random.insecure,
            'wasi:random/insecure-seed': this.#random.insecureSeed,

            'wasi:clocks/monotonic-clock': this.#clocks.monotonicClock,
            'wasi:clocks/timezone': this.#clocks.timezone,
            'wasi:clocks/wall-clock': this.#clocks.wallClock,

            'wasi:http/types': this.#http.types,
            'wasi:http/outgoing-handler': this.#http.outgoingHandler,
        };
    }
}
