# WASI `fs-write-file` in JavaScript

This folder contains a WebAssembly Javascript component that uses [`wasi:filesystem`][wasi-fs] to write
a file to a pre-opened directory.

It uses [`jco`][jco] to:

- Generate a WebAssembly component (via `jco componentize`) that can be executed by a WebAssembly runtime (ex. [`wasmtime serve`][wasmtime])
- Transpile the component (via `jco transpile`) into one that can run on NodeJS

[nodejs]: https://nodejs.org
[jco]: https://bytecodealliance.github.io/jco/
[wasi-fs]: https://github.com/WebAssembly/WASI/tree/main/proposals/filesystem
[wasmtime]: https://github.com/bytecodealliance/wasmtime

# Quickstart

## Dependencies

First, install required dependencies:

```console
pnpm install
```

> [!NOTE]
> We recommend `pnpm` due to it's security-focused and space-saving features.

At this point, since this project is *just* NodeJS, you could use the module from any NodeJS project or browser project where appropriate.

That said, we'll be focusing on building the JS code we've written so far into a WebAssembly binary, which can run *anywhere*
WebAssembly runtimes are supported, including in other languages, and the browser (experimental support).

## Building the WebAssembly component

To turn our JS into a WebAssembly component, we can use `jco componentize`:

```console
jco componentize component.js --wit wit --world-name component --out dist/component.wasm
```

> [!NOTE]
> For ease, you can do all of this with `pnpm build` or `npm run build`, or your npm-compatible build tool of choice.

You should see output like the following:

```
pnpm build

> build
> jco componentize component.js --wit wit --world-name component --out dist/component.wasm

OK Successfully written dist/component.wasm.
```

Now that your component has been built, we can do *alot* of things to inspect it.

You can recognize a WebAssemblyc omponent versus a module via the magic strings recognized by tools like `file`:

```
$ file dist/component.wasm
dist/component.wasm: WebAssembly (wasm) binary version 0x1000d (component)
```


We can do all this quickly with the `build` script:

```console
pnpm run build
```

## Transpiling the WebAssembly component

To convert the component we built to a form in which it is runnable by any JS runtime with `WebAssembly` support, we use
`jco transpile`:

```console
jco transpile dist/component.wasm --instantiation=async -o dist/transpiled
```

This command takes `dist/component.wasm` and converts it into a folder with multiple files:

```
dist/transpiled
├── component.core2.wasm
├── component.core3.wasm
├── component.core4.wasm
├── component.core.wasm
├── component.d.ts
├── component.js
└── interfaces
    ├── jco-test-test.d.ts
    ├── wasi-cli-stderr.d.ts
    ├── wasi-cli-stdin.d.ts
    ├── wasi-cli-stdout.d.ts
    ├── wasi-cli-terminal-input.d.ts
    ├── wasi-cli-terminal-output.d.ts
    ├── wasi-cli-terminal-stderr.d.ts
    ├── wasi-cli-terminal-stdin.d.ts
    ├── wasi-cli-terminal-stdout.d.ts
    ├── wasi-clocks-monotonic-clock.d.ts
    ├── wasi-clocks-wall-clock.d.ts
    ├── wasi-filesystem-preopens.d.ts
    ├── wasi-filesystem-types.d.ts
    ├── wasi-http-outgoing-handler.d.ts
    ├── wasi-http-types.d.ts
    ├── wasi-io-error.d.ts
    ├── wasi-io-poll.d.ts
    ├── wasi-io-streams.d.ts
    └── wasi-random-random.d.ts

2 directories, 25 files
```

The files in this folder contain WebAssembly modules (i.e. what is supported by `WebAssembly` out of the box today), along with
glue code, and typescript necessary to interact with the interfaces that are used by your component.

We can do all of this quickly with the `transpile` script:

```console
pnpm run transpile
```

## Running the transpiled WebAssembly component

As we have now transpiled our WebAssembly Component into it's constituent modules and glue code, we can instantiate it
and use it from JS.

See the code in `run-transpiled.js`, importantly the following lines:

```js
import { instantiate } from "./dist/transpiled/component.js";

// ...

const instance = await instantiate(...);
```

Another set of important lines are the import and usage of a WASI Shim, which controls the sandbox in which
your WebAssembly component will execute:

```js
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

// ...

const shim = new WASIShim({
    sandbox: {
        preopens: {
            '/': CURRENT_PATH,
        },
    }
});

const instance = await instantiate(undefined, shim.getImportObject());
```

As WebAssembly has a capability-driven security model, all access to the filesytem must be provided explicitly.

To run the demo all at once:

```
pnpm run transpiled-js
```

# How it works

## Exploring this Component WIT

As WebAssembly components are powered by a [WebAssembly Interface Types ("WIT")][wit]-first workflow, making
a HTTP handler component in WebAssembly requires creating a WIT contract to represent that component.

This folder contains a `wit` directory (by convention) with the following content in `component.wit`:

```wit
package jco:test;

interface test {
    run: func() -> string;
}

world component {
    import wasi:filesystem/types@0.2.8;
    import wasi:filesystem/preopens@0.2.8;

    export test;
}
```

> [!NOTE]
> See [`wit/component.wit`](./wit/component.wit)
>
> For more information on the WIT syntax, see [WIT design docs][wit]

We make use of the [WebAssembly System Interface ("WASI") for filesystems][wasi-fs] interface here, pulling in
pre-established interfaces interfaces for getting a list of pre-opened directories.

[wasi-http]: https://github.com/WebAssembly/wasi-http
[wit]: https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md

## Resolving references WebAssembly types

As we intend to use the WASI FS interface, we need to pull in WIT interface(s) and types that are referred to by
the `wasi:filesystem/preopens` interface.

One way fo doing this is *downloading* the WIT from Bytecode Alliance repositories, using [`wkg`, from the `bytecodealliance/wasm-pkg-tools`][wkg].

With a top level world in `wit/component.wit`, we can easily fetch all automatically-resolvable interfaces:

```console
wkg wit fetch
```

> [!NOTE]
> Standard interfaces are automatically resolvable, but if custom interfaces are used, you'll need to configure `wkg`
> so it knows where to find the relevant WIT information.
