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
- `write-to-stderr` uses an application-provided stderr handler that writes into the red
  **STDERR output** panel on the page.

The instance demonstrates that an embedding can keep one browser default while injecting isolated,
application-owned behavior for another stream. The Puppeteer test verifies that stdout reaches
`console.log` while customized stderr reaches the page.

The demo configures those two host behaviors on one `WASIShim` instance:

```js
const shim = new WASIShim({
    stderr: {
        write(bytes) {
            stderrPanel.append(new TextDecoder().decode(bytes));
        },
    },
});
```

The shim supplies all imports for one component instance. Stdout remains console-backed while stderr
is owned by the page.

### `wasi:clocks`

The component reads `wall-clock.now` and `monotonic-clock.now`. The page displays the browser-backed
wall time as ISO text and the monotonic value in milliseconds.

### `wasi:filesystem`

The component writes `hello world`, calls `sync-data`, and reads it back through a `/demo` preopen.
The host supplies a small adapter that reverses bytes at the storage boundary, so the component reads
`hello world` while the backing in-memory file contains `dlrow olleh`.

```js
new WASIShim({
    browserFilesystem: { adapter: reverseAdapter, preopens: { '/demo': fileData } },
});
```

### `wasi:http/incoming-handler`

The page uses `InMemoryHttpClient` to turn a fabricated Web `Request` into WASI HTTP resources, invoke
the component's exported incoming handler, and return its result as a Web `Response`.

### `wasi:sockets/tcp`

`InMemoryTcpSockets` gives the page a fake client and the host bridge a WASI server socket. The
component owns the `TCP:` echo logic; its small `socket-host` WIT import lets the bridge bind, listen,
accept, and move bytes because ComponentizeJS does not expose imported socket resources to JS guests.

### `wasi:sockets/udp`

`InMemoryUdpSockets` routes datagrams between a page-side client and the bridge's bound WASI socket.
The same WIT bridge moves the datagram while the component owns the `UDP:` echo logic.
