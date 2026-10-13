# Preview 2 shim

[`@bytecodealliance/preview2-shim`][npm-p2-shim] implements WASI 0.2 (`wasi:cli`, `wasi:clocks`,
`wasi:filesystem`, `wasi:http`, `wasi:io`, `wasi:random` and `wasi:sockets`) for Node.js and
browsers. `jco transpile` maps 0.2.x WASI imports to it by default, so most applications only need
it installed:

```console
npm install @bytecodealliance/preview2-shim
```

Every subpath resolves to the Node.js build under the `node` export condition and to the browser
build otherwise, unless noted:

| Subpath                                           | Contents                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `@bytecodealliance/preview2-shim`                 | Every subsystem namespace below, re-exported                           |
| `@bytecodealliance/preview2-shim/cli`             | `wasi:cli` environment, exit, stdio, and terminal interfaces           |
| `@bytecodealliance/preview2-shim/clocks`          | `wasi:clocks` wall and monotonic clocks                                |
| `@bytecodealliance/preview2-shim/filesystem`      | `wasi:filesystem` types and preopens, plus browser adapters            |
| `@bytecodealliance/preview2-shim/http`            | `wasi:http` types and outgoing and incoming handlers                   |
| `@bytecodealliance/preview2-shim/io`              | `wasi:io` errors, streams, and poll                                    |
| `@bytecodealliance/preview2-shim/random`          | `wasi:random` secure and insecure randomness                           |
| `@bytecodealliance/preview2-shim/sockets`         | `wasi:sockets` TCP, UDP, and name lookup                               |
| `@bytecodealliance/preview2-shim/instantiation`   | `WASIShim`, which assembles an import object (see below)               |
| `@bytecodealliance/preview2-shim/interfaces/*`    | TypeScript declarations for each WASI interface                        |
| `@bytecodealliance/preview2-shim/io-worker`       | Node.js only: hooks for extensions running inside the I/O worker       |
| `@bytecodealliance/preview2-shim/browser/helpers/cli` | Browser only: host-side CLI helpers (see [Helpers](#helpers))      |

## Instantiation and sandboxing

`WASIShim` from `@bytecodealliance/preview2-shim/instantiation` builds a complete import object
for a transpiled component and lets each instance carry its own environment, arguments, stdio
handlers, and preopens:

```js
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const shim = new WASIShim({
    sandbox: {
        preopens: { "/data": "/tmp/guest-data" }, // Node.js: guest path to host path
        env: { MODE: "sandboxed" },
        enableNetwork: false,
    },
});
const component = await instantiate(loader, shim.getImportObject());
```

See [Manual Wasm instantiation with WASI overrides](../advanced/manual-wasm-instantiation-with-wasi-overrides.md)
for the full instantiation flow and for replacing individual interfaces.

## Helpers

Alongside the WASI implementations, the package exports host-side helper functions from `helpers/`
subpaths. They build only on the public shim surface and are kept separate from the
underscore-prefixed functions (`_setStdin`, `_setPreopens`, ...) that configure the shim itself.
Helpers that only exist for one build are exported under that build's prefix.

- [CLI helpers](./preview2-shim/helpers/cli.md): feed a guest a fixed stdin buffer in the browser.

[npm-p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim
[p2-readme]: https://github.com/bytecodealliance/jco/blob/main/packages/preview2-shim/README.md

## Supported platforms

### Node.js

The Node.js build gives a component host filesystem, environment, and network access by default,
matching the behaviour of ordinary Node.js libraries. It is tested against the Wasmtime WASI
conformance suite.

### Browsers

The browser build is capability-safe: clocks and randomness use Web APIs, stdout and stderr write
to the console, stdin is closed, outbound HTTP delegates to `fetch`, filesystem preopens are empty
until configured, and raw sockets are unavailable unless the application supplies an adapter.
Deterministic in-memory filesystem, HTTP, and socket implementations can be opted into for tests
and self-contained applications.

The package [README][p2-readme] carries the full browser support matrix, listing for each
interface what is implemented, what needs a host adapter, and what browsers cannot provide.
