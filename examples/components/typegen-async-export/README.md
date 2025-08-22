# Type generation for async exports

This project showcases type generation for an `async` export from a component built with `jco componentize`.

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
- Generate types for the component

<details>
<summary><h4>Expected output</h4></summary>

```console
> typegen-async-export@0.1.0 all
> npm run build && npm run run:wasmtime


> typegen-async-export@0.1.0 build
> npm run gen:types && npm run build:ts && npm run build:component


> typegen-async-export@0.1.0 gen:types
> jco guest-types -o generated/types --async-mode=jspi --async-exports=jco-examples:typegen-async-export/example#slow-double wit


  Generated Guest Typescript Definition Files (.d.ts):

 - generated/types/interfaces/jco-examples-typegen-async-export-example.d.ts  0.12 KiB
 - generated/types/wit.d.ts                                                   0.27 KiB


> typegen-async-export@0.1.0 build:ts
> rollup -c rollup.config.mjs


src/component.ts → dist/component.js...
created dist/component.js in 1.1s

> typegen-async-export@0.1.0 build:component
> jco componentize -w wit -o dist/component.wasm dist/component.js

OK Successfully written dist/component.wasm.

> typegen-async-export@0.1.0 run:wasmtime
> wasmtime run -Scli,http --invoke 'slow-double(1024)' dist/component.wasm

2048

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

### Generate types for WIT interface

Generating the types that reflect the exported WIT interfaces is simple:

```console
npm run gen:types
```

<details>
<summary><h4>Expected output</h4></summary>

You should see output like the following:

```
> typegen-async-export@0.1.0 gen:types
> jco guest-types -o generated/types --async-mode=jspi --async-exports=jco-examples:typegen-async-export/example#slow-double wit


  Generated Guest Typescript Definition Files (.d.ts):

 - generated/types/interfaces/jco-examples-typegen-async-export-example.d.ts  0.12 KiB
 - generated/types/wit.d.ts                                                   0.27 KiB

```

</details>

### Build the WebAssembly component

You can build the [Javascript code in `src/component.js`](./src/component.js) into a WebAssembly component by running:

```console
npm run build
```

<details>
<summary><h4>Expected output</h4></summary>

You should see output like the following:

```console
> typegen-async-export@0.1.0 build
> npm run gen:types && npm run build:ts && npm run build:component


> typegen-async-export@0.1.0 gen:types
> jco guest-types -o generated/types --async-mode=jspi --async-exports=jco-examples:typegen-async-export/example#slow-double wit


  Generated Guest Typescript Definition Files (.d.ts):

 - generated/types/interfaces/jco-examples-typegen-async-export-example.d.ts  0.12 KiB
 - generated/types/wit.d.ts                                                   0.27 KiB


> typegen-async-export@0.1.0 build:ts
> rollup -c rollup.config.mjs


src/component.ts → dist/component.js...
created dist/component.js in 1.2s

> typegen-async-export@0.1.0 build:component
> jco componentize -w wit -o dist/component.wasm dist/component.js

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
}

/// ... elided ...
```

> [!NOTE]
> The *meaning* of all of these `import`s and `export`s is somewhat out of scope for this example, so we won't discuss
> further, but please check out the [Component Model Book][cm-book] for more details.

To build a minimal component without unused imports (this component does not use `fetch()`), we use the `-d`/`--disable`
option when running `jco componentize` (see `package.json`).

[wasm-tools]: https://github.com/bytecodealliance/wasm-tools
