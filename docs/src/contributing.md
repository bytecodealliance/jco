# Contributing to the Codebase

Development is based on a standard `npm install && npm run build && npm run test` workflow.

Tests can be run without bundling via `npm run build:dev && npm run test:dev`.

Specific tests can be run adding the mocha `--grep` / `-g` flag, for example: `npm run test:dev -- --grep exports_only`.

## Prerequisites

Required prerequisites for building jco include:

* [Latest stable Rust](https://www.rust-lang.org/tools/install) with the `wasm32-wasi` target
* Node.js 18+ & npm (https://nodejs.org/en)

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
* `src/api.js`: The jco API which can be used as a library dependency on npm. Published as https://npmjs.org/package/@bytecodealliance/jco.
* `src/jco.js`: The jco CLI. Published as https://npmjs.org/package/@bytecodealliance/jco.
* `packages/preview2-shim`: The WASI Preview2 host implementations for Node.js & browsers. Published as https://www.npmjs.com/package/@bytecodealliance/preview2-shim.

## Building

To build jco, run:

```
npm install
npm run build
```

## Testing

There are three test suites in jco:
* `npm run test`: Project-level transpilation, CLI & API tests.
* `npm run test --workspace packages/preview2-shim`: `preview2-shim` unit tests.
* `test/browser.html`: Bare-minimum browser validation test.
* `cargo test`: Wasmtime preview2 conformance tests (not currently passing).
