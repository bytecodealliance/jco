/**
 * This Javascript file (module) will be interpreted by `jco` and turned into a
 * WebAssembly binary with a single export (the `add` interface, which contains an `add` function).
 */
export const add = {
  add(x, y) {
    return x + y;
  },
};
