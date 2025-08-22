# Typescript Resource Import Example

This project showcases a few things:

- A Javascript WebAssembly component that imports and uses a resource
- `Disposable` support in Typescript paired with `jco`'s generated `[Symbol.dispose]()` in types
- A custom implementation of the resource
- A custom embedding of the component that uses the custom resource

All of the above is done with Typescript, built via Rollup.

## Quickstart

To build this example into a demo page that you can visit, run:

```console
npm install
npm run all
```
> [!NOTE]
> Feel free to replace `npm` with whatever npm-compatible tooling you prefer.

The `all` script will:

- Build the component that uses the resrouce
- Transpile it
- Build the embedding
- Run the embeddign script which executes the transpiled component

<details>
<summary><h4>Expected output</h4></summary>

```console
> ts-resource-import@0.1.0 all
> npm run build && npm run transpile && npm run build:embedding && npm run run:embedding


> ts-resource-import@0.1.0 build
> npm run gen:types && npm run build:ts && npm run build:component


> ts-resource-import@0.1.0 gen:types
> jco guest-types -o generated/types/guest/import wit/ --world-name imported


  Generated Guest Typescript Definition Files (.d.ts):

 - generated/types/guest/import/imported.d.ts                             0.34 KiB
 - generated/types/guest/import/interfaces/test-component-resources.d.ts  0.17 KiB
 - generated/types/guest/import/interfaces/wasi-cli-run.d.ts               0.1 KiB


> ts-resource-import@0.1.0 build:ts
> rollup -c component.rollup.mjs


src/component.ts → dist/component.js...
(!) Unresolved dependencies
https://rollupjs.org/troubleshooting/#warning-treating-module-as-external-dependency
test:component/resources (imported by "src/component.ts")
created dist/component.js in 848ms

> ts-resource-import@0.1.0 build:component
> jco componentize -w wit/ --world-name imported dist/component.js -o dist/component.wasm

OK Successfully written dist/component.wasm.

> ts-resource-import@0.1.0 transpile
> jco transpile dist/component.wasm -o dist/transpiled --instantiation=async


  Transpiled JS Component Files:

 - dist/transpiled/component.core.wasm                          10.6 MiB
 - dist/transpiled/component.core2.wasm                         14.4 KiB
 - dist/transpiled/component.core3.wasm                         4.34 KiB
 - dist/transpiled/component.core4.wasm                         0.57 KiB
 - dist/transpiled/component.d.ts                               4.65 KiB
 - dist/transpiled/component.js                                  254 KiB
 - dist/transpiled/interfaces/test-component-resources.d.ts     0.17 KiB
 - dist/transpiled/interfaces/wasi-cli-run.d.ts                 0.07 KiB
 - dist/transpiled/interfaces/wasi-cli-stderr.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-stdin.d.ts               0.15 KiB
 - dist/transpiled/interfaces/wasi-cli-stdout.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-input.d.ts      0.22 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-output.d.ts     0.22 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stderr.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdin.d.ts       0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdout.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-clocks-monotonic-clock.d.ts  0.37 KiB
 - dist/transpiled/interfaces/wasi-clocks-wall-clock.d.ts        0.2 KiB
 - dist/transpiled/interfaces/wasi-filesystem-preopens.d.ts     0.19 KiB
 - dist/transpiled/interfaces/wasi-filesystem-types.d.ts        2.98 KiB
 - dist/transpiled/interfaces/wasi-http-outgoing-handler.d.ts   0.47 KiB
 - dist/transpiled/interfaces/wasi-http-types.d.ts              9.51 KiB
 - dist/transpiled/interfaces/wasi-io-error.d.ts                 0.2 KiB
 - dist/transpiled/interfaces/wasi-io-poll.d.ts                 0.28 KiB
 - dist/transpiled/interfaces/wasi-io-streams.d.ts              0.97 KiB
 - dist/transpiled/interfaces/wasi-random-random.d.ts           0.14 KiB


> ts-resource-import@0.1.0 build:embedding
> rollup -c embedding.rollup.mjs


embedding.mts → dist/transpiled/embedding.js...
(!) Circular dependency
../../../packages/preview2-shim/lib/browser/filesystem.js -> ../../../packages/preview2-shim/lib/browser/cli.js -> ../../../packages/preview2-shim/lib/browser/filesystem.js
created dist/transpiled/embedding.js in 1.2s

> ts-resource-import@0.1.0 run:embedding
> node dist/transpiled/embedding.js

constructed [LocalExample(1)]!
[LocalExample(1)] Hello WORLD!
disposing [LocalExample(1)]
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
> ts-resource-import@0.1.0 build
> npm run gen:types && npm run build:ts && npm run build:component


> ts-resource-import@0.1.0 gen:types
> jco guest-types -o generated/types/guest/import wit/ --world-name imported


  Generated Guest Typescript Definition Files (.d.ts):

 - generated/types/guest/import/imported.d.ts                             0.34 KiB
 - generated/types/guest/import/interfaces/test-component-resources.d.ts  0.17 KiB
 - generated/types/guest/import/interfaces/wasi-cli-run.d.ts               0.1 KiB


> ts-resource-import@0.1.0 build:ts
> rollup -c component.rollup.mjs


src/component.ts → dist/component.js...
(!) Unresolved dependencies
https://rollupjs.org/troubleshooting/#warning-treating-module-as-external-dependency
test:component/resources (imported by "src/component.ts")
created dist/component.js in 811ms

> ts-resource-import@0.1.0 build:component
> jco componentize -w wit/ --world-name imported dist/component.js -o dist/component.wasm

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
> ts-resource-import@0.1.0 transpile
> jco transpile dist/component.wasm -o dist/transpiled --instantiation=async


  Transpiled JS Component Files:

 - dist/transpiled/component.core.wasm                          10.6 MiB
 - dist/transpiled/component.core2.wasm                         14.4 KiB
 - dist/transpiled/component.core3.wasm                         4.34 KiB
 - dist/transpiled/component.core4.wasm                         0.57 KiB
 - dist/transpiled/component.d.ts                               4.65 KiB
 - dist/transpiled/component.js                                  254 KiB
 - dist/transpiled/interfaces/test-component-resources.d.ts     0.17 KiB
 - dist/transpiled/interfaces/wasi-cli-run.d.ts                 0.07 KiB
 - dist/transpiled/interfaces/wasi-cli-stderr.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-stdin.d.ts               0.15 KiB
 - dist/transpiled/interfaces/wasi-cli-stdout.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-input.d.ts      0.22 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-output.d.ts     0.22 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stderr.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdin.d.ts       0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdout.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-clocks-monotonic-clock.d.ts  0.37 KiB
 - dist/transpiled/interfaces/wasi-clocks-wall-clock.d.ts        0.2 KiB
 - dist/transpiled/interfaces/wasi-filesystem-preopens.d.ts     0.19 KiB
 - dist/transpiled/interfaces/wasi-filesystem-types.d.ts        2.98 KiB
 - dist/transpiled/interfaces/wasi-http-outgoing-handler.d.ts   0.47 KiB
 - dist/transpiled/interfaces/wasi-http-types.d.ts              9.51 KiB
 - dist/transpiled/interfaces/wasi-io-error.d.ts                 0.2 KiB
 - dist/transpiled/interfaces/wasi-io-poll.d.ts                 0.28 KiB
 - dist/transpiled/interfaces/wasi-io-streams.d.ts              0.97 KiB
 - dist/transpiled/interfaces/wasi-random-random.d.ts           0.14 KiB
```

</details>

The most important file in the generated bundle is `dist/transpiled/component.js` -- this is
the entrypoint for a (NodeJS, browser)script that wants to use the component we've just built.

[npm-p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim

## Build & Run the embedding

While the component we built can be run in a WebAssembly runtime like `wasmtime`, we can also run it
from NodeJS via V8's WebAssembly support now that it has been transpiled.

To be able to use our transpiled component, the included [`embedding.mts` script](./scripts/embedding.mts)
can be used:

```console
npm run embedding # or 'run:embedding' to skip the build
```

<details>
<summary><h4>Expected output</h4></summary>

You should see output like the following:

```
> ts-resource-import@0.1.0 embedding
> npm run build:embedding && npm run run:embedding


> ts-resource-import@0.1.0 build:embedding
> rollup -c embedding.rollup.mjs


embedding.mts → dist/transpiled/embedding.js...
(!) Circular dependency
../../../packages/preview2-shim/lib/browser/filesystem.js -> ../../../packages/preview2-shim/lib/browser/cli.js -> ../../../packages/preview2-shim/lib/browser/filesystem.js
created dist/transpiled/embedding.js in 1.1s

> ts-resource-import@0.1.0 run:embedding
> node dist/transpiled/embedding.js

constructed [LocalExample(1)]!
[LocalExample(1)] Hello WORLD!
disposing [LocalExample(1)]
```

</details>
