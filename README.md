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

- **Scaffold a new JavaScript or TypeScript component project** from a WIT world with `jco scaffold`
- **Build WebAssembly components** from Javascript/Typescript with [`componentize-js`][cjs] or [`componentize-qjs`][cqjs]
- **"Transpile" WebAssembly components** into ES modules that can run in environments like NodeJS and the browser, combining platform-native WebAssembly core support with the advanced features of WebAssembly Components
- **Run WebAssembly components** whether single-shot applications or web servers (similar to [`wasmtime run`][wasmtime-run]/[`wasmtime serve`][wasmtime-serve])
- **Reuse WebAssembly component workflows** (e.g. building components, transpiling, etc) from your own JS projects
- **Utilize [`wasm-tools`][wt]** as a library from JS

[cm-book]: https://component-model.bytecodealliance.org/
[js]: https://developer.mozilla.org/en-US/docs/Web/JavaScript
[cjs]: https://github.com/bytecodealliance/componentize-js
[cqjs]: https://github.com/andreiltd/componentize-qjs
[wt]: https://github.com/bytecodealliance/wasm-tools
[wasmtime-serve]: https://docs.wasmtime.dev/cli-options.html#serve
[wasmtime-run]: https://docs.wasmtime.dev/cli-options.html#run

## Organization

As Jco aims to do many things, it contains many subprojects that are organized in this repository:

| Subproject                       | Language   | Directory                               | Description                                                                                     |
|----------------------------------|------------|-----------------------------------------|-------------------------------------------------------------------------------------------------|
| `jco`                            | Javascript | `packages/jco`                          | The `jco` CLI                                                                                   |
| `jco-transpile`                  | Javascript | `packages/jco-transpile`                | WebAssembly Component Transpilation functionaltiy                                               |
| `jco-std`                        | Javascript | `packages/jco-std`                      | A "standard library" for Jco which provides integrations for popular JS frameworks/paradigms    |
| `jco-node-fs`                    | Rust/JS    | `packages/jco-node-fs`                  | Native Node.js filesystem helpers used by Jco's WASI shims                                      |
| `preview2-shim`                  | Javascript | `packages/preview2-shim`                | Library that provides a mapping of [WASI Preview 2][wasi-p2] for NodeJS and Browsers            |
| `preview3-shim`                  | Javascript | `packages/preview3-shim`                | Library that provides a mapping of WASI Preview 3 for NodeJS                                    |
| `rolldown-plugin-jco`            | Javascript | `packages/rolldown-plugin-jco`          | Rolldown and Rollup plugin for importing WebAssembly Components through Jco                     |
| `js-component-bindgen`           | Rust       | `crates/js-component-bindgen`           | Enables `jco transpile` and other features, reusing the Rust WebAssembly ecosystem              |
| `js-component-bindgen-component` | Rust       | `crates/js-component-bindgen-component` | WebAssembly component that (when transpiled) makes `js-component-bindgen` available in JS `jco` |
| `wasm-tools-component`           | Rust       | `crates/wasm-tools-component`           | WebAssembly component containing pieces of [`wasm-tools`][wt] used by `jco`                     |

[wasi-p2]: https://github.com/WebAssembly/WASI/blob/main/docs/Preview2.md

## Quickstart

Jco can be used as either a library import or as a CLI via the `jco` command.

To install it, use [`pnpm`][pnpm]:

```console
pnpm install @bytecodealliance/jco
```

[pnpm]: https://pnpm.io/

### Building an example component

Create a TypeScript component project using Jco's built-in WASI CLI world:

```console
pnpm exec jco scaffold my-command --wit builtin:wasi-command

# Note that you can also scaffold from an existing WIT package
# directory instead:
# jco scaffold my-component --wit path/to/wit
```

Scaffolding the project wil create a folder called `my-command` (the first argument to `jco scaffold`),
and you can swith to that folder and instantly build the component:

```console
cd my-command
pnpm install
pnpm check
pnpm test
pnpm build
```

> [!NOTE]
> To see examples of common patterns, check out the [example components folder (`examples/components`)](./examples/components).

Jco bundles three common starting points, which default to WASI 0.3:

- `builtin:wasi-command` uses the `wasi:cli/command` world from the upstream [WASI CLI WIT interfaces][wasi-cli-wit]
- `builtin:wasi-reactor` uses the `wasi:cli/imports` world from the upstream [WASI CLI WIT interfaces][wasi-cli-wit]
- `builtin:wasi-proxy` uses the `wasi:http/service` world from the upstream [WASI HTTP WIT interfaces][wasi-http-wit]

Add the `@0.2.x` suffix to use the bundled WASI 0.2 interfaces instead, for example
`builtin:wasi-command@0.2.x`. You can also pass a WIT file or package directory to `--wit` for a custom world.

The generated repository includes everything you need to get started:

- Guest (component)  typescript declarations
- Implementation skeleton code
- Node.js & web type-check and build scripts
- Configuration files
- README

> [!NOTE]
> See the [Jco Book][jco-book] for language, world, target, and package-manager options.

For more instructions on how to build an example component, see the [Component model section on Javascript][cm-book-js].

[cm-book-js]: https://component-model.bytecodealliance.org/language-support/javascript.html
[wasi-cli-wit]: https://github.com/WebAssembly/WASI/tree/main/proposals/cli/wit
[wasi-http-wit]: https://github.com/WebAssembly/WASI/tree/main/proposals/http/wit

## Learn more

For a deeper guide on the intricacies of Jco, read the [Jco Book][jco-book].

[jco-book]: https://bytecodealliance.github.io/jco/

## Installation quirks

### Supported NodeJS test matrix

`jco` and `jco-transpile` are tested against the current stable version (even numbered release) of NodeJS and
two versions before that one (e.g. if the current NodeJS version is 26.x, 24.x and 22.x are covered under CI)

### Node 18.x

If installing on Node 18.x with a version of `@bytecodealliance/componentize-js` 0.18.3 or above, you may need to install `oxc-parser` manually.

For example, on linux this would mean the following:

```console
pnpm install oxc-parser --ignore-engines
pnpm install @oxc-parser/binding-linux-x64-gnu --ignore-engines
```

It may be necessary to replace `@oxc-parser/binding-linux-x64-gnu` with whatever platform is appropriate.

> [!NOTE]
> If you are using pnpm *instaed* of pnpm, similar installation issues may occur when
> using an `npm` version older than 11.3.0, due to [`npm` bugs related to optional dependencies][npm-opt-deps-issues]

[npm-opt-deps-issues]: https://github.com/npm/cli/issues/4828

## License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

## Contributing

See the [Contributing](https://bytecodealliance.github.io/jco/contributing.html) chapter of the Jco book.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
