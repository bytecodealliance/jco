/**
 * Opt-in Node host adapter for `node:wasi` initialisation.
 *
 * Runs the real `new WASI(options)` for the guest's normalised options, so preopens and standard
 * descriptors are checked exactly as Node checks them (`UVWASI_ENOENT`, `UVWASI_ENOTDIR`,
 * `UVWASI_EBADF` from `uvwasi_init`), and discards the result: a module can only be linked to a
 * WASI context from the process that instantiates it, which a guest cannot do.
 *
 * Importing `node:wasi` emits Node's `ExperimentalWarning` once in the embedding process.
 */
import { WASI as NodeWasi } from "node:wasi";

import { serializeHostError } from "./internal/host-error.js";
import type { WasiProvider } from "./wasi/types.js";

export const init: WasiProvider["init"] = (options) => {
  try {
    new NodeWasi({
      version: options.version,
      args: [...options.args],
      env: Object.fromEntries(options.env),
      preopens: Object.fromEntries(options.preopens),
      stdin: options.stdin,
      stdout: options.stdout,
      stderr: options.stderr,
    });
  } catch (error) {
    throw serializeHostError(error);
  }
};

const host: WasiProvider = { init };

export default host;
