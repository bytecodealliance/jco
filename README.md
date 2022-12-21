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

JS Component Tools provides a JS ecosystem tool for working with the emerging [WebAssembly Components](https://github.com/WebAssembly/component-model) specification in JavaScript.

Features include:

* "Transpiling" Wasm Component binaries into ES modules that can run in any JS environment.
* Optimization helpers for Components, including Binaryen and asm.js support.
* Component operations from a JS-native build of [Wasm Tools](https://github.com/bytecodealliance/wasm-tools).

The Rust transpiler and Wasm Tools crates are both compiled from Rust into JS using Wasm Component tools itself.

> This tool is designed primarily for working with already-created Components, and not for creating Components. For creating Components, see the [Cargo Component](https://github.com/bytecodealliance/cargo-Component) and [Wit Bindgen](https://github.com/bytecodealliance/wit-bindgen) projects.

_Note: This is an experimental project, no guarantees are provided for stability or support and breaking changes may be made in future._

## Installation

This is a fully-native JS & Wasm library which can be installed from npm directly.

```sh
npm install js-component-tools
```

JS Component Tools can be used as either a library (e.g. `import { transpile } from 'js-component-tools'`) or as a CLI via the `jsct` CLI command.

## Example

Given an existing Wasm Component, `jsct` provides the tooling necessary to work with this Component fully natively in JS.

For an example, consider a Component `cowsay.wasm`:

```sh
- cowsay.wasm
```

Where we would like to use and run this Component in a JS environment.

### Inspecting Component WIT

As a first step, we might like to look instead this binary black box of a Component and see what it actually does.

To do this, we can use `jsct wit` to extract the "WIT world" of the Component ([WIT](https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md) is the typing language used for defining Components).

```sh
> jsct wit cowsay.wasm

world component {
  default export interface {
    enum cows {
      default,
      cheese,
      daemon,
      dragon-and-cow,
      dragon,
      elephant-in-snake,
      elephant,
      eyes,
      flaming-sheep,
      ...
    }

    cow-say: func(text: string, cow: option<cows>) -> string
  }
}
```

From the above we can see that this Component exports an interface with a single function export, `say`, which takes
as input a string, an optional cow, and returns a string.

Alternatively `jsct print cowsay.wasm -o out.wat` would output the full concrete Wasm WAT to inspect the Component,
with all the implementation details (don't forget the `-o` flag...).

### Transpiling to JS

To execute the Component in a JS environment, use the `jsct transpile` command to generate the JS for the Component:

```sh
> jsct transpile cowsay.wasm --minify -o wunderbar

Transpiled JS Component Files:

 - cowsay/cowsay.core.wasm      2.01 MiB
 - cowsay/cowsay.d.ts           0.73 KiB
 - cowsay/cowsay.js             6.01 KiB
```

Now the Component can be directly imported and used as an ES module:

test.mjs
```js
import { cowSay } from './cowsawy/cowsawy.js';

console.log(cowSay('Hello Wasm Components!'));
```

The above JavaScript can be executed in Node.js:

```sh
> node test.mjs

 ________________________
< Hello Wasm Components! >
 ------------------------
        \   ^__^
         \  (oo)\_______
            (__)\       )\/\
                ||----w |
                ||     ||
```

Or it can be executed in a browser via a module script:

```html
<script type="module" src="test.mjs"></script>
```

There are a number of custom transpilation options available, detailed in the API section below.

## JSCT API

Note if using a synchronous API function, the `$init` method should be imported and awaited first:

```js
import { $init } from 'js-component-tools';

await $init;
```

This is because the JSCT API is built with top-level await compatibility (via `jsct transpile --tla-compat`).

The below is an outline of the available API functions, see [api.d.ts](api.d.ts) file for the exact options.

#### `transpile(component: Uint8Array, opts?): Promise<{ files: Record<string, Uint8Array> }>`

_Transpile a Component to JS._

Transpilation options:

* `name?: string` - name for the generated JS file.
* `instantiation?: bool` - instead of a direct ES module, output the raw instantiation function for custom virtualization.
* `map?: Record<string, string>` - remap component imports
* `validLiftingOptimization?: bool` - optimization to reduce code size
* `compat?: bool` - enables all compat options
* `noNodejsCompat?: bool` - disables Node.js compatible output
* `tlaCompat?: bool` - enable compat in JS runtimes without TLA support
* `base64Cutoff?: number` - size in bytes, under which Wasm modules get inlined as base64.
* `asm?: bool` - use asm.js instead of core WebAssembly for execution.
* `minify?: bool` - minify the output JS.
* `optimize?: bool` - optimize the component with Binaryen wasm-opt first.
* `optArgs?: string[]` - if using optimize, custom optimization options (defaults to best optimization, but this is very slow)

#### `opt(component: Uint8Array, opts?): Promise<{ component: Uint8Array }>`

_Optimize a Component with the [Binaryen Wasm-opt](https://www.npmjs.com/package/binaryen) project._

#### `parse(wat: string): Uint8Array`

_Parse a compoment WAT to output a Component binary._

#### `print(component: Uint8Array): string`

_Print the WAT for a Component binary._

#### `componentNew(coreWasm: Uint8Array | null, opts?): Uint8Array`

_"WIT Component" Component creation tool._

#### `componentWit(component: Uint8Array): string`

_Extract the WIT world from a component binary._

## JSCT CLI

The CLI is available via the `jsct` command, providing all the same
functions and options as the API.

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.