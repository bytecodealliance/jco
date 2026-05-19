# Contributing to the Codebase

Development is based on a standard NodeJS workflow, with [`pnpm`][pnpm] as the package manager, i.e.:

```console
pnpm install
pnpm run build
pnpm run test
```

[pnpm]: https://pnpm.io

## Prerequisites

Required prerequisites for building jco include:

* [Latest stable Rust](https://www.rust-lang.org/tools/install) with the `wasm32-wasi` target
* [Node.js][node] 18+
* [`pnpm`][pnpm]

[node]: https://nodejs.org/en

### Rust Toolchain

The latest Rust stable toolchain can be installed using [rustup](https://rustup.rs/).

Specifically:

```shell
rustup toolchain install stable
rustup target add wasm32-wasi
```

In case you do not have `rustup` installed on your system, please follow the installation instructions on the [official Rust website](https://www.rust-lang.org/tools/install) based on your operating system

## Project Structure

jco is effectively a monorepo consisting of the following projects:

* `crates/js-component-bindgen`: Rust crate for creating JS component bindgen, published under https://crates.io/crates/js-component-bindgen.
* `crates/js-component-bindgen-component`: Component wrapper crate for the component bindgen. This allows bindgen to be self-hosted in JS.
* `crates/wasm-tools-component`: Component wrapper crate for wasm-tools, allowing jco to invoke various Wasm toolchain functionality and also make it available through the jco API.
* `src/api.js`: The jco API which can be used as a library dependency. Published as [`@bytecodealliance/jco`](https://npmjs.org/package/@bytecodealliance/jco).
* `src/jco.js`: The jco CLI. Published as [`@bytecodealliance/jco`](https://npmjs.org/package/@bytecodealliance/jco).
* `packages/preview2-shim`: The WASI Preview2 host implementations for Node.js & browsers. Published as [`@bytecodealliance/preview2-shim`](https://www.npmjs.com/package/@bytecodealliance/preview2-shim).
* `packages/preview3-shim`: The WASI Preview3 host implementations for Node.js

### Files that should be checked in

The repository is for project related code only -- avoid checking in files related to specific platforms or IDEs.
One off configuration and/or secrets should of course not be checked in either.

If there is information/configuration that is important for users or developers to see, include them in documentation
and/or examples with appropriate context/explanation.

## Building

To build jco, run:

```
pnpm install
pnpm run build
```

## Testing

There are three test suites in jco:

* `pnpm run test`: Project-level transpilation, CLI & API tests.
* `pnpm run --filter 'packages/preview2-shim' test`: `preview2-shim` unit tests.
* `pnpm run --filter 'packages/preview3-shim' test`: `preview3-shim` unit tests.
* `test/browser.html`: Bare-minimum browser validation test.
* `cargo test`: Wasmtime preview2 conformance tests (not currently passing).

> [!WARNING]
> Generally, when running `jco` tests, you will want to build the project *first* during a test run,
> to ensure the latest version of Rust code (i.e. `js-component-bindgen` is in use):
>
> ```
> cd packages/jco
> pnpm run build
> pnpm run test api.js
> ```
>
> The command above runs a single test file -- the name of the file is relative to `packages/jco/test`.

### Running specific tests

JS tests are powered by [`vitest`][vitest], and a specific test suite can be run by passing
the filename to `pnpm run test`:

```console
cd packages/jco
pnpm run test runtime.js
```

For example, to run multiple tests in a given folder:

```console
cd packages/jco
pnpm run test test/p3/*.js
```

[vitest]: https://vitest.dev

## Commits

Jco and related subprojects use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
Using Conventional Commits helps the project maintain consistency in commit messages, and powers release
automation.

CI enforces that commits are structured in a conventional commit style (see [`commitlint.config.mjs`](https://github.com/bytecodealliance/jco/blob/main/commitlint.config.mjs).
Special care must also be taken to ensure PR titles are formatted in a way that matches conventional commits as well,
when performing squash merges.

The following types are valid:
- `build`
- `chore`
- `ci`
- `debug`
- `docs`
- `feat`
- `fix`
- `perf`
- `refactor`
- `release`
- `revert`
- `style`
- `test`
- `sec` (security)

The following project scopes are valid:
- `jco`
- `p2-shim`
- `p3-shim`
- `bindgen`
- `transpile`
- `std`

For changes made to projects in the repository to be included in releases, the appropriate project scope must be applied.

Since changes that should be made to the repo may not always have a project-specific scope, the
following scopes can be used as well:
- `deps`
- `ci`
- `ops`

Here are a few example commit messages:

```
chore(jco): update componentize-js dependency to X.X.X
```

```
feat(ci): add commitlint to actions workflows
```

[!NOTE]: #
[!WARNING]: #
