# WebAssembly Component with NodeJS `fetch()` shim

This repository showcases a WebAssembly component built with the Javascript WebAssembly Component
toolchain (`jco`) that performs web requests using the [`fetch()`][mdn-fetch] built-in.

WebAssembly components built with `jco` support making outgoing HTTP requests via WASI ([`wasi:http`][wasi-http]),
thanks to [StarlingMonkey][sm], the JS engine underneath which makes `fetch` natively available to components 
built with `jco componentize`.

In addition to building components, we can use `jco transpile` to run the component from NodeJS, serving 
as a "virtual" WebAssembly + WASI host (see [`@bytecodealliance/preview2-shim`][p2-shims]) that makes 
available HTTP request (`wasi:http/outgoing-handler`).

> [!NOTE]
> WebAssembly components are *not* the same as WebAssembly Modules (asm.js, emscripten, etc),
> they are much more powerful and support many more features.
>
> If you don't know what any of the above means, don't worry about it -- check out the [Component Model Book][cm-book],
> or keep following along and experiment!

[sm]: https://github.com/bytecodealliance/StarlingMonkey
[wasi]: https://github.com/WebAssembly/WASI/tree/main
[mdn-fetch]: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
[wasi-http]: https://github.com/WebAssembly/wasi-http
[p2-shims]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim
[cm-book]: https://component-model.bytecodealliance.org/

## Quickstart

To build this example into a demo page that you can visit, run:

```console
npm install
npm run demo
```
> [!NOTE]
> Feel free to replace `npm` with whatever npm-compatible tooling you prefer.

You should see output like the following:

<details>
<summary><h4>Expected output</h4></summary>

```
npm run demo

> demo
> npm run build:component && npm run transpile && npm run demo


> build:component
> jco componentize -w component.wit component.js -o component.wasm

OK Successfully written component.wasm.

> transpile
> jco transpile -o dist/transpiled component.wasm


  Transpiled JS Component Files:

 - dist/transpiled/component.core.wasm                          10.1 MiB
 - dist/transpiled/component.core2.wasm                         13.9 KiB
 - dist/transpiled/component.d.ts                               1.34 KiB
 - dist/transpiled/component.js                                  181 KiB
 - dist/transpiled/interfaces/wasi-cli-stderr.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-stdin.d.ts               0.15 KiB
 - dist/transpiled/interfaces/wasi-cli-stdout.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-input.d.ts       0.1 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-output.d.ts      0.1 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stderr.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdin.d.ts       0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdout.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-clocks-monotonic-clock.d.ts  0.31 KiB
 - dist/transpiled/interfaces/wasi-clocks-wall-clock.d.ts       0.19 KiB
 - dist/transpiled/interfaces/wasi-filesystem-preopens.d.ts     0.19 KiB
 - dist/transpiled/interfaces/wasi-filesystem-types.d.ts        2.89 KiB
 - dist/transpiled/interfaces/wasi-http-outgoing-handler.d.ts    0.5 KiB
 - dist/transpiled/interfaces/wasi-http-types.d.ts              8.73 KiB
 - dist/transpiled/interfaces/wasi-io-error.d.ts                0.08 KiB
 - dist/transpiled/interfaces/wasi-io-poll.d.ts                 0.14 KiB
 - dist/transpiled/interfaces/wasi-io-streams.d.ts              0.72 KiB
 - dist/transpiled/interfaces/wasi-random-random.d.ts           0.14 KiB


> node demo.js
```

</details>

## Step-by-step

Want to go through it step-by-step? Read along from here.

### Install dependencies

Similar to any other NodeJS project, you can install dependencies with `npm install`:

```console
npm install
```

> [!NOTE]
> Feel free to replace `npm` with whatever npm-compatible tooling you prefer.

### Build the WebAssembly component

You can turn the [Javascript code in `component.js`](./component.js) into a WebAssembly component by running:

```console
npm run build:component
```

<details>
<summary><h4>Expected output</h4></summary>

You should see output like the following:

```console
npm run build:component

> build:component
> jco componentize -w component.wit component.js -o component.wasm

OK Successfully written component.wasm.
```

</details>

#### Aside: Components & WebAssembly System Interface (WASI)

WebAssembly Components are built against the system interfaces available in [WASI][wasi].

For example, using a tool called [`wasm-tools`][wasm-tools] we can see the imports and exports
of the component we've just built. Here's a truncated version:

```wit
package root:component;

world root {
  import wasi:io/error@0.2.2;
  import wasi:io/poll@0.2.2;
  import wasi:io/streams@0.2.2;
  import wasi:cli/stdin@0.2.2;
  import wasi:cli/stdout@0.2.2;
  import wasi:cli/stderr@0.2.2;
  import wasi:cli/terminal-input@0.2.2;
  import wasi:cli/terminal-output@0.2.2;
  import wasi:cli/terminal-stdin@0.2.2;
  import wasi:cli/terminal-stdout@0.2.2;
  import wasi:cli/terminal-stderr@0.2.2;
  import wasi:clocks/monotonic-clock@0.2.2;
  import wasi:clocks/wall-clock@0.2.2;
  import wasi:filesystem/types@0.2.2;
  import wasi:filesystem/preopens@0.2.2;
  import wasi:random/random@0.2.2;
  import wasi:http/types@0.2.2;
  import wasi:http/outgoing-handler@0.2.2; // <---- This import is used by `fetch()`!

  export http-get: func(url: string) -> string; // <---- This export is implemented in `component.js`!
}
```

> [!NOTE]
> The *meaning* of all of these `import`s and `export`s is somewhat out of scope for this example, so we won't discuss
> further, but please check out the [Component Model Book][cm-book] for more details.

[wasm-tools]: https://github.com/bytecodealliance/wasm-tools

### Transpile the WebAssembly component for NodeJS

As we noted earlier, WebAssembly Components are built against the system interfaces available in [WASI][wasi].

One of the benefits of using components and WASI is that we can *reimplement* those interfaces when
the platform changes (this is sometimes called "virtual platform layering"). The host running the WebAssembly
component can provide dependencies as necessary.

Thanks to `jco transpile` we can take our WebAssembly component (or any other WebAssembly component) and use
it *on NodeJS*, by converting the WebAssembly component into code that `node` *can run today* and
[providing shims/polyfills][npm-p2-shim] for WASI functionality as necessary.

In practice this means producing a bundle of JS + WebAssembly Modules that can run in NodeJS:

```console
npm run transpile
```

<details>
<summary><h4>Expected output</h4></summary>

You should see output like the following:

```
> transpile
> jco transpile -o dist/transpiled component.wasm


  Transpiled JS Component Files:

 - dist/transpiled/component.core.wasm                          10.1 MiB
 - dist/transpiled/component.core2.wasm                         13.9 KiB
 - dist/transpiled/component.d.ts                               1.34 KiB
 - dist/transpiled/component.js                                  181 KiB
 - dist/transpiled/interfaces/wasi-cli-stderr.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-stdin.d.ts               0.15 KiB
 - dist/transpiled/interfaces/wasi-cli-stdout.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-input.d.ts       0.1 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-output.d.ts      0.1 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stderr.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdin.d.ts       0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdout.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-clocks-monotonic-clock.d.ts  0.31 KiB
 - dist/transpiled/interfaces/wasi-clocks-wall-clock.d.ts       0.19 KiB
 - dist/transpiled/interfaces/wasi-filesystem-preopens.d.ts     0.19 KiB
 - dist/transpiled/interfaces/wasi-filesystem-types.d.ts        2.89 KiB
 - dist/transpiled/interfaces/wasi-http-outgoing-handler.d.ts    0.5 KiB
 - dist/transpiled/interfaces/wasi-http-types.d.ts              8.73 KiB
 - dist/transpiled/interfaces/wasi-io-error.d.ts                0.08 KiB
 - dist/transpiled/interfaces/wasi-io-poll.d.ts                 0.14 KiB
 - dist/transpiled/interfaces/wasi-io-streams.d.ts              0.72 KiB
 - dist/transpiled/interfaces/wasi-random-random.d.ts           0.14 KiB
```

</details>

The most important file in the generated bundle is `dist/transpiled/component.js` -- this is
the entrypoint for a (NodeJS, browser)script that wants to use the component we've just built.

[npm-p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim

## Run the Demo

To be able to use our transpiled component, we'll need to write [a litte `demo.js` script](./demo.js) that NodeJS can execute.

To run the demo:

```console
npm run demo
```

<details>
<summary><h4>Expected output</h4></summary>

You should see output like the following:

```
> demo
```

</details>

The demo script executes the WebAssembly module which performs a HTTP GET request to a 
provided URL (or `https://example.com` by default).
