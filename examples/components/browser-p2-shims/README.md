# Browser Preview 2 shims example

This example turns a small JavaScript program into a WebAssembly component and runs it in a browser
with `@bytecodealliance/preview2-shim`.

## Quickstart

From this directory:

```console
pnpm install
pnpm run all
pnpm run demo:open
```

`pnpm run all` follows the repository's example convention: it builds and transpiles the component,
then runs the Puppeteer browser test.

## Build

The build has two stages:

1. `jco componentize` builds `src/component.js` against the operations in `wit/component.wit`.
2. `jco transpile --instantiation async` creates a browser-loadable component in `demo/transpiled`.

The development server prints the local URL if it cannot open a browser automatically. A web server
is required because browsers do not allow the generated Wasm files to be loaded directly from a
`file:` URL.

## WASI interface examples

### `wasi:cli`

The CLI example exercises the WASI stdout and stderr streams:

- `write-to-stdout` uses the browser shim's default stdout behavior and writes to `console.log`.
- `write-to-stderr` runs in a separately instantiated component whose stderr handler writes into the
  red **STDERR output** panel on the page.

The two instances demonstrate that an embedding can use the browser defaults or inject isolated,
application-owned behavior without changing the component. The Puppeteer test launches the demo
through Vite, clicks both controls, and verifies that stdout reaches `console.log` while customized
stderr reaches the page.

The call path from the component to the browser is:

1. **Guest code:** `src/component.js` calls `console.log(message)` or `console.error(message)`.
2. **ComponentizeJS:** the componentized JavaScript runtime lowers that call to a write on the output
   stream returned by `wasi:cli/stdout.get-stdout` or `wasi:cli/stderr.get-stderr`. The stream itself
   is a `wasi:io/streams.output-stream` resource.
3. **Jco transpilation:** the generated component wrapper routes those WASI imports through the object
   returned by `WASIShim.getImportObject()`.
4. **Browser host:** the shim's default stdout handler decodes the bytes and calls `console.log`; the
   second shim instance instead sends stderr bytes to the page-owned handler.

The demo configures those two host behaviors with separate `WASIShim` instances:

```js
const defaultShim = new WASIShim();
const customShim = new WASIShim({
    stderr: {
        write(bytes) {
            stderrPanel.append(new TextDecoder().decode(bytes));
        },
    },
});
```

Each shim supplies the imports for one component instance. The default stream remains console-backed;
the custom stream is owned by the page.
