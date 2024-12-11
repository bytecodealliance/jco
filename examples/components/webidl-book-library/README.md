# `webidl-book-library`

This component showcases building WebAssembly components that line up with [WebIDL][webidl] interfaces by
using the experimental [built-in support for WebIDL in `jco`][jco-experimental-webidl].

We can accomplish this by:

- Writing WebIDL specifications
- Using [`webidl2wit`][webidl2wit] to turn WebIDL specifications into [WIT interfaces][wit]
- Using `jco componentize` to build Javascript WebAssembly components that target the relevant WIT interfaces

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
| [`jco`][jco]               | Javascript WebAssembly toolcahin | `npm install -g @bytecodealliance/jco`  |
| [`webidl2wit`][webidl2wit] | Converts WebIDL to WIT           | `cargo install --locked webidl2wit-cli` |

[jco]: https://github.com/bytecodealliance/jco
[webidl2wit]: https://github.com/wasi-gfx/webidl2wit

## Quickstart

Once dependencies are installed, you can use your favorite NodeJS package mangaer:

```console
npm install
npm run generate:wit
npm run build
```

> [!NOTE]
> To run all these steps at once, you can run `npm run all`

After running the component build, new WebAssembly binary will be available:

```
(( TODO: add output of npm run build ))
```
