# C extended-test components

C fixtures use `wit-bindgen c` and wasi-sdk. Each issue directory owns its
source, WIT, and build recipe; the parent `test/components/justfile` copies
built components into the shared extended-test output directory.

Set `WASI_SDK_PATH` to a wasi-sdk installation containing the required target.
Issue 1887 requires wasi-sdk [34.0-rc.2](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-34-rc.2) or newer with `wasm32-wasip3` support.
