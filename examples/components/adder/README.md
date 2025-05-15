# Simple WebAssembly `adder` in JavaScript

> [!NOTE]
> This component is tied to the [Javascript section of the Component Model book][cm-book-js]

[cm-book-js]: https://component-model.bytecodealliance.org/language-support/javascript.html

This project contains a simple Javascript module that can built into a WebAssembly binary.

This project also contains a [`node`][nodejs] script that can run the resulting component, thanks to `jco transpile`.

[`jco`][jco] is used to:

- Build a WebAssembly component (`jco componentize`) that can be executed anywhere WebAssembly components run
- Generate bindings (`jco transpile`) that execute the WebAssembly component from NodeJS & Browser environments

For another example of using `jco` with components in multiple environments, see the [`jco` example][docs-jco-example].

[nodejs]: https://nodejs.org
[jco]: https://bytecodealliance.github.io/jco/
[jco-example]: https://github.com/bytecodealliance/jco/blob/main/docs/src/example.md

# Component Interface

This component implements the [`adder` world][adder-world] [WebAssembly Interface Types ("WIT")][wit] interface:

```wit
package docs:adder@0.1.0;

interface add {
    add: func(x: u32, y: u32) -> u32;
}

world adder {
    export add;
}
```

A component that implements the `adder` world exports a single interface called `add`, which contains an `add` function
which takes in two signed integers and produces a signed integer as a result.

[adder-world]: https://github.com/bytecodealliance/component-docs/tree/main/component-model/examples/tutorial/wit/adder/world.wit
[wit]: https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md

# Quickstart

## Dependencies

First, install required dependencies:

```console
npm install
```

> [!NOTE]
> As this is a regular NodeJS project, you can use your package manager of choice (e.g. `yarn`, `pnpm`)

## Building the WebAssembly binary

We can build a WebAssembly binary out of the `adder.js` JS module with `jco`:

```console
npm run build
```

A WebAssembly binary will be written to `adder.wasm`.

## Running the binary in NodeJS via transpilation

While somewhat redundant in this JS-native context, we can use our produced WebAssembly binary
(which could be written in *any* programming language) from JS projects with `jco`.

The process we want `jco` to perform for us is "transpilation" -- converting a WebAssembly binary
into a JS module that can be run on any JS runtime that supports WebAssembly:

```console
npm run transpile
```

Transpilation produces files in `dist/transpiled` that enable the WebAssembly component (`adder.wasm`) to run in any compliant JS runtime:

```
dist
└── transpiled
    ├── adder.core.wasm
    ├── adder.d.ts
    └── adder.js
```

With this transpiled module available, we can now run native JS code *uses* the WebAssembly module:

```
npm run transpiled-js
```

See `run-transpiled.js` for the full code listing.
