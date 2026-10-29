# Python cooperative threading

This component exercises Python's built-in `threading` module through jco's
extended suite: thread start/join and sleep, a contended lock, condition
notification, and thread-local values/identities across a barrier. Worker
exceptions are propagated to the exported call. The host runs each case twice
on the same instance and enforces a subprocess deadline for deadlocks.

The start/join case is adapted from componentize-py's
[multithreading example](https://github.com/bytecodealliance/componentize-py/blob/e520f231f761d771f30224096e4f972fcaaa9c62/examples/multithreading/app.py)
and its [upstream test](https://github.com/bytecodealliance/componentize-py/blob/e520f231f761d771f30224096e4f972fcaaa9c62/tests/componentize.rs#L143).
The synchronization cases are new. The upstream example's printing is replaced
with a returned trace, and assertions allow different timer wakeup orders.

## Toolchain

As of 2026-10-29, cooperative threading is in the open
[componentize-py PR #242](https://github.com/bytecodealliance/componentize-py/pull/242),
not upstream `main` or a released wheel. `just setup` pins revision
`e520f231f761d771f30224096e4f972fcaaa9c62` and Rust `nightly-2026-10-08`.
The PR downloads its matching CPython build and WASI SDK 34 fork with shared
library exception support. A stock SDK 34 installation alone is insufficient
to build this version of componentize-py. The setup recipe clears `CC`, `CXX`,
`WASI_SDK_PATH`, and `WASI_SDK_VERSION` for the Cargo install. This lets native
dependencies use host compilers and upstream select its matching SDK, even when
the WASI SDK setup action has exported WebAssembly compiler overrides.

From the repository root:

```sh
just -f test/components/python/coop-threading/justfile setup
just -f test/components/justfile build-python-coop-threading
pnpm --filter '@bytecodealliance/jco-transpile' test:extended python-coop-threading
```

The source build requires Cargo, rustup, a native C/C++ toolchain, and network
access for dependencies. CI caches the resulting binary. To use an already
built binary, skip setup and set `COMPONENTIZE_PY` to its absolute path.
The build always passes `--target wasm32-wasip3-threads`; an older tool fails
instead of silently building a non-threaded component.

Replace the source pin with a released componentize-py once the target ships.
