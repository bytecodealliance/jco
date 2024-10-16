/**
 * This module is the JS implementation of the `reverser` WIT world
 */

/**
 * The Javascript export below represents the export of the `reverse` interface,
 * which which contains `reverse-string` as it's primary exported function.
 */
export const reverse = {
  /**
   * This Javascript will be interpreted by `jco` and turned into a
   * WebAssembly binary with a single export (this `reverse` function).
   */
  reverseString(s) {
    return s.split("")
      .reverse()
      .join("");
  }

};
