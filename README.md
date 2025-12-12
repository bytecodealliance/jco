<div align="center">
  <h1><code>jco</code></h1>

  <p>
    <strong>JavaScript tooling for <a href="https://github.com/WebAssembly/component-model">WebAssembly Components</a></strong>
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

Jco (`jco`) provides a [Javascript][js]-native toolchain for working with [WebAssembly Components][cm-book].

**Jco aims to be a convenient multi-tool for the JS WebAssembly ecosystem.**

With Jco (and related projects in this repository), you can:

- **Build WebAssembly components** from Javascript/Typescript with the help of [`componentize-js`][cjs]
- **"Transpile" WebAssembly components** into ES modules that can run in environments like NodeJS and the browser, combining platform-native WebAssembly core support with the advanced features of WebAssembly Components
- **Run WebAssembly components** whether single-shot applications or web servers (similar to [`wasmtime run`][wasmtime-run]/[`wasmtime serve`][wasmtime-serve])
- **Reuse WebAssembly component workflows** (e.g. building components, transpiling, etc) from your own JS projects
- **Utilize [`wasm-tools`][wt]** as a library from JS

[cm-book]: https://component-model.bytecodealliance.org/
[js]: https://developer.mozilla.org/en-US/docs/Web/JavaScript
[cjs]: https://github.com/bytecodealliance/componentize-js
[wt]: https://github.com/bytecodealliance/wasm-tools
[wasmtime-serve]: https://docs.wasmtime.dev/cli-options.html#serve
[wasmtime-run]: https://docs.wasmtime.dev/cli-options.html#run

## Organization

As Jco aims to do many things, it contains many subprojects that are organized in this repository:

| Subproject                       | Language   | Directory                               | Description                                                                                     |
|----------------------------------|------------|-----------------------------------------|-------------------------------------------------------------------------------------------------|
| `jco`                            | Javascript | `packages/jco`                          | The `jco` CLI                                                                                   |
| `jco-transpile`                  | Javascript | `packages/jco-transpile`                | WebAssembly Component Transpilation functionaltiy                                               |
| `preview2-shim`                  | Javascript | `packages/preview2-shim`                | Library that provides a mapping of [WASI Preview 2][wasi-p2] for NodeJS and Browsers            |
| `preview3-shim`                  | Javascript | `packages/preview3-shim`                | Library that provides a mapping of WASI Preview 3 for NodeJS                                    |
| `js-component-bindgen`           | Rust       | `crates/js-component-bindgen`           | Enables `jco transpile` and other features, reusing the Rust WebAssembly ecosystem              |
| `js-component-bindgen-component` | Rust       | `crates/js-component-bindgen-component` | WebAssembly component that (when transpiled) makes `js-component-bindgen` available in JS `jco` |
| `wasm-tools-component`           | Rust       | `crates/wasm-tools-component`           | WebAssembly component containing pieces of [`wasm-tools`][wt] used by `jco`                     |

[wasi-p2]: https://github.com/WebAssembly/WASI/blob/main/docs/Preview2.md

## Quickstart

Jco can be used as either a library import or as a CLI via the `jco` command.

To install it, use `npm` (or your favorite `npm` equivalent):

```console
npm install @bytecodealliance/jco
```

> [!NOTE]
> If you're using jco to build components, you should also install `componentize-js`, which is dynamically imported:
>
> ```console
> npm install @bytecodealliance/componentize-js
> ```

### Building an example component

For instructions on how to build an example component, see the [Component model section on Javascript][cm-book-js].

To see examples of common patterns, check out the [example components folder (`examples/components`)](./examples/components).

[cm-book-js]: https://component-model.bytecodealliance.org/language-support/javascript.html

## Learn more

For a deeper guide on the intricacies of Jco, read the [Jco Book][jco-book].

[jco-book]: https://bytecodealliance.github.io/jco/

## Installation quirks

### Node 18.x

If installing on Node 18.x with a version of `@bytecodealliance/componentize-js` 0.18.3 or above, you may need to install `oxc-parser` manually.

For example, on linux this would mean the following:

```console
npm install oxc-parser --ignore-engines
npm install @oxc-parser/binding-linux-x64-gnu --ignore-engines
```

It may be necessary to replace `@oxc-parser/binding-linux-x64-gnu` with whatever platform is appropriate.

> [!NOTE]
> Similar installation issues may occur if using an `npm` version older than 11.3.0, 
> due to [`npm` bugs related to optional dependencies][npm-opt-deps-issues]

[npm-opt-deps-issues]: https://github.com/npm/cli/issues/4828

## License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

## Contributing

See the [Contributing](https://bytecodealliance.github.io/jco/contributing.html) chapter of the Jco book.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
