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

- "Transpiling" Wasm Component binaries into ES modules that can run in any JS environment.
- WASI Preview2 support in Node.js & browsers (experimental).
- Component builds of [Wasm Tools](https://github.com/bytecodealliance/wasm-tools) helpers, available for use as a library or CLI commands for use in native JS environments, as well as optimization helper for Components via Binaryen.
- Run and serve commands like Wasmtime, as JS implementations of the Command and HTTP Proxy worlds.
- "Componentize" command to easily create components written in JavaScript (wrapper of [ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS)).

For creating components in other languages, see the [Component Model Book](https://component-model.bytecodealliance.org/language-support.html) and [Wit Bindgen](https://github.com/bytecodealliance/wit-bindgen) for various guest bindgen helpers.

## Installation

```shell
pnpm install @bytecodealliance/jco
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
  scaffold [options] <project-directory> Create a JavaScript or TypeScript WebAssembly component or host-plugin project
  componentize [options] <source>       Create a component from a JavaScript or TypeScript module
  transpile [options] <component-path>  Transpile a WebAssembly Component to JS + core Wasm for JavaScript execution
  types [options] <wit-path>            Generate types for the given WIT
  guest-types [options] <wit-path>      (experimental) Generate guest types for the given WIT
  run [options] <command> [args...]     Run a WASI Command component
  serve [options] <server> [args...]    Serve a WASI HTTP component
  opt [options] <component-file>        optimizes a Wasm component, including running wasm-opt Binaryen optimizations
  wit [options] <component-path>        extract the WIT from a WebAssembly Component [wasm-tools component wit]
  print [options] <input>               print the WebAssembly WAT text for a binary file [wasm-tools print]
  metadata-show [options] [module]      extract the producer metadata for a Wasm binary [wasm-tools metadata show]
  metadata-add [options] [module]       add producer metadata for a Wasm binary [wasm-tools metadata add]
  parse [options] <input>               parses the Wasm text format into a binary file [wasm-tools parse]
  new [options] <core-module>           create a WebAssembly component adapted from a component core Wasm [wasm-tools component new]
  tool                                 Low-level WebAssembly conversion utilities
  embed [options] [core-module]         embed the component typing section into a core Wasm module [wasm-tools component embed]
  help [command]                        display help for command
```

For help with individual command options, use `jco <cmd> --help`.

### Scaffold a new component project

`jco scaffold` creates a regular Node.js project whose source skeleton matches an existing WIT world. By default,
Typescript, `pnpm`, and both NodeJS and Web targets are used:

```console
jco scaffold my-component --wit path/to/wit
```

`--wit` accepts a self-contained `.wit` file or WIT package directory and copies it into the project. If dealing with a
WIT file that contains multiple worlds, supply the `--world` option as well.

It can also pull a versioned WASI package from the Bytecode Alliance OCI registry. The package and its embedded dependencies are
expanded into the generated project's `wit/` directory, so subsequent builds do not access the registry:

```console
jco scaffold my-command --wit wasi:cli@0.3.0 --world wasi:cli/command@0.3.0
```

Use an `oci://` reference to scaffold from an arbitrary OCI registry package, including WIT-only components:

```console
jco scaffold my-adder --wit oci://ghcr.io/bytecodealliance/docs/adder:0.1.0 --world docs:adder/adder@0.1.0
```

For a quick WASI starting point, use one of Jco's bundled WIT packages:

```console
jco scaffold my-command --wit builtin:wasi-command
jco scaffold my-http-service --wit builtin:wasi-proxy
jco scaffold my-reactor --wit builtin:wasi-reactor
```

These aliases default to WASI 0.3.0. Use the `@0.2.x` suffix, for example
`builtin:wasi-command@0.2.x`, to select the latest bundled WASI 0.2 release (currently 0.2.12). Jco copies the bundled
official WASI sources into the generated project's `wit/` directory, so scaffolding does not require network access.

Immediately, you should be able to install and build the component:

```console
cd my-component
pnpm install
pnpm check
pnpm test
pnpm build
```

You can configure scaffolding in various ways:

- `--host` to generate a plugin that provides the selected world's imports for use with `instantiate` (the default
  generates a guest that implements its exports)
- `--language javascript` to generate a Javscript scaffold (the default is Typescript)
- `--package-manager npm`/`--package-manager yarn` to use a separate package manager (`pnpm` is the default)
- `--target nodejs`/`--target web` (can be repeated) to explicitly enable targets (by default both targets are supported)

### Transpile

See the [Transpiling Docs](https://bytecodealliance.github.io/jco/transpiling.html) for more background and info.

#### Bindgen Crate

To directly call into the transpilation in Rust, the bindgen used in Jco is also available on crates.io as [js-component-bindgen](https://crates.io/crates/js-component-bindgen).

### Run & Serve

For Wasm components that implement the WASI Command world, a `jco run` utility is provided to run these applications in Node.js.

```
jco run cowasy.component.wasm hello
```

By default, `jco run` retains its historical behavior and gives the component access to the host
filesystem, environment, and network. Pass `--sandbox` to deny those capabilities, then grant
only those the component needs:

```console
jco run command.wasm --sandbox \
  --sandbox-env-set HOME=/guest \
  --sandbox-fs-preopen ./data::/data \
  --sandbox-net-inherit
```

`--sandbox-env-set NAME` inherits one variable from the host, while `--sandbox-env-inherit` inherits
them all. `--sandbox-fs-preopen HOST[::GUEST]` exposes a directory (using the host path as the guest
path when it is omitted). The environment and preopen options may be repeated; values are applied
in command-line order.

Using the preview2-shim WASI implementation, full access to the underlying system primitives is provided, including filesystem and environment variable permissions.

For HTTP Proxy components, `jco serve` provides a JS server implementation:

> **Warning:** `jco serve` is intended for development and testing only. It is not production ready.

```
jco serve --port 8080 server.wasm
```

By default, the server reuses one component instance for all requests. Pass `--isolate-requests`
to run every request in a fresh Node.js worker thread (equivalent to
`--isolate-requests=worker`):

```
jco serve --isolate-requests --port 8080 server.wasm
```

Worker isolation gives each request a separate V8 isolate, JavaScript global scope, module cache, and
component instance. Request and response bodies are streamed through a local HTTP proxy. For lower
overhead, `--isolate-requests=instance` creates fresh component memories, tables, globals, and resource
tables while sharing the JavaScript isolate and module cache. Neither mode is a security sandbox or
isolates external filesystem and network side effects. Both modes have a significant performance cost,
especially worker isolation.

> [Wasmtime](https://github.com/bytecodealliance/wasmtime) generally provides the most performant implementation for executing command and proxy worlds to use. These implementations are rather for when JS virtualization is required or the most convenient approach.

### Componentize

> **Note**: `jco componentize` is considered experimental, and breaking changes may be made without notice.

To componentize a JavaScript file run:

```
jco componentize app.js --wit wit -n world-name -o component.wasm
```

By default, [StarlingMonkey][sm] is the default componentization backend, but alternative backends can be
selected with the `--backend` option, for example [QuickJS-NG][qjs-ng] via [`componentize-qjs`][cqjs]
(i.e. `--backend quickjs` or `--backend qjs`):

```
jco componentize app.js --wit wit -n world-name -o component.wasm --backend qjs
```

The accepted backend names are `starlingmonkey`/`sm` and `quickjs`/`qjs`. The existing `--engine <path>`
option supplies a custom StarlingMonkey build and is valid only with the StarlingMonkey backend.

TypeScript entry modules are transformed and bundled automatically:

```
jco componentize app.ts --wit wit -n world-name -o component.wasm
```

The TypeScript transform erases types but does not perform semantic type checking. Run `tsc --noEmit`
separately when required.

See [ComponentizeJS][cjs] and [componentize-qjs][cqjs] for backend-specific details.

[sm]: https://github.com/bytecodealliance/StarlingMonkey
[qjs-ng]: https://github.com/quickjs-ng/quickjs
[cjs]: https://github.com/bytecodealliance/componentize-js
[cqjs]: https://github.com/andreiltd/componentize-qjs

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
