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
| [Python](./python)   | [`uv`][uv]                           | Python package manager                                                       |
|                      | [`componentize-py`][componentize-py] | Bytecode Alliance maintained tooling for building Python projects components |

[wasi-sdk]: https://github.com/WebAssembly/wasi-sdk
[uv]: https://github.com/astral-sh/uv
[componentize-py]: https://github.com/bytecodealliance/componentize-py/
