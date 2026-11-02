# Test Components

This folder contains components used for tests, written in various programming languages.

While these tests are not required for local Jco builds, they are part of an extended
regression suite (mostly built from submitted bug reports) to ensure coverage for relatively
niche or rare cases.

To run the tests that use these files, you will need to run the "extended" test suite:

```console
pnpm --filter '@bytetcodealliance/jco' test:extended
```

# Building individual components

## General dependencies

Most components are built via the `justfile`s included in their code directories. Generally you
may need the following software to build any individual component:

| Software                     | Description                                                         |
|------------------------------|---------------------------------------------------------------------|
| [`just`][just]               | General task runner                                                 |
| [`wkg`][wkg]                 | Package manager for WebAssembly components                          |
| [`wit-bindgen`][wit-bindgen] | Bindings generator for WebAssembly that supports multiple languages |
| [`wac`][wac]                 | Component composition tool                                          |

You may list the `just` targets available at the top level (the `justfile` in this folder) via the command below:

```console
just
```

Most components are buildable from the top level `justfile`. For example, the below command
will build all components related to the `jco-issue-1380` subproject:

```
just build jco-issue-1380
```

[just]: https://github.com/casey/just
[wkg]: https://github.com/bytecodealliance/wasm-pkg-tools
[wit-bindgen]: https://github.com/bytecodealliance/wit-bindgen
[wac]: https://github.com/bytecodealliance/wac

## Per-ecosystem dependencies

Each langauge ecosystem may require separate build systems and local dependencies. A
useful but likely incomplete list is below:

| Language             | Dependency                           | Description                                                                  |
|----------------------|--------------------------------------|------------------------------------------------------------------------------|
| [C++ (`cpp`)](./cpp) | [`wasi-sdk`][wasi-sdk]               | Bytecode Alliance maintained toolin for building C/C++ components            |
| [C (`c`)](./c)       | [`wasi-sdk`][wasi-sdk]               | Bytecode Alliance toolchain for C components, including WASI P3 fixtures      |
| [Rust (`rust`)](./rust) | `rustup target add wasm32-wasip2` | Rust toolchain and WASI P2 target used by the `wstd` HTTP client fixture      |
| [Python](./python)   | [`uv`][uv]                           | Python package manager                                                       |
|                      | [`componentize-py`][componentize-py] | Bytecode Alliance maintained tooling for building Python projects components |
| [MoonBit (`moonbit`)](./moonbit) | [`moon`][moon]            | MoonBit toolchain, components are embedded with the `utf16` string encoding   |

[wasi-sdk]: https://github.com/WebAssembly/wasi-sdk
[uv]: https://github.com/astral-sh/uv
[componentize-py]: https://github.com/bytecodealliance/componentize-py/
[moon]: https://www.moonbitlang.com/download/

The [Python cooperative threading fixture](./python/coop-threading/README.md)
currently needs a pinned source build of componentize-py. Run its `just setup`
recipe before building the full component tree; the extended CI job caches this
toolchain automatically.

The Rust fixture for [issue #2393](https://github.com/bytecodealliance/jco/issues/2393)
uses the native `wasm32-wasip3` target and release-mode fat LTO. Its local
`rust-toolchain.toml` pins Rust 1.100.0-beta.7 (`beta-2026-10-18`) so that the
regression keeps exercising the reported compiler output. Rustup installs this
toolchain and target when building the fixture:

```console
just -f test/components/justfile build-jco-issue-2393
pnpm --filter '@bytecodealliance/jco-transpile' test:extended test/extended/jco-issue-2393.ts
```
