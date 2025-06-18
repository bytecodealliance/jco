/**
 * This module is the JS implementation of the `component` WIT world
 */


/* import the logging interface */
import { log } from "wasi:logging/logging@0.1.0-draft";

/**
 * The Javascript export below represents the export of the `log-characters` interface,
 * which which contains `call` as it's primary exported function.
 */
export const logCharacters = {
  /**
   * This Javascript will be interpreted by `jco` and turned into a
   * WebAssembly binary with a single export (this `call` function).
   */
  call(s) {
    for (let char of s.split("")) {
      // log `char` with log level `info`
      log("info", "stdout", char)
    }
  }
};
