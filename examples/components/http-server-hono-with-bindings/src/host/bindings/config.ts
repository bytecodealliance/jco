/**
 * This file provides bindings that can be used to satisfy `wasi:config/store`
 *
 * It is used in the demo (see scripts/demo.mjs), and is mapped *into* the transpiled
 * component dynamically when it is served via `jco serve`.
 *
 * A module like this could also be used as an input during `jco transpile`transpilation
 * as a mapping (`--map`) argument.
 *
 * see: https://github.com/WebAssembly/wasi-config
 * see: https://github.com/WebAssembly/wasi-config/blob/main/wit/store.wit
 */

/** wasi:config/store.get */
export const get = () => {
    // TODO: read from a real config source
    return undefined;
};

/** wasi:config/store.getAll */
export const getAll = () => {
    // TODO: read from a real config source
    return [];
};
