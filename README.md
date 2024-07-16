<div align="center">
  <h1><code>jco</code></h1>

  <p>
    <strong>JavaScript toolchain for working with <a href="https://github.com/WebAssembly/component-model">WebAssembly Components</a></strong>
  </p>

  <strong>A <a href="https://bytecodealliance.org/">Bytecode Alliance</a> project</strong>

  <p>
    <a href="https://github.com/bytecodealliance/jco/actions?query=workflow%3ACI"><img src="https://github.com/bytecodealliance/jco/workflows/CI/badge.svg" alt="build status" /></a>
  </p>

  <h3>
    <a href="https://bytecodealliance.github.io/jco/">Contributing</a>
    <span> | </span>
    <a href="https://bytecodealliance.zulipchat.com/#narrow/stream/409526-jco">Chat on Zulip</a>
  </h3>
</div>

## Overview

Jco provides a fully native JS toolchain for working with [WebAssembly Components](https://github.com/WebAssembly/component-model) in JavaScript.

Features include:

* "Transpiling" Wasm Component binaries into ES modules that can run in any JS environment.
* WASI Preview2 support in Node.js & browsers (experimental).
* Component builds of [Wasm Tools](https://github.com/bytecodealliance/wasm-tools) helpers, available for use as a library or CLI commands for use in native JS environments, as well as optimization helper for Components via Binaryen.
* Run and serve commands like Wasmtime, as JS implementations of the Command and HTTP Proxy worlds.
* "Componentize" command to easily create components written in JavaScript (wrapper of [ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS)).

For creating components in other languages, see the [Cargo Component](https://github.com/bytecodealliance/cargo-Component) project for Rust and [Wit Bindgen](https://github.com/bytecodealliance/wit-bindgen) for various guest bindgen helpers.

## Installation

```shell
npm install @bytecodealliance/jco
```

Jco can be used as either a library import or as a CLI via the `jco` command.

## Example

See the [Example Workflow](https://bytecodealliance.github.io/jco/example.html) page for a full usage example.

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
  types [options] <wit-path>            Generate types for the given WIT
  run [options] <command> [args...]     Run a WASI Command component
  serve [options] <server> [args...]    Serve a WASI HTTP component
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

See the [Transpiling Docs](https://bytecodealliance.github.io/jco/transpiling.html) for more background and info.

#### Bindgen Crate

To directly call into the transpilation in Rust, the bindgen used in Jco is also available on crates.io as [js-component-bindgen](https://crates.io/crates/js-component-bindgen).

### Run & Serve

For Wasm components that implement the WASI Command world, a `jco run` utility is provided to run these applications in Node.js.

```
jco run cowasy.component.wasm hello
```

Using the preview2-shim WASI implementation, full access to the underlying system primitives is provided, including filesystem and environment variable permissions.

For HTTP Proxy components, `jco serve` provides a JS server implementation:

```
jco serve --port 8080 server.wasm
```

> [Wasmtime](https://github.com/bytecodealliance/wasmtime) generally provides the most performant implementation for executing command and proxy worlds to use. These implementations are rather for when JS virtualization is required or the most convenient approach.

### Componentize

> **Note**: `jco componentize` is considered experimental, and breaking changes may be made without notice.

To componentize a JS file run:

```
jco componentize app.js --wit wit -n world-name -o component.wasm
```

Creates a component from a JS module implementing a WIT world definition, via a Spidermonkey engine embedding.

Currently requires an explicit install of the componentize-js engine via `npm install @bytecodealliance/componentize-js`.

See [ComponentizeJS](https://github.com/bytecodealliance/componentize-js) for more details on this process.

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

See the [Contributing](https://bytecodealliance.github.io/jco/contributing.html) chapter of the Jco book.

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
