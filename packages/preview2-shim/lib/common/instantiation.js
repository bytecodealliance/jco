import * as wasi from "@bytecodealliance/preview2-shim";

/**
 * A class that holds WASI shims and can be used to configure
 * an instantiation of a WebAssembly component transpiled with jco
 * (i.e. via `jco transpile`).
 *
 * @class Shim
 */
export class Shim {
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

  constructor(shims) {
    this.#cli = shims?.cli ?? wasi.cli;
    this.#filesystem = shims?.filesystem ?? wasi.filesystem;
    this.#io = shims?.io ?? wasi.io;
    this.#random = shims?.random ?? wasi.random;
    this.#clocks = shims?.clocks ?? wasi.clocks;
    this.#sockets = shims?.sockets ?? wasi.sockets;
  }

  /**
   * Generate an import object for the shim that can be used with
   * functions like `instantiate` that are exposed from a transpiled
   * WebAssembly component.
   *
   * @returns {object}
   */
  importObject() {
    return {
      "wasi:cli/environment": this.#cli.environment,
      "wasi:cli/exit": this.#cli.exit,
      "wasi:cli/stderr": this.#cli.stderr,
      "wasi:cli/stdin": this.#cli.stdin,
      "wasi:cli/stdout": this.#cli.stdout,
      "wasi:cli/terminal-input": this.#cli.terminalInput,
      "wasi:cli/terminal-output": this.#cli.terminalOutput,
      "wasi:cli/terminal-stderr": this.#cli.terminalStderr,
      "wasi:cli/terminal-stdin": this.#cli.terminalStdin,
      "wasi:cli/terminal-stdout": this.#cli.terminalStdout,

      "wasi:sockets/instance-network": this.#sockets.instanceNetwork,
      "wasi:sockets/ip-name-lookup": this.#sockets.ipNameLookup,
      "wasi:sockets/network": this.#sockets.network,
      "wasi:sockets/tcp": this.#sockets.tcp,
      "wasi:sockets/tcp-create-socket": this.#sockets.tcpCreateSocket,
      "wasi:sockets/udp": this.#sockets.udp,
      "wasi:sockets/udp-create-socket": this.#sockets.udpCreateSocket,

      "wasi:filesystem/preopens": this.#filesystem.preopens,
      "wasi:filesystem/types": this.#filesystem.types,

      "wasi:io/error": this.#io.error,
      "wasi:io/poll": this.#io.poll,
      "wasi:io/streams": this.#io.streams,

      "wasi:random/random": this.#random.random,
      "wasi:random/insecure": this.#random.insecure,
      "wasi:random/insecure-seed": this.#random.insecureSeed,

      "wasi:clocks/monotonic-clock": this.#clocks.monotonicClock,
      "wasi:clocks/timezone": this.#clocks.timezone,
      "wasi:clocks/wall-clock": this.#clocks.wallClock,
    };
  }
}

/**
 * Generate a WASI imports object that can be used for
 * manual component instantiation of a transpiled component.
 *
 * Normally, transpiled components contain mapping for WASI interfaces
 * and/or imports that import the relevant packages (ex. `@bytecodealliance/preview2-shim/clocks`)
 * from the right sources.
 *
 * This function makes use of the `Shim` object to provide an object that can be easily
 * fed to the `instantiate` function produced by a transpiled component:
 *
 * ```js
 * import { imports } from "@bytecodealliance/preview2-shim/instantiation"
 * // ...
 * import { instantiate } from "path/to/transpiled/component.js"
 * // ...
 * const component = instantiate(null, imports())
 * ```
 *
 * You can also replace imports that you'd like to override with custom implementations,
 * by using the `Shim` object directly:
 *
 * ```js
 * import { imports, Shim } from "@bytecodealliance/preview2-shim/instantiation"
 * // ...
 * import { instantiate } from "path/to/transpiled/component.js"
 * // ...
 * const defaultImports = imports();
 * const customImports = new Shim({
 *     random: {
 *         random: defaultImports["wasi:random/random"],
 *         insecure: {
 *             // Your custom implementation for the `wasi:random/insecure` interface goes here
 *         }
 *         insecure-seed: defaultImports["wasi:random/insecure-seed"],
 *     }
 * });
 *
 * const component = instantiate(null, customImports.importObject())
 * ```
 */
export function imports() {
  return new Shim().importObject();
}
