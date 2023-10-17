<div align="center">

  # `jco`

  **JavaScript tooling for working with [WebAssembly Components](https://github.com/WebAssembly/component-model)**

  **A [Bytecode Alliance](https://bytecodealliance.org/) project**

  [![build status](https://github.com/bytecodealliance/jco/workflows/CI/badge.svg)](https://github.com/bytecodealliance/jco/actions?query=workflow%3ACI)
</div>

## Overview

`jco` is a fully native JavaScript tool for working with the emerging [WebAssembly Components](https://github.com/WebAssembly/component-model) specification.

`jco` can convert code between JS and a Wasm component:

* "Transpile" a Wasm component binary into an ES module that can run in any JS environment.
* "Componentize" JS code and a WIT world into a Wasm component.

`jco` also includes:

* Optimization helpers for components via [Binaryen](https://github.com/WebAssembly/binaryen).
* Component builds of [Wasm Tools](https://github.com/bytecodealliance/wasm-tools) helpers, available in native JS environments for use as a library or via CLI commands.

For creating components in other languages, see [`cargo component`](https://github.com/bytecodealliance/cargo-component) (for Rust) and [Wit Bindgen](https://github.com/bytecodealliance/wit-bindgen) for various guest language bindings generators.

> **Note**: This is an experimental project. No guarantees are provided for stability, security or support and breaking changes may be made without notice.

## Installation

```shell
npm install @bytecodealliance/jco
```

`jco` can be used either as a library or via the `jco` CLI command.

## Example

See the [example workflow](docs/src/example.md) page for a full usage example.

## CLI

```shell
Usage: jco <command> [options]

jco - WebAssembly JS Component Tools
      JS Component Transpilation Bindgen & Wasm Tools for JS

Options:
  -V, --version                         output the version number
  -h, --help                            display help for command

Commands:
  componentize [options] <js-source>    Create a component from a JavaScript module
  transpile [options] <component-path>  Transpile a WebAssembly Component to JS + core Wasm for JavaScript execution
  run <command> [args...]               Run a WebAssembly Command component
  opt [options] <component-file>        optimizes a Wasm component, including running wasm-opt Binaryen optimizations
  wit [options] <component-path>        extract the WIT from a WebAssembly Component [wasm-tools component wit]
  print [options] <input>               print the WebAssembly WAT text for a binary file [wasm-tools print]
  metadata-show [options] [module]      extract the producer metadata for a Wasm binary [wasm-tools metadata show]
  metadata-add [options] [module]       add producer metadata for a Wasm binary [wasm-tools metadata add]
  parse [options] <input>               parses the Wasm text format into a binary file [wasm-tools parse]
  new [options] <core-module>           create a WebAssembly component adapted from a component core Wasm [wasm-tools component new]
  embed [options] [core-module]         embed the component typing section into a core Wasm module [wasm-tools component embed]
  help [command]                        display help for command
```

For help with individual command options, use `jco <cmd> --help`.

### Transpile

To transpile a component into JS:

```
jco transpile component.wasm -o out-dir
```

The resultant file can be imported providing the bindings of the component as if it were imported directly:

app.js
```
import { fn } from './out-dir/component.js';

fn();
```

Imports can be remapped using the `--map` flag, or to provide imports as an argument use the `--instantiation` option.

Components relying on WASI bindings will contain external WASI imports, which are automatically updated
to the `@bytecodealliance/preview-shim` package. This package can be installed from npm separately for
runtime usage. This shim layer supports both Node.js and browsers.

Options include:
* `--name`: Give a custom name for the component JS file in `out-dir/[name].js`
* `--minify`: Minify the component JS
* `--optimize`: Runs the internal core Wasm files through Binaryen for optimization. Optimization options can be passed with a `-- <binaryen options>` flag separator.
* `--tla-compat`: Instead of relying on top-level-await, requires an `$init` promise to be imported and awaited first.
* `--js`: Converts core Wasm files to JavaScript for environments that don't even support core Wasm.
* `--base64-cutoff=<number>`: Sets the maximum number of bytes for inlining Wasm files into the JS using base64 encoding. Set to zero to disable base64 inlining entirely.
* `--no-wasi-shim`: Disable the WASI shim mapping to `@bytecodealliance/preview2-shim`.
* `--map`: Provide custom mappings for world imports. Supports both wildcard mappings (`*` similarly as in the package.json "exports" field) as well as `#` mappings for targetting exported interfaces. For example, the WASI mappings are internally defined with mappings like `--map wasi:filesystem/*=@bytecodealliance/preview2-shim/filesystem#*` to map `import as * filesystem from 'wasi:filesystem/types'` to `import { types } from '@bytecodealliance/preview2-shim/filesystem`.
* `--no-nodejs-compat`: Disables Node.js compat in the output to load core Wasm with FS methods.
* `--instantiation`: Instead of a direct ES module, export an `instantiate` function which can take the imports as an argument instead of implicit imports.
* `--valid-lifting-optimization`: Internal validations are removed assuming that core Wasm binaries are valid components, providing a minor output size saving.

#### Bindgen Crate

To directly call into the transpilation in Rust, the bindgen used in jco is also available on crates.io as [js-component-bindgen](https://crates.io/crates/js-component-bindgen).

### Componentize

To componentize a JS file run:

```
jco componentize app.js --wit wit -n world-name -o component.wasm
```

Creates a component from a JS module implementing a WIT world definition, via a Spidermonkey engine embedding.

Currently requires an explicit install of the componentize-js engine via `npm install @bytecodealliance/componentize-js`.

See [ComponentizeJS](https://github.com/bytecodealliance/componentize-js) for more details on this process.

> Additional engines may be supported in future via an `--engine` field or otherwise.

### Run

For Wasm components that implement the WASI Command world, a `jco run` utility is provided to run these applications in Node.js:

```
jco run cowasy.component.wasm hello
```

Using the preview2-shim WASI implementation, full access to the underlying system primitives is provided, including filesystem and environment variable permissions.

> Since [preview2-shim](packages/preview2-shim) is an experimental work-in-progress implementation, there will likely be bugs.

## API

#### `transpile(component: Uint8Array, opts?): Promise<{ files: Record<string, Uint8Array> }>`

Transpile a Component to JS.

#### `opt(component: Uint8Array, opts?): Promise<{ component: Uint8Array }>`

Optimize a Component with the [Binaryen Wasm-opt](https://www.npmjs.com/package/binaryen) project.

#### `componentWit(component: Uint8Array, document?: string): string`

Extract the WIT world from a component binary.

#### `print(component: Uint8Array): string`

Print the WAT for a Component binary.

#### `metadataShow(wasm: Uint8Array): Metadata`

Extract the producer toolchain metadata for a component and its nested modules.

#### `parse(wat: string): Uint8Array`

Parse a compoment WAT to output a Component binary.

#### `componentNew(coreWasm: Uint8Array | null, adapters?: [String, Uint8Array][]): Uint8Array`

"WIT Component" Component creation tool, optionally providing a set of named adapter binaries.

#### `componentEmbed(coreWasm: Uint8Array | null, wit: String, opts?: { stringEncoding?, dummy?, world?, metadata? }): Uint8Array`

"WIT Component" Component embedding tool, for embedding component types into core binaries, as an advanced use case of component generation.

#### `metadataAdd(wasm: Uint8Array, metadata): Uint8Array`

Add new producer metadata to a component or core Wasm binary.

## Contributing

See the [Contributing](docs/src/contributing.md) chapter of the jco book.

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
