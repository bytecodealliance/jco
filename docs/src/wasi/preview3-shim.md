# Preview 3 shim

[`@bytecodealliance/preview3-shim`][npm-p3-shim] implements WASI 0.3 (`wasi:cli`, `wasi:clocks`,
`wasi:filesystem`, `wasi:http`, `wasi:random` and `wasi:sockets`) for Node.js and browsers. WASI
0.3 replaces the `wasi:io` streams and pollables of 0.2 with `stream<T>` and `future<T>` values
built into the component model, so there is no `io` subsystem to map.

```console
npm install @bytecodealliance/preview3-shim
```

`jco transpile` maps every supported 0.3.x version of a WASI interface to the current
`preview3-shim` implementation. A component built against an earlier 0.3 release therefore runs
against the newest implementation, which is acceptable because 0.3 releases are not expected to
introduce breaking changes.

Every subpath resolves to the Node.js build under the `node` export condition and to the browser
build otherwise, unless noted:

| Subpath                                        | Contents                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `@bytecodealliance/preview3-shim`              | Every subsystem namespace below, re-exported                        |
| `@bytecodealliance/preview3-shim/cli`          | `wasi:cli` environment, exit, run, stdio, and terminal interfaces   |
| `@bytecodealliance/preview3-shim/clocks`       | `wasi:clocks` wall and monotonic clocks                             |
| `@bytecodealliance/preview3-shim/filesystem`   | `wasi:filesystem` types and preopens, plus browser adapters         |
| `@bytecodealliance/preview3-shim/http`         | `wasi:http` types, client, and handler                              |
| `@bytecodealliance/preview3-shim/random`       | `wasi:random` secure and insecure randomness                        |
| `@bytecodealliance/preview3-shim/sockets`      | `wasi:sockets` TCP, UDP, and name lookup                            |
| `@bytecodealliance/preview3-shim/stream`       | Node.js only: `stream()`, `StreamReader`, and `StreamWriter`        |
| `@bytecodealliance/preview3-shim/future`       | Node.js only: `future()`, `FutureReader`, and `FutureWriter`        |
| `@bytecodealliance/preview3-shim/interfaces/*` | TypeScript declarations for each WASI interface                     |

## Instantiation and configuration

A transpiled 0.3 component imports the shim's subpaths directly, so running it is a matter of
configuring the shim's global state and calling the component's exports. The CLI setters mirror
those of the Preview 2 shim, and Preview 3 exports are asynchronous:

```js
import { _setArgs, _setEnv } from "@bytecodealliance/preview3-shim/cli";
import { _setPreopens } from "@bytecodealliance/preview3-shim/filesystem";

_setArgs(["component", "input.txt"]);
_setEnv({ MODE: "production" });
_setPreopens({ "/data": "/tmp/guest-data" }); // Node.js: guest path to host path

const component = await import("./dist/transpiled/component.js");
await component.run.run();
```

With `--instantiation async`, assemble the import object from the shim namespaces yourself,
keyed by the versioned interface names the component imports:

```js
import { cli, clocks, filesystem, random } from "@bytecodealliance/preview3-shim";
import { instantiate } from "./dist/transpiled/component.js";

const component = await instantiate(loader, {
    "wasi:cli/environment@0.3.0": cli.environment,
    "wasi:cli/stdout@0.3.0": cli.stdout,
    "wasi:clocks/monotonic-clock@0.3.0": clocks.monotonicClock,
    "wasi:filesystem/preopens@0.3.0": filesystem.preopens,
    "wasi:filesystem/types@0.3.0": filesystem.types,
    "wasi:random/random@0.3.0": random.random,
});
```

See [Manual Wasm instantiation with WASI overrides](../advanced/manual-wasm-instantiation-with-wasi-overrides.md)
for the instantiation flow; the Preview 3 shim has no `WASIShim` equivalent yet, so there is no
per-instance sandbox and the setters above apply to every component in the process.

## Working with asynchronous values

Preview 3 hosts exchange streams, futures, and async calls with the guest. A host import that
returns a `stream<u8>` provides any `ReadableStream` or async iterable; one that returns a
`future<T>` provides a `Promise`:

```js
async function* lines(source) {
    try {
        for await (const chunk of source) {
            yield chunk;
        }
    } finally {
        await source.close();
    }
}

const imports = {
    "example:host/input": {
        // stream<u8>
        open: () => lines(openSource()),
        // future<result<_, string>>
        ready: () => Promise.resolve({ tag: "ok", val: undefined }),
    },
};
```

On Node.js, `stream()` and `future()` build a paired writer and reader so host code can push
values into a guest-visible stream over time:

```js
import { stream } from "@bytecodealliance/preview3-shim/stream";
import { future } from "@bytecodealliance/preview3-shim/future";

const { tx, rx } = stream();
const { tx: doneTx, rx: doneRx } = future();

// Hand rx and doneRx to the guest, then feed it from the host.
await tx.write(new TextEncoder().encode("first\n"));
await tx.write(new TextEncoder().encode("second\n"));
await tx.close();
await doneTx.write({ tag: "ok", val: undefined });
```

Two chapters describe the details that matter once data is in flight:

- [Preview 3 streams and backpressure](../advanced/preview3-streams-and-backpressure.md): why an
  accepted write is not an acknowledgement, and how cancellation races completion.
- [Preview 3 host value disposal](../advanced/preview3-host-value-disposal.md): what happens to
  host-provided values that a guest discards.

## Supported platforms

### Node.js

The Node.js build gives a component host filesystem, environment, and network access by default.
Standard streams and filesystem operations run in a worker so that blocking host I/O never stalls
the event loop that drives the component's asynchronous exports.

### Browsers

The browser build reuses the Preview 2 shim's capability model: clocks and randomness use Web
APIs, stdio is console-backed, outbound HTTP delegates to `fetch`, and filesystem preopens are
empty until configured. The same filesystem adapters (`InMemoryFilesystemAdapter`,
`OpfsFilesystemAdapter`, and application-provided ones) are re-exported from
`@bytecodealliance/preview3-shim/filesystem`, with descriptors wrapped to expose the 0.3 stream
based interface. See the [Preview 2 shim](./preview2-shim.md#browsers) notes for what each
interface needs from the embedding application.

[npm-p3-shim]: https://www.npmjs.com/package/@bytecodealliance/preview3-shim
