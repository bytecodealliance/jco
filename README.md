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
* WASI Preview2 support in Node.js ([undergoing stabilization](https://github.com/bytecodealliance/jco/milestone/1)) & browsers (experimental).
* Component builds of [Wasm Tools](https://github.com/bytecodealliance/wasm-tools) helpers, available for use as a library or CLI commands for use in native JS environments, as well as optimization helper for Components via Binaryen.
* Run and serve commands like Wasmtime, as JS implementations of the Command and HTTP Proxy worlds.
* "Componentize" command to easily create components written in JavaScript (wrapper of [ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS)).

For creating components in other languages, see the [Cargo Component](https://github.com/bytecodealliance/cargo-Component) project for Rust and [Wit Bindgen](https://github.com/bytecodealliance/wit-bindgen) for various guest bindgen helpers.

> **Note**: This is an experimental project, no guarantees are provided for stability, security or support and breaking changes may be made without notice.

## Installation

```shell
npm install @bytecodealliance/jco
```

Jco can be used as either a library import or as a CLI via the `jco` command.

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
  run [options] <command> [args...]     Run a WASI Command component
  serve [options] <command> [args...]   Serve a WASI HTTP component
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
to the `@bytecodealliance/preview2-shim` package. This package can be installed from npm separately for
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
* `--instantiation [mode]`: Instead of a direct ES module, export an `instantiate` function which can take the imports as an argument instead of implicit imports. The `instantiate` function can be async (with `--instantiation` or `--instantiation async`), or sync (with `--instantiation sync`).
* `--valid-lifting-optimization`: Internal validations are removed assuming that core Wasm binaries are valid components, providing a minor output size saving.
* `--tracing`: Emit tracing calls for all function entry and exits.
* `--no-namespaced-exports`: Removes exports of the type `test as "test:flavorful/test"` which are not compatible with typescript

#### Bindgen Crate

To directly call into the transpilation in Rust, the bindgen used in jco is also available on crates.io as [js-component-bindgen](https://crates.io/crates/js-component-bindgen).

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

See the [Contributing](docs/src/contributing.md) chapter of the jco book.

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
