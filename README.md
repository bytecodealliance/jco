<div align="center">
  <h1><code>js-component-tools</code></h1>

  <p>
    <strong>JavaScript tooling for working with <a href="https://github.com/WebAssembly/component-model">WebAssembly Components</a></strong>
  </p>

  <strong>A <a href="https://bytecodealliance.org/">Bytecode Alliance</a> project</strong>

  <p>
    <a href="https://github.com/bytecodealliance/js-component-tools/actions?query=workflow%3ACI"><img src="https://github.com/bytecodealliance/js-component-tools/workflows/CI/badge.svg" alt="build status" /></a>
  </p>
</div>

## Overview

JS Component Tools is a fully native JS tool for working with the emerging [WebAssembly Components](https://github.com/WebAssembly/component-model) specification in JavaScript.

Features include:

* "Transpiling" Wasm Component binaries into ES modules that can run in any JS environment.
* Optimization helpers for Components via Binaryen
* Component helpers available as a build of [Wasm Tools](https://github.com/bytecodealliance/wasm-tools).

This tool is designed primarily for working with already-created Component binaries, and not for creating Component binaries to begin with. For creating Components, see the [Cargo Component](https://github.com/bytecodealliance/cargo-Component) project for Rust and [Wit Bindgen](https://github.com/bytecodealliance/wit-bindgen) for various guest bindgen helpers.

> **Note**: This is an experimental project, no guarantees are provided for stability or support and breaking changes may be made in future.

## Installation

```shell
npm install js-component-tools
```

JS Component Tools can be used as either a library or as a CLI via the `jsct` CLI command.

## Example

See the [example workflow](EXAMPLE.md) page for a full usage example.

## API

The below is an outline of the available API functions, see [api.d.ts](api.d.ts) file for the exact options.

#### `transpile(component: Uint8Array, opts?): Promise<{ files: Record<string, Uint8Array> }>`

Transpile a Component to JS.

**Transpilation options:**

* `name?: string` - name for the generated JS file.
* `instantiation?: bool` - instead of a direct ES module, output the raw instantiation function for custom virtualization.
* `map?: Record<string, string>` - remap component imports
* `validLiftingOptimization?: bool` - optimization to reduce code size
* `noNodejsCompat?: bool` - disables Node.js compatible output
* `tlaCompat?: bool` - enable compat in JS runtimes without TLA support
* `base64Cutoff?: number` - size in bytes, under which Wasm modules get inlined as base64.
* `js?: bool` - convert Wasm into JS instead for execution compatibility in JS environments without Wasm support.
* `minify?: bool` - minify the output JS.
* `optimize?: bool` - optimize the component with Binaryen wasm-opt first.
* `optArgs?: string[]` - if using optimize, custom optimization options (defaults to best optimization, but this is very slow)

#### `opt(component: Uint8Array, opts?): Promise<{ component: Uint8Array }>`

Optimize a Component with the [Binaryen Wasm-opt](https://www.npmjs.com/package/binaryen) project.

#### `parse(wat: string): Uint8Array`

Parse a compoment WAT to output a Component binary.

#### `print(component: Uint8Array): string`

Print the WAT for a Component binary.

#### `componentNew(coreWasm: Uint8Array | null, opts?): Uint8Array`

"WIT Component" Component creation tool.

#### `componentWit(component: Uint8Array): string`

Extract the WIT world from a component binary.

## CLI

```shell
Usage: jsct <command> [options]

JSCT - WebAssembly JS Component Tools
       JS Component Transpilation Bindgen & Wasm Tools for JS

Options:
  -V, --version                         output the version number
  -h, --help                            display help for command

Commands:
  transpile [options] <component-path>  Transpile a WebAssembly Component to JS + core Wasm for JavaScript execution
  opt [options] <component-file>        optimizes a Wasm component, including running wasm-opt Binaryen optimizations
  wit [options] <component-path>        extract the WIT from a WebAssembly Component [wasm-tools component wit]
  print [options] <input>               print the WebAssembly WAT text for a binary file [wasm-tools print]
  parse [options] <input>               parses the Wasm text format into a binary file [wasm-tools parse]
  new [options] [module]                create a WebAssembly component adapted from a component core Wasm [wasm-tools component new]
  help [command]                        display help for command
```

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.