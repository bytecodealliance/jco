# C extended-test components

C fixtures use wasi-sdk; reactors also use `wit-bindgen c`. Each issue
directory owns its source, any WIT, and build recipe; the parent
`test/components/justfile` copies built components into the shared
extended-test output directory.

Set `WASI_SDK_PATH` to a wasi-sdk installation containing the required target.
Issue 1887 requires wasi-sdk [34.0](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-34) or newer with `wasm32-wasip3` support.
Issue 2510 is a `wasm32-wasip2` command and needs wasi-sdk 25 or newer.
