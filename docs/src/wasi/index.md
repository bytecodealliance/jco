# WASI support

Components that import [WASI][wasi] interfaces need a host implementation of those interfaces at
runtime. Jco ships two such implementations as npm packages, and `jco transpile` maps WASI imports
to them automatically:

| WASI version | Package                                            | Mapped imports                                     |
| ------------ | -------------------------------------------------- | -------------------------------------------------- |
| 0.2.x        | [`@bytecodealliance/preview2-shim`][npm-p2-shim]   | `wasi:cli`, `clocks`, `filesystem`, `http`, `io`, `random`, `sockets` |
| 0.3.x        | [`@bytecodealliance/preview3-shim`][npm-p3-shim]   | `wasi:cli`, `clocks`, `filesystem`, `http`, `random`, `sockets`       |

Both packages provide a Node.js build and a browser build, selected through the package's `node`
export condition, so the same transpiled component runs in either environment.

- [Preview 2 shim](./preview2-shim.md) describes the WASI 0.2 implementation, its browser
  capability model, sandboxing with `WASIShim`, and the host-side helper functions.
- [Preview 3 shim](./preview3-shim.md) describes the WASI 0.3 implementation and how it maps
  versions.

The mapping is expressed through the same `--map` mechanism available to any import; see
[WASI Shims](../transpiling.md#wasi-shims) in the Transpiling chapter. Pass `--no-wasi-shim` to
treat WASI like any other import, and see
[Manual Wasm instantiation with WASI overrides](../advanced/manual-wasm-instantiation-with-wasi-overrides.md)
to supply your own implementations at instantiation time.

[wasi]: https://github.com/WebAssembly/WASI
[npm-p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim
[npm-p3-shim]: https://www.npmjs.com/package/@bytecodealliance/preview3-shim
