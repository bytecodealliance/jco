# WASI `http-hello-world` in JavaScript

This folder contains a WebAssembly Javascript component that uses [`wasi:http`][wasi-http] for enabling HTTP handlers in Javascript.

It uses [`jco`][jco] to:

- Generate a WebAssembly component (via `jco componentize`) that can be executed by a WebAssembly runtime (ex. [`wasmtime serve`][wasmtime])

[nodejs]: https://nodejs.org
[jco]: https://bytecodealliance.github.io/jco/
[wasi-http]: https://github.com/WebAssembly/wasi-http
[wasmtime]: https://github.com/bytecodealliance/wasmtime

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

## Building the WebAssembly component

We can build a WebAssembly component binary out of this JS project with `jco`:

```console
npm run build
```

A WebAssembly binary will be written to `string-reverse.wasm`.

## Serving web requests with the WebAssembly component

To run the component and serve requests we can either use `jco` or `wasmtime`:

```console
$ jco serve http-hello-world.wasm
Server listening on 8000...
```

Similarly you can also use `wasmtime`:

```
$ wasmtime serve -S common http-hello-world.wasm
Serving HTTP on http://0.0.0.0:8080/
```

With either approach, you can use `curl` the appropriate URL to trigger your WebAssembly component.

> [!NOTE]
> The implementations of `jco serve` and `wasmtime serve` are what actually *fulfill* all the imports
> of your component (see combined/merged `world root` above), and use the `wasi:http/incoming-handler` *export*
> to make web serving actually happen.

# How it works

## Exploring this Component WIT

As WebAssembly components are powered by a [WebAssembly Interface Types ("WIT")][wit]-first workflow, making
a HTTP handler component in WebAssembly requires creating a WIT contract to represent that component.

This folder contains a `wit` directory (by convention) with the following content in `component.wit`:

```wit
package example:http-hello-world;

world component {
    export wasi:http/incoming-handler@0.2.0;
}
```

> [!NOTE]
> See [`wit/component.wit`](./wit/component.wit)
>
> For more information on the WIT syntax, see [WIT design docs][wit]

We make use of the [WebAssembly System Interface ("WASI") HTTP][wasi-http] interface here, pulling in
pre-established interfaces interfaces for serving *incoming* HTTP requests.

[wasi-http]: https://github.com/WebAssembly/wasi-http
[wit]: https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md

## Resolving references WebAssembly types

As we intend to use the WASI HTTP interface, we need to pull in WIT interface(s) and types that are referred to by
the `wasi:http/incoming-handler` interface.

One way fo doing this is *downloading* the WIT from Bytecode Alliance repositories, using [`wkg`, from the `bytecodealliance/wasm-pkg-tools`][wkg].

Since WASI is a growing standard, and well integrated we can generally follow the error messages:

```console
wkg get wasi:http@0.2.0
wkg get wasi:random@0.2.0
wkg get wasi:cli@0.2.0
wkg get wasi:filesystem@0.2.0
wkg get wasi:sockets@0.2.0
wkg get wasi:io@0.2.0
wkg get wasi:clocks@0.2.0
```

> [!NOTE]
> How do we know all these are required? After getting `wasi:http` you can generally follow the error messages.

This will add many WIT files to your local repository, but you can move/rename all the downloaded `*.wit` files
by making a folder named `deps` under `wit` and dropping them there.

```console
mkdir wit/deps
mv *.wit wit/deps
```

### Typescript support

While this component is written completely in Javascript with no typing, Typescript support can be easily
added by using the `jco types` subcommand, by providing the WIT directory as input (`wit/`), now that we
have the required WIT dependencies in place.


Running `jco types` (possible also via the node script) should look similar to the following:

```
jco types wit/ -o types/


  Generated Type Files:

 - types/interfaces/wasi-clocks-monotonic-clock.d.ts  1.15 KiB
 - types/interfaces/wasi-http-incoming-handler.d.ts   0.88 KiB
 - types/interfaces/wasi-http-types.d.ts              24.1 KiB
 - types/interfaces/wasi-io-error.d.ts                0.41 KiB
 - types/interfaces/wasi-io-poll.d.ts                 1.33 KiB
 - types/interfaces/wasi-io-streams.d.ts              8.91 KiB
 - types/wit.d.ts                                     0.47 KiB
```

Note that while we're generating types to match the WIT interfaces, the *implementations* of those interfaces
are not bound yet, and likely will not be until runtime.

The generated types can serve as a good reference for pure JS code.

> [!NOTE]
> To get a feel for what the generated types refer to, see the [`wasi:http` WIT interface repository][wasi-http].

[wkg]: https://github.com/bytecodealliance/wasm-pkg-tools

## Building our component

To turn our JS into a WebAssembly component, we can use `jco componentize`:

```console
jco componentize http-hello-world.js --wit wit/ --world-name component --out http-hello-world.wasm
```

> [!NOTE]
> For ease, you can do all of this with `pnpm build` or `npm run build`, or your npm-compatible build tool of choice.

You should see output like the following:

```
pnpm build

> http-hello-world-wasm@ build /path/to/jco/examples/components/http-hello-world
> jco componentize http-hello-world.js --wit wit/ --world-name component --out http-hello-world.wasm

OK Successfully written http-hello-world.wasm.
```

Now that your component has been built, we can do *alot* of things to inspect it. Here are a few:

```
➜ file http-hello-world.wasm
http-hello-world.wasm: WebAssembly (wasm) binary module version 0x1000d
```
