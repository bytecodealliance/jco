# Simple WebAssembly `add` in JavaScript

This folder contains a simple Javascript project can built into a WebAssembly binary.

This is a [`node`][nodejs] CLI and browser based example implementation of running a component that exports the `reverse` interface from a JavaScript application.

It uses [`jco`][jco] to:

- Generate a WebAssembly component (`jco componentize`) that can be executed anywhere WebAssembly components run
- Generate JavaScript bindings (`jco transpile`) that execute the core functionality (in browser or compliant JS runtimes like NodeJS)

For another example of using `jco` with components in multiple environments, see the [`jco` example][docs-jco-example].

[nodejs]: https://nodejs.org
[jco]: https://bytecodealliance.github.io/jco/
[jco-example]: https://github.com/bytecodealliance/jco/blob/main/docs/src/example.md

# Component Interface

This component implements a simple [WebAssembly Interface Types ("WIT")][wit] interface:

```wit
package example:components;

world component {
    export add: func(x: s32, y: s32) -> s32;
}
```

A component that implements the `component` world exports a single function called `add` which takes in two signed integers and produces a signed integer as a result.

> [!NOTE]
> You can read more about [the WIT syntax][wit] online.

[wit]: https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md

# Quickstart

## Dependencies

First, install required dependencies:

```console
npm install
```

> [!NOTE]
> As this is a regular NodeJS project, you can use your package manager of choice (e.g. `yarn`, `pnpm`)

At this point, since this project is *just* NodeJS, you could use the module from any NodeJS project or browser project where appropriate.

That said, we'll be focusing on building the JS code we've written so far into a WebAssembly binary, which can run *anywhere* WebAssembly runtimes are supported,
including in other languages, and the browser.

## Building the WebAssembly binary

We can build a WebAssembly binary out of this JS project with `jco`:

```console
npm run build
```

A WebAssembly binary will be written to `add.wasm`.

## Running the binary in NodeJS via transpilation

While somewhat redundant in this JS-native context, we can use our produced WebAssembly binary (which could be written in *any* programming language) from JS projects with `jco`.

The process we want `jco` to perform for us is "transpilation" -- converting a WebAssembly binary into a JS module that can be run on any JS runtime that supports WebAssembly:

```console
npm run transpile
```

Transpilation produces files in `dist/transpiled` that enable the WebAssembly component (`add.wasm`) to run in any compliant JS runtime:

```
dist
└── transpiled
    ├── add.core.wasm
    ├── add.d.ts
    └── add.js
```

With this transpiled module available, we can now run native JS code *uses* the WebAssembly module:

```
npm run transpiled-js
```

See `run-transpiled.js` for the full code listing.
