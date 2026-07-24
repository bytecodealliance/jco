# TypeScript component using Jco's built-in bundler

This project contains a multi-file TypeScript module that can be built into a WebAssembly component.
It also contains a [`node`][nodejs] script that runs the resulting component after `jco transpile`.

[`jco`][jco] is used to:

- Bundle and transform the TypeScript source without a separate `tsc`, Rollup, or other JavaScript build step
- Build a WebAssembly component (`jco componentize`) that can run in any Component Model runtime
- Generate JavaScript bindings (`jco transpile`) that execute the component in Node.js or browser environments

The example depends on `@bytecodealliance/jco` through `workspace:*` so it always exercises the version in
this repository.

[nodejs]: https://nodejs.org
[jco]: https://bytecodealliance.github.io/jco/

# Component Interface

This component implements the `component` world defined in [`wit/component.wit`](./wit/component.wit):

```wit
package examples:builtin-bundle-ts;

interface greeter {
  greet: func(name: string) -> string;
}

world component {
  export greeter;
}
```

The exported `greeter.greet` function takes a name and returns a greeting.

# Quickstart

## Dependencies

First, install the workspace dependencies:

```console
pnpm install
```

> [!NOTE]
> This example uses the workspace version of Jco because direct TypeScript componentization may not yet
> be available in the latest published package.

## Building the WebAssembly component

Build the component directly from the TypeScript entry module:

```console
pnpm run build
```

The build script runs:

```console
jco componentize src/component.ts \
  --wit wit/component.wit \
  --world-name component \
  --out component.wasm \
  --disable all
```

The command deliberately does not pass `--bundle`. TypeScript entries select Jco's built-in Rolldown bundler
automatically. Jco resolves the local `.ts` dependency graph, reads `tsconfig.json`, and erases TypeScript syntax
before ComponentizeJS runs.

Jco does not perform semantic type checking; run `tsc --noEmit` separately when a project requires that
validation.

## Running the component in Node.js via transpilation

Transpile `component.wasm` into a JavaScript ES module:

```console
pnpm run transpile
```

The generated files are written under `dist/transpiled`:

```text
dist
└── transpiled
    ├── component.core.wasm
    ├── component.d.ts
    └── component.js
```

Run the generated module from Node.js:

```console
pnpm run run
```

The command prints:

```text
Hello, TypeScript!
```

Run all three steps together with:

```console
pnpm run all
```
