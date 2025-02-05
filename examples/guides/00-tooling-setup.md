# 00 - Tooling Setup

To follow along with the guides, you'll need to have the Javscript for WebAssembly toolchain installed,
which means installing [`jco`][jco] and related tooling.

[`jco`][jco] is a fully native JS tool for working with the emerging WebAssembly
 Components specification in JavaScript.

> [!NOTE]
> [Typescript][ts] can *also* be used, given that it is transpiled to JS first by relevant tooling (`tsc`).
> `jco` includes a `jco guest-types` subcommand for generating typings that can be used with a Typescript component.

[jco]: https://github.com/bytecodealliance/jco
[ts]: https://typescriptlang.org

### Installing `jco`

[`jco`][jco] and [`componentize-js`][componentize-js] can be installed with standard NodeJS tooling:

```console
npm install -g @bytecodealliance/componentize-js @bytecodealliance/jco
```

> [!NOTE]
> `jco` and `componentize-js` can be installed in a project-local manner with `npm install -D`

[ComponentizeJS][componentize-js] provides tooling used by `jco` to transpile JS to Wasm, so installing both packages is required.

[componentize-js]: https://github.com/bytecodealliance/ComponentizeJS

### Contribute to this Guide!

The goal for this guide is to leave zero lingering questions. If you had substantial doubts/unaddressed questions
while going through this guide, [open up an issue](https://github.com/bytecodealliance/jco/issues/new) and we'll improve the docs together.
