# `string-reverse-upper` (`reverse()` + `toUpper()`) in JavaScript, with WebAssembly composition

This folder contains a Javascript project that can be built into a WebAssembly component binary.

This is a `node` CLI and browser based example implementation of running a component that exports the `reversed-upper` interface from a JavaScript application.

It uses [`jco`](https://bytecodealliance.github.io/jco/) to:

- Generate a WebAssembly component (`jco componentize`) that can be executed anywhere WebAssembly components run
- Generate JavaScript bindings (`jco transpile`) that execute the core functionality (in browser or compliant JS runtimes like NodeJS)
- Build a component that *composes with another component*

For another example of using `jco` with components in multiple environments, see the [`jco` example](https://github.com/bytecodealliance/jco/blob/main/docs/src/example.md).

# Component Interface

This component *uses* functionality provided by another binary to export *new* functionality, with the following interface:

```wit
package example:string-reverse-upper@0.1.0;

@since(version = 0.1.0)
interface reversed-upper {
    reverse-and-uppercase: func(s: string) -> string;
}

world revup {
    //
    // NOTE, the import below translates to:
    // <namespace>:<package>/<interface>@<package version>
    //
    import example:string-reverse/reverse@0.1.0;

    export reversed-upper;
}
```

> [!NOTE]
> You can read more about [the WIT syntax][wit] online.

# Quickstart

## Dependencies

First, install required dependencies:

```console
npm install
```

> [!NOTE]
> As this is a regular NodeJS project, you can use your package manager of choice (e.g. `yarn`, `pnpm`)

## Building the WebAssembly binary (pre-composition)

Then, build the component with `jco`:

```console
npm run build
```

A WebAssembly binary will be written to `string-reverse-upper.incomplete.wasm`.

Note that this binary is still not *complete* (hence the name) -- it `import`s functionality that is not yet defined/accessible in any way.

We can confirm this incompleteness with `jco` via the compiled binary itself, by running `jco wit`:

```console
jco wit string-reverse-upper.incomplete.wasm
```

You should see output like:

```wit
package root:component;

world root {
  import example:string-reverse/reverse@0.1.0;

  export example:string-reverse-upper/reversed-upper@0.1.0;
}

```

Just like our `wit/component.wit`, this component `import`s functionality, but that functionality must be provided by *something* (in WebAssembly Component-Model terms, either the host or another component).

## Composing in the `reverse()` functionality from another WebAssembly binary

Since the `string-reverse-upper.incomplete.wasm` we just built component *uses* (depends on) another component, we must *compose* the component with the functionality we need.

The component we will be composing with our as-of-yet incomplete binary *must* satisfy the `import`ed interface (`example:string-reverse/reverse@0.1.0`, defined in [`wit/deps/string-reverse-wit`](./wit/deps/string-reverse.wit)).

> [!NOTE]
> You may notice that the interface there is identical to [the one defined in the `string-reverse` example](../string-reverse/wit/component.wit)

```console
npm run compose
```

Running the command above will produce a `string-reverse-upper.wasm` file (this time, that is *complete*).

After running component composition, there will be a component with all its imports satisfied, called `string-reverse-upper.composed.wasm`.

We can confirm this with `jco wit`:

```console
jco wit string-reverse-upper.incomplete.wasm
```

You should see output like:

```
package root:component;

world root {
  export example:string-reverse-upper/reversed-upper@0.1.0;
}
```

## Transpiling the composed (complete) component to run it from native JS

We can transpile that *composed* component to a JS module with `jco`:

```console
npm run transpile
```

Transpilation produces files in `dist/transpiled` that enable the WebAssembly component (`string-reverse.wasm`) to run in any compliant JS runtime:

```
dist
└── transpiled
    ├── interfaces
    │   └── example-string-reverse-upper-reversed-upper.d.ts
    ├── string-reverse-upper.core2.wasm
    ├── string-reverse-upper.core.wasm
    ├── string-reverse-upper.d.ts
    └── string-reverse-upper.mjs
```

With this transpiled code available, we can now run native NodeJS code that will *use* the WebAssembly module:

```
npm run transpiled-js
```

> [!NOTE]
> You might have noticed that [Typescript declaration files][ts-decl-files] were also produced.
>
> As Typescript tranpsiles to Javascript, you *can* build WebAssembly components with Typescript
> granted you bring a transpiler (like `tsc`), and use the generated declaration files.
>

[ts-decl-files]: https://www.typescriptlang.org/docs/handbook/2/type-declarations.html
