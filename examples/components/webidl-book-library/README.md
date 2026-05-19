# `webidl-book-library`

This component showcases building WebAssembly components that line up with [WebIDL][webidl] interfaces by
using the experimental [built-in support for WebIDL in `jco`][jco-experimental-webidl].

We can accomplish this by:

- Writing WebIDL specifications
- Using [`webidl2wit`][webidl2wit] to turn WebIDL specifications into [WIT interfaces][wit]
- Using `jco componentize` to build Javascript WebAssembly components that target the relevant WIT interfaces
- Using `jco transpile` to compile that component to run in a JS context (like NodeJS)
- Writing host bindings (`demo.js`) that WebAssembly cna use

A common use case for WebIDL is targeting browsers, as the WebIDL is primarily used there
to document interfaces for the web platform. This example stops short of using the web platform
WebIDL in favor of showing a simpler modeled interace with WebIDL: a book library (see [`./book-library.webidl`](./book-library.webidl)).

[jco-experimental-webidl]: https://github.com/bytecodealliance/jco/blob/main/docs/src/transpiling.md#experimental-webidl-imports
[webidl]: https://en.wikipedia.org/wiki/Web_IDL
[wit]: https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md

## Dependencies

To run this example, you'll need the following tools

| Tool                       | Description                      | Install instructions                    |
|----------------------------|----------------------------------|-----------------------------------------|
| [`jco`][jco]               | Javascript WebAssembly toolcahin | `pnpm install -g @bytecodealliance/jco`  |
| [`webidl2wit`][webidl2wit] | Converts WebIDL to WIT           | `cargo install --locked webidl2wit-cli` |

[jco]: https://github.com/bytecodealliance/jco
[webidl2wit]: https://github.com/wasi-gfx/webidl2wit

## Quickstart

Once dependencies are installed, you can use your favorite NodeJS package manager to run the steps:

```console
pnpm install
pnpm run generate:wit
pnpm run generate:types
pnpm run build
pnpm run transpile
```

> [!NOTE]
> We recommend `pnpm` due to it's security-focused and space-saving features.


After running the component build, we can run the example code that uses our WebAssembly component,
and the WebIDL interface & implementation we made:

```
node demo.js
```
