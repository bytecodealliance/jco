# Browser Preview 2 shims example

This example turns a small JavaScript program into a WebAssembly component and runs it in a browser
with `@bytecodealliance/preview2-shim`.

The first iteration focuses on WASI CLI output streams:

- `write-to-stdout` uses the browser shim's default stdout behavior and writes to `console.log`.
- `write-to-stderr` runs in a separately instantiated component whose stderr handler writes into the
  red **STDERR output** panel on the page.

The two instances demonstrate that an embedding can use the browser defaults or inject isolated,
application-owned behavior without changing the component.

## Run the demo

From this directory:

```console
pnpm install
pnpm run all
pnpm run demo:open
```

`pnpm run all` follows the repository's example convention: it builds and transpiles the component,
then runs the Puppeteer browser test. The test launches the demo through Vite, clicks both controls,
and verifies that stdout reaches `console.log` while customized stderr reaches the page.

The build has two stages:

1. `jco componentize` builds `src/component.js` against the operations in `wit/component.wit`.
2. `jco transpile --instantiation async` creates a browser-loadable component in `demo/transpiled`.

The development server prints the local URL if it cannot open a browser automatically. A web server
is required because browsers do not allow the generated Wasm files to be loaded directly from a
`file:` URL.

## How customization works

The component uses `console.log` and `console.error`. ComponentizeJS lowers those calls to WASI CLI
stdout and stderr. The demo creates two `WASIShim` instances:

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
