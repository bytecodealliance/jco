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
- **Reuse WebAssembly component workflows** (e.g. building components, tranpsiling, etc) from your own JS projects
- **Utilize [`wasm-tools`][wt]** as a library from JS

[cm-book]: https://component-model.bytecodealliance.org/
[js]: https://developer.mozilla.org/en-US/docs/Web/JavaScript
[cjs]: https://github.com/bytecodealliance/componentize-js
[wt]: https://github.com/bytecodealliance/wasm-tools
[wasmtime-serve]: https://docs.wasmtime.dev/cli-options.html#serve
[wasmtime-run]: https://docs.wasmtime.dev/cli-options.html#run

## Organization

As Jco aims to do many things, it contains many subprojects that are organized in this repository:

| Subproject                          | Language   | Directory                               | Description                                                                                     |
|----------------------------------|------------|-----------------------------------------|-------------------------------------------------------------------------------------------------|
| `jco`                            | Javascript | `packages/jco`                          | The `jco` CLI                                                                                   |
| `preview2-shim`                  | Javascript | `packages/preview2-shim`                | Library that provides a mapping of [WASI Preview2][wasi-p2] for NodeJS and Browsers             |
| `js-component-bindgen`           | Rust       | `crates/js-component-bindgen`           | Enables `jco transpile` and other features, reusing the Rust WebAssembly ecosystem              |
| `js-component-bindgen-component` | Rust       | `crates/js-component-bindgen-component` | WebAssembly component that (when transipled) makes `js-component-bindgen` available in JS `jco` |
| `wasm-tools-component`           | Rust       | `crates/wasm-tools-component`           | WebAssembly component containing pieces of [`wasm-tools`][wt] used by `jco`                     |

[wasi-p2]: https://github.com/WebAssembly/WASI/tree/main/wasip2

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

## License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

## Contributing

See the [Contributing](https://bytecodealliance.github.io/jco/contributing.html) chapter of the Jco book.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
