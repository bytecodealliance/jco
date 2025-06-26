# Hono HTTP server example

This repository showcases using a WebAssembly component built with the Javascript WebAssembly Component
toolchain (`jco`) to respond to web requests using the [Hono][hono] web framework.

## How it works

Handling web requests is part of [WebAssembly System Interface (WASI)][wasi], under an interface called [`wasi:http`][wasi-http]
(in particular `wasi:http/incoming-handler`), thanks to [StarlingMonkey][sm] which is used when running `jco componentize`.

Hono works with WASI without any major changes because it is extraordinarily *standards compliant*.
Since StarlingMonkey supports web standards (pushed forward by the [WinterCG/WinterTC][wintertc]),
Hono works easily with WASI standard compatible runtimes like StarlingMonkey.

To *use* our request handling component from NodeJS environments, we can use `jco transpile` to run the
component. This serves as a "virtual" WebAssembly + WASI host (see [`@bytecodealliance/preview2-shim`][p2-shims])
that handles incoming HTTP requests (`wasi:http/incoming-handler`).

> [!NOTE]
> WebAssembly components are *not* the same as WebAssembly Modules (asm.js, emscripten, etc),
> they are much more powerful and support many more features.
>
> If you don't know what any of the above means, don't worry about it -- check out the [Component Model Book][cm-book],
> or keep following along and experiment!

[hono]: https://hono.dev
[sm]: https://github.com/bytecodealliance/StarlingMonkey
[wasi]: https://github.com/WebAssembly/WASI/tree/main
[mdn-fetch]: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
[wasi-http]: https://github.com/WebAssembly/wasi-http
[p2-shims]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim
[cm-book]: https://component-model.bytecodealliance.org/
[wintertc]: https://wintertc.org/

## Quickstart

To build this example into a demo page that you can visit, run:

```console
npm install
npm run all
```
> [!NOTE]
> Feel free to replace `npm` with whatever npm-compatible tooling you prefer.

The `all` script will:

- Build the component
- Transpile it
- Serve the WebAssembly component (via `demo.js`), using the `jco serve` (do not use this in production!)
- Send a single request to trigger the output

<details>
<summary><h4>Expected output</h4></summary>

```console
> http-server-hono@0.1.0 all
> npm run build && npm run demo


> http-server-hono@0.1.0 build
> npm run gen:types && npm run build:js && npm run build:component


> http-server-hono@0.1.0 gen:types
> jco guest-types wit -o generated/types


  Generated Guest Typescript Definition Files (.d.ts):

 - generated/types/interfaces/wasi-cli-environment.d.ts         0.76 KiB
 - generated/types/interfaces/wasi-clocks-monotonic-clock.d.ts  0.42 KiB
 - generated/types/interfaces/wasi-http-incoming-handler.d.ts   0.92 KiB
 - generated/types/interfaces/wasi-http-types.d.ts              26.8 KiB
 - generated/types/interfaces/wasi-io-error.d.ts                0.19 KiB
 - generated/types/interfaces/wasi-io-poll.d.ts                 0.26 KiB
 - generated/types/interfaces/wasi-io-streams.d.ts               1.3 KiB
 - generated/types/wit.d.ts                                     1.19 KiB


> http-server-hono@0.1.0 build:js
> rollup -c


src/component.ts → dist/component.js...
(!) Circular dependency
../../../node_modules/hono/dist/request.js -> ../../../node_modules/hono/dist/utils/body.js -> ../../../node_modules/hono/dist/request.js
created dist/component.js in 1s

> http-server-hono@0.1.0 build:component
> jco componentize -w wit -o dist/component.wasm dist/component.js

ALL  /*
       logger2
GET  /
       [handler]
OK Successfully written dist/component.wasm.

> http-server-hono@0.1.0 demo
> node scripts/demo.js

fetch() OUTPUT:
Hello world!
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

### Install WIT dependencies

> [!NOTE]
> This step is already done for you (the files are present in this repo). But the following steps are useful if you need to add / modify the `component.wit` and need to update the `wit/deps` to correspond.

This project makes use of the [`wasi:http`][wasi-http] and [`wasi:cli`][wasi-cli] interfaces, and they have to be
installed from the central repository.

If using [`wkg`][wkg] (standard ecosystem tooling for pulling WIT interfaces), you can do this in one step:

```console
wkg wit fetch
```

> [!NOTE]
> Generally, files in `wit/deps` are usually third party dependencies managed by WebAssembly ecosystem tooling,
> contrasted with the first party WIT for your component (ex. `wit/component.wit`).

[wkg]: https://github.com/bytecodealliance/wasm-pkg-tools/tree/main
[wasi-cli]: https://github.com/WebAssembly/wasi-cli

### Build the WebAssembly component

You can build the [Javascript code in `component.js`](./src/component.js) into a WebAssembly component by running:

```console
npm run build
```

<details>
<summary><h4>Expected output</h4></summary>

You should see output like the following:

```console
> http-server-hono@0.1.0 build
> npm run gen:types && npm run build:js && npm run build:component


> http-server-hono@0.1.0 gen:types
> jco guest-types wit -o generated/types


  Generated Guest Typescript Definition Files (.d.ts):

 - generated/types/interfaces/wasi-cli-environment.d.ts         0.76 KiB
 - generated/types/interfaces/wasi-clocks-monotonic-clock.d.ts  0.42 KiB
 - generated/types/interfaces/wasi-http-incoming-handler.d.ts   0.92 KiB
 - generated/types/interfaces/wasi-http-types.d.ts              26.8 KiB
 - generated/types/interfaces/wasi-io-error.d.ts                0.19 KiB
 - generated/types/interfaces/wasi-io-poll.d.ts                 0.26 KiB
 - generated/types/interfaces/wasi-io-streams.d.ts               1.3 KiB
 - generated/types/wit.d.ts                                     1.19 KiB


> http-server-hono@0.1.0 build:js
> rollup -c


src/component.ts → dist/component.js...
(!) Circular dependency
../../../node_modules/hono/dist/request.js -> ../../../node_modules/hono/dist/utils/body.js -> ../../../node_modules/hono/dist/request.js
created dist/component.js in 1s

> http-server-hono@0.1.0 build:component
> jco componentize -w wit -o dist/component.wasm dist/component.js

ALL  /*
       logger2
GET  /
       [handler]
OK Successfully written dist/component.wasm.
```

</details>

#### Aside: Components & WebAssembly System Interface (WASI)

WebAssembly Components are built against the system interfaces available in [WASI][wasi].

For example, using a tool called [`wasm-tools`][wasm-tools] we can see the imports and exports
of the component we've just built:

```
wasm-tools component wit dist/component.wasm
```

You should see output that looks something like this:

```wit
package root:component;

world root {
  import wasi:cli/environment@0.2.3;
  import wasi:io/poll@0.2.3;
  import wasi:clocks/monotonic-clock@0.2.3;
  import wasi:io/error@0.2.3;
  import wasi:io/streams@0.2.3;
  import wasi:http/types@0.2.3;
  import wasi:cli/stdin@0.2.3;
  import wasi:cli/stdout@0.2.3;
  import wasi:cli/stderr@0.2.3;
  import wasi:cli/terminal-input@0.2.3;
  import wasi:cli/terminal-output@0.2.3;
  import wasi:cli/terminal-stdin@0.2.3;
  import wasi:cli/terminal-stdout@0.2.3;
  import wasi:cli/terminal-stderr@0.2.3;
  import wasi:clocks/wall-clock@0.2.3;
  import wasi:filesystem/types@0.2.3;
  import wasi:filesystem/preopens@0.2.3;
  import wasi:random/random@0.2.3;
  import wasi:http/outgoing-handler@0.2.3; /// <---- This import is used by `fetch()`!

  export wasi:http/incoming-handler@0.2.3; /// <---- This export enables responding to HTTP requests
}

/// ... elided ...
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
> http-server-hono@0.1.0 transpile
> jco transpile -o dist/transpiled dist/component.wasm


  Transpiled JS Component Files:

 - dist/transpiled/component.core.wasm                          11.3 MiB
 - dist/transpiled/component.core2.wasm                         16.1 KiB
 - dist/transpiled/component.core3.wasm                         6.37 KiB
 - dist/transpiled/component.d.ts                               2.37 KiB
 - dist/transpiled/component.js                                  265 KiB
 - dist/transpiled/interfaces/wasi-cli-environment.d.ts          0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-stderr.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-stdin.d.ts               0.15 KiB
 - dist/transpiled/interfaces/wasi-cli-stdout.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-input.d.ts      0.17 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-output.d.ts     0.17 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stderr.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdin.d.ts       0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdout.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-clocks-monotonic-clock.d.ts  0.37 KiB
 - dist/transpiled/interfaces/wasi-clocks-wall-clock.d.ts        0.2 KiB
 - dist/transpiled/interfaces/wasi-filesystem-preopens.d.ts     0.19 KiB
 - dist/transpiled/interfaces/wasi-filesystem-types.d.ts        2.93 KiB
 - dist/transpiled/interfaces/wasi-http-incoming-handler.d.ts    0.3 KiB
 - dist/transpiled/interfaces/wasi-http-outgoing-handler.d.ts   0.47 KiB
 - dist/transpiled/interfaces/wasi-http-types.d.ts              9.88 KiB
 - dist/transpiled/interfaces/wasi-io-error.d.ts                0.18 KiB
 - dist/transpiled/interfaces/wasi-io-poll.d.ts                 0.25 KiB
 - dist/transpiled/interfaces/wasi-io-streams.d.ts              1.14 KiB
 - dist/transpiled/interfaces/wasi-random-random.d.ts           0.14 KiB
```

</details>

The most important file in the generated bundle is `dist/transpiled/component.js` -- this is
the entrypoint for a (NodeJS, browser)script that wants to use the component we've just built.

[npm-p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim

## Run the Demo

To be able to use our transpiled component, the included [`demo.js` script](./scripts/demo.js) which uses `jco serve`
to serve the component.

To run the demo:

```console
npm run demo
```

<details>
<summary><h4>Expected output</h4></summary>

You should see output like the following:

```
> demo
> node demo.js

fetch() OUTPUT:
Hello World
```

</details>

## Potential Issues

Much of the Hono ecosystem *just works*, due to how Hono is built, so you can start to build more complex apps.

Where you *might* run into trouble is building/bundling the following:

- Leveraging [adapter-specific features](https://hono.dev/docs/helpers/adapter) where support has not been added (i.e. `env()`)
- Leveraging [third-party middleware](https://hono.dev/docs/middleware/third-party) or JS libraries that require runtime-specific features (Node built-ins, `node-gyp`, etc)
