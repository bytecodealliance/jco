# Preview2 Shim

WASI Preview2 implementations for Node.js & browsers.

Node.js support is fully tested and conformant against the Wasmtime test suite.

Browser support is available with the platform limitations documented below.

The Node.js implementation owns its worker artifact. Direct package use and supported downstream
bundlers should resolve it through the public shim imports; applications do not need to import or
copy files from `dist/io`.

## Browser support matrix

Browser defaults are capability-safe: clocks and secure randomness use Web APIs, stdout and stderr
write to the console, stdin is closed, outbound HTTP uses `fetch`, filesystem preopens must be
configured explicitly, and raw sockets are unavailable unless an embedding supplies an adapter.

| WASI area                     | Browser status                                                | Default capability                                                |
| ----------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| CLI environment and arguments | Configurable per `WASIShim`; compatibility setters are global | Empty snapshots unless configured                                 |
| CLI stdin                     | Adapter-backed                                                | Closed stream                                                     |
| CLI stdout and stderr         | Web API                                                       | Console-backed, preserving split UTF-8 writes until flush/newline |
| CLI terminals                 | Adapter-backed                                                | No terminal resource                                              |
| Clocks                        | Web API                                                       | `performance.now`, `Date.now`, and timer-backed pollables         |
| Random                        | Web API                                                       | `crypto.getRandomValues`, including requests larger than 64 KiB   |
| I/O streams and poll          | Implemented browser resources                                 | Non-blocking streams depend on their injected handlers            |
| Filesystem                    | Adapter-backed; opt-in in-memory compatibility implementation | No persistent storage is selected implicitly                      |
| Outbound HTTP                 | Web API                                                       | Delegates to `fetch`                                              |
| Incoming HTTP                 | Adapter-backed; opt-in in-memory client                       | Browsers cannot listen for arbitrary inbound HTTP                 |
| TCP and UDP                   | Adapter-backed; opt-in in-memory implementations              | Raw sockets are not exposed by standard browsers                  |
| DNS                           | Host adapter required                                         | DNS is not exposed independently by standard browsers             |
| `WASIShim` instantiation      | Implemented                                                   | Interface namespaces can be overridden per instance               |

An operation is not considered supported merely because its interface shape exists. Adapter-backed
rows require the embedding application to provide that capability; unavailable operations fail with
a WASI-domain error instead of logging or returning a placeholder resource.

### Detailed browser capabilities

The following table describes the built-in browser implementation. An application-provided
namespace can replace any row through `WASIShim`.

| Interface                     | Implemented                                                                                       | Host adapter required                                      | Unsupported by browser implementation          |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `wasi:cli`                    | environment, arguments, initial cwd, exit, stream and terminal accessors                          | stdin/stdout/stderr handlers and terminal resources        | —                                              |
| `wasi:clocks`                 | wall clock, monotonic clock, timer subscriptions                                                  | —                                                          | timezone APIs (not part of Preview 2)          |
| `wasi:random`                 | secure and insecure bytes, insecure seed                                                          | —                                                          | —                                              |
| `wasi:io`                     | errors, input/output streams, poll and pollables                                                  | readiness and I/O behavior for injected stream handlers    | synchronous blocking of the browser event loop |
| `wasi:filesystem`             | descriptors, files, directories, links, metadata, streams, preopens through the ephemeral adapter | persistent storage, permissions, and external file handles | symbolic-link creation and reading             |
| `wasi:http/outgoing-handler`  | Fetch-backed requests and buffered request bodies                                                 | Fetch implementation and network permission                | request/response trailers; streaming uploads   |
| `wasi:http/incoming-handler`  | request/response translation, injectable handler, and in-memory client                            | HTTP server, service worker, or other request source       | direct browser listening                       |
| `wasi:sockets/ip-name-lookup` | interface shape only                                                                              | complete interface replacement                             | built-in DNS lookup                            |
| `wasi:sockets/tcp*`           | opt-in in-memory server/client implementation                                                     | adapter for external connectivity                          | built-in raw TCP                               |
| `wasi:sockets/udp*`           | opt-in in-memory server/client implementation                                                     | adapter for external connectivity                          | built-in raw UDP                               |

Outbound HTTP buffers a requested body until `outgoing-body.finish` before calling `fetch`.
This preserves complete-body semantics across browsers but does not provide streaming upload or
upload backpressure. Incoming Fetch bodies retain their asynchronous stream behavior. HTTP
trailers are not implemented.

Chromium-based browsers can opt into Fetch request streaming. This setting uses a
`ReadableStream` request body with `duplex: "half"`; unsupported browsers reject the request, so
applications should enable it only after applying their own browser support policy or feature
detection:

```js
import { http } from "@bytecodealliance/preview2-shim";

http._setRequestStreaming(true);
```

The setting affects subsequent requests made through the browser HTTP shim. Call
`http._setRequestStreaming(false)` to restore portable completion buffering.

Host-side helper functions that build on the public shim surface are exported from `helpers/`
subpaths, separate from the underscore-prefixed configuration setters. The `writeFileAt` and
`readFileAt` helpers (`@bytecodealliance/preview2-shim/helpers/filesystem`) move bytes between host
JavaScript and a preopened directory without a guest, on both builds. The browser-only
`bufferedInputStream` helper (`@bytecodealliance/preview2-shim/browser/helpers/cli`) feeds a guest a
fixed stdin buffer. See the [filesystem helpers][book-fs-helpers] and [CLI helpers][book-cli-helpers]
pages in the Jco book.

[book-fs-helpers]: https://bytecodealliance.github.io/jco/wasi/preview2-shim/helpers/filesystem.html
[book-cli-helpers]: https://bytecodealliance.github.io/jco/wasi/preview2-shim/helpers/cli.html

Browser applications select storage explicitly. The bundled file-data adapter is ephemeral and must
be opted into:

```js
import { filesystem } from "@bytecodealliance/preview2-shim";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const shim = new WASIShim({
    environment: { MODE: "browser" },
    arguments: ["component"],
    stdout: { write: (bytes) => terminal.write(bytes) },
    browserFilesystem: {
        adapter: new filesystem.InMemoryFilesystemAdapter(),
        preopens: { "/data": { dir: {} } },
    },
    sandbox: { enableNetwork: false },
});
```

The browser shim does not request File System Access permissions or choose IndexedDB/OPFS on an
application's behalf. Applications that need another storage model implement the generated
`wasi:filesystem/types` and `wasi:filesystem/preopens` namespaces and inject them through the
`filesystem` option:

```js
const shim = new WASIShim({
    filesystem: {
        types: applicationFilesystemTypes,
        preopens: applicationFilesystemPreopens,
    },
});
```

This keeps permission prompts, handle acquisition, persistence, and synchronization policy in
application code. `sandbox.enableNetwork: false` denies raw TCP, UDP, DNS, and outbound HTTP.

Deterministic in-memory transports are available for components that act as servers and for tests:

```js
import { http, sockets } from "@bytecodealliance/preview2-shim";

const tcpSockets = new sockets.InMemoryTcpSockets();
const tcpClient = tcpSockets.connect(serverAddress);
const udpSockets = new sockets.InMemoryUdpSockets();
const udpClient = udpSockets.createClient(clientAddress);
const httpClient = new http.InMemoryHttpClient(component.incomingHandler);

const shim = new WASIShim({ tcpSockets, udpSockets });
```

These implementations route bytes only within the current JavaScript realm; they do not grant raw
browser network access. `InMemoryHttpClient.fetch(request)` returns a standard Web `Response`.

For a small application-owned implementation, see the
[Map-backed browser filesystem test shim](./test/fixtures/filesystem-shim/in-memory-map.ts). It keeps named
roots in an in-memory `Map`, implements `createPreopens`, and is intentionally example code rather
than a published or supported filesystem package. The example is exercised through the reusable
[filesystem implementation test suite](./test/filesystem-conformance.ts), which can also be pointed
at other implementations.

Browser filesystem adapters own the capabilities passed in `preopens` and the roots returned from
`getRoot`. A root may be shared by multiple descriptors and preopen names; the adapter is therefore
responsible for persistence and synchronization of shared mutations. Calling `dispose` on the
namespace returned by `createFilesystem` calls the adapter's optional `dispose` method once and
invalidates further preopen access. `WASIShim` does not currently cascade disposal, so embeddings
using external handles must retain and dispose their application-owned filesystem namespace or
adapter themselves. The bundled in-memory adapter keeps all state in memory and shares mutations
for the same file-data object.

# Features

## WASI Shim object for easy instantiation

An default instantiation object can be used via the `WASIShim` class in `@bytecodealliance/preview2-shim/instantiation`:

```typescript
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import type {
    VersionedWASIImportObject,
    WASIImportObject,
} from "@bytecodealliance/preview2-shim/instantiation";

const shim = new WASIShim();

const unversioned: WASIImportObject = shim.getImportObject();
// console.log('unversioned', unversioned);
unversioned satisfies WASIImportObject;
unversioned satisfies VersionedWASIImportObject<"">;

const versioned: VersionedWASIImportObject<"0.2.3"> = shim.getImportObject({
    asVersion: "0.2.3",
});
//console.log('versioned', versioned);
versioned satisfies VersionedWASIImportObject<"0.2.3">;
```

The import object generated by `getImportObject` can be easily used in `instantiate()` calls
produced by [`jco transpile`][jco] (with `--instantiation=async`):

```js
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

// The code below assumes that you have output your transpiled WebAssembly component to `dist/transpiled`
import { instantiate } from './dist/transpiled/component.js';

const loader = async (path: string) => {
    const buf = await readFile(`./dist/transpiled/${path}`);
    return await WebAssembly.compile(buf.buffer as ArrayBuffer);
};
const component = await instantiate(loader, new WASIShim().getImportObject());

// TODO: Code that uses your component's exports goes here.
```

## Sandboxing

On Node.js, the preview2-shim gives a guest no filesystem access by default: there are no preopens
until the application adds them. The host's environment variables and network are still available
by default. Browser defaults expose no filesystem preopens or raw sockets. Both platforms can
configure which capabilities a guest receives.

### Using WASIShim for sandboxing

The `WASIShim` class accepts a `sandbox` configuration option to control access:

```js
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

// Fully sandboxed - no filesystem, network, or env access
const sandboxedShim = new WASIShim({
    sandbox: {
        preopens: {}, // No filesystem access
        env: {}, // No environment variables
        args: ["arg1"], // Custom arguments
        enableNetwork: false, // Disable network access
    },
});

// Node.js only: map virtual paths to host paths
const limitedShim = new WASIShim({
    sandbox: {
        preopens: {
            "/data": "/tmp/guest-data", // Guest sees /data, maps to /tmp/guest-data
            "/config": "/etc/app", // Guest sees /config, maps to /etc/app
        },
        env: { ENV1: "42" }, // Only expose specific env vars
    },
});

const component = await instantiate(loader, sandboxedShim.getImportObject());
```

### Notes on sandboxing

#### Directory mutation compatibility (Node.js)

Node filesystems preserve the existing behavior by default: `mutate-directory`
requests fail with `unsupported`, and omitting that flag on a child directory
does not make it read-only. Some guests, including adapted Preview 1 components,
depend on that behavior. See the earlier [implementation discussion](https://github.com/bytecodealliance/jco/pull/1303).

Opt in to `mutate-directory` support for guests that use its permission semantics:

```js
import { filesystem } from "@bytecodealliance/preview2-shim";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const guestFilesystem = filesystem.createFilesystem({
    preopens: { "/data": "/tmp/guest-data" },
    enableMutateDirectory: true,
});
const shim = new WASIShim({ filesystem: guestFilesystem });
```

With this option, preopens have `read` and `mutate-directory` capabilities,
subject to host permissions. A child directory opened without
`mutateDirectory: true` rejects mutations, metadata changes, and writable,
create, or truncate opens with `read-only`. Request the flag for writable
directory handles. Returned flags are snapshots and cannot change permissions.

Some WASI guests, including Rust-based runtimes, also request `mutate-directory`
when opening a regular file. When enabled, the shim accepts and clears that
directory-only flag on files. This grants no additional authority: the original
request passes the parent permission check, file writes still require `write`,
and directories retain the flag for subsequent mutation checks. Wasmtime also
accepts the extra file flag, but its broader permission semantics are still
[under discussion](https://github.com/bytecodealliance/wasmtime/issues/12912).

For components using the global filesystem imports, opt in with
`filesystem._setPreopens({ "/data": "/tmp/guest-data" }, { enableMutateDirectory: true })`.
`_addPreopen` accepts the same options as its third argument. The option is
captured by each new preopen and inherited by its descendants; it does not
change existing handles or other filesystem instances.

These rules apply to the Node filesystem implementation. Browser adapters and
application-provided filesystem implementations define their own behavior.

#### Default access

By default (when no options are passed), the Node.js shim starts with no preopens, so a guest
cannot reach the host filesystem. Earlier versions preopened the host root `/`; applications that
relied on that must now grant a directory explicitly, with `sandbox.preopens` or
`filesystem._setPreopens({ "/": "/" })`. Environment variables and network access are still
inherited from the host unless `sandbox.env` and `sandbox.enableNetwork` restrict them.

In browsers, filesystem preopens remain empty until the application explicitly injects filesystem
namespaces or selects the ephemeral file-data adapter.

#### Preopen mappings

`sandbox.preopens` maps guest paths to Node.js host paths on Node.js. With
`browserFilesystem`, the same option maps guest paths to capabilities understood by its adapter
and overrides `browserFilesystem.preopens`. A custom `filesystem` can implement
`createPreopens(preopens)` to interpret the provided properties and return its own
`wasi:filesystem/preopens` namespace. The shim passes those properties through unchanged.

#### Instance isolation and global configuration

Each `WASIShim` instance has its own isolated preopens, environment variables, and arguments.
Multiple instances with different configurations will not affect each other.
The direct preopen functions (`_setPreopens`, `_clearPreopens`, etc.) modify global state and
affect all components not using `WASIShim` with explicit configuration. For isolation, prefer
using `WASIShim` with the `sandbox` option containing `preopens` and `env`.

#### Network access

When `sandbox.enableNetwork: false`, socket operations and outbound HTTP receive instance-local
denied network capabilities.

## Performance options (Node.js)

The Node.js build runs blocking I/O in a worker thread and waits for each answer, so that a
synchronous WASI call can block without help from the guest. The `performance` options trade a
part of that arrangement for speed. All of them are off by default.

| Option                 | Effect                                                                          | What changes                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `mainThreadFilesystem` | Regular files and directories are operated on with synchronous `node:fs` calls. | File I/O blocks the event loop; see [observable differences](#observable-differences).                       |
| `cacheDirectoryPaths`  | The host path of a preopen, and of each opened directory, is resolved once.     | A later change to a symlink in that path is not seen; see [Directory path caching](#directory-path-caching). |

The options are accepted, under the same names, in each place that configures a filesystem:

```js
import { filesystem } from "@bytecodealliance/preview2-shim";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const performance = { mainThreadFilesystem: true, cacheDirectoryPaths: true };

// The sandbox preopens of one instance.
new WASIShim({ sandbox: { preopens: { "/data": "/tmp/guest-data" } }, performance });

// A filesystem of its own, or single preopens.
filesystem.createFilesystem({ preopens: { "/data": "/tmp/guest-data" }, performance });
filesystem._setPreopens({ "/data": "/tmp/guest-data" }, { performance });
filesystem._addPreopen("/cache", "/tmp/guest-cache", { performance });

// The default for every preopen that is created without the member.
filesystem._setPerformance(performance);
```

A preopen passes its options on to every descriptor opened through it. The `performance` member
of `WASIShim` applies to `sandbox.preopens`; an instance without them uses the shared preopens,
which take their options from `_setPreopens`, `_addPreopen` or `_setPerformance`. `jco run` and
`jco serve` set the default with `--perf-main-thread-filesystem` and
`--perf-cache-directory-paths`.

`node bench/filesystem.mjs` in this package, after a build, prints the cost per call of common
filesystem operations for each combination of the options.

### Main-thread filesystem

With `mainThreadFilesystem`, a file call no longer makes a round trip to the worker. The call
runs on the main thread instead, which means that **file I/O blocks the event loop for the
duration of each call**. A synchronous guest already blocks the event loop for as long as it
runs, the wait for the worker included, so for it only the cost per call changes. A host that
relies on the event loop turning while a guest built with async imports waits for a file should
leave the option off, or keep in mind that a read from a slow disk or a network mount holds the
thread until it returns.

Async imports (JSPI) need no special handling: the shim's functions are synchronous in both
modes, and with the option on they return without having waited.

#### What stays in the worker

Only what cannot wait indefinitely is taken out of the worker. The type of a file is read
before it is opened and confirmed on the open descriptor:

- regular files and directories are served on the main thread;
- FIFOs, character and block devices, sockets, and anything else keep the worker, where a read
  that waits for a writer does not stop the process;
- standard I/O, sockets, HTTP and clocks are not affected by the option.

#### Observable differences

Descriptor operations return the same results and error codes in both modes. The streams of a
file served on the main thread differ from those of the worker in these ways:

- Their pollables are ready from the moment they are created. A pollable of a worker file
  stream is ready once the worker has bytes to hand out or room to take them.
- `read` returns bytes of the file whenever it is called. In the worker, a `read` that is not
  preceded by a `block`, a `poll` or a `blocking-read` can return no bytes.
- A write reaches the file before the call returns, and `flush` has nothing left to do.
- `poll` on a list that holds one of these pollables returns at once, with them and with
  whichever worker pollables are ready at that moment. It waits in the worker only when the
  list holds no main-thread pollable.
- `splice` and `blocking-splice` between a main-thread stream and a worker stream copy through
  the main thread, at most 64 KiB per call.

For the host:

- `inputStreamId` and `outputStreamId` of `@bytecodealliance/preview2-shim/io-worker` return
  `undefined` for a main-thread file stream, because the worker does not know it. A host
  extension that hands stream ids to the worker has to leave the option off for the files it
  passes on, or read from the stream instead.
- At most 2^20 pollables of main-thread file streams can be alive at once; subscribing to one
  more throws.
- Files are opened with `O_NONBLOCK`, to keep the open of a FIFO that replaced a regular file
  from waiting. A file that reports itself as regular and can still wait for data, as some
  `procfs` and FUSE files do, is therefore served on the main thread too: a blocking call on it
  retries until it goes through, with the event loop blocked meanwhile, and a non-blocking
  `read` returns no bytes while the pollable of the stream reports ready.

### Directory path caching

Every path operation starts from the host path of a preopen or of an opened directory, and
resolves that path on the host first. With `cacheDirectoryPaths` the path is resolved once per
preopen and once per opened directory, and the result is used from then on: a later change to a
symlink in that path is not seen. If a preopen does not exist yet, nothing is kept until it
does. The handling of the path that the guest passes is unchanged.

Leave the option off when a preopen is, or sits below, a symlink that is switched while the
component runs, such as a `current` link of a release directory.

[jco]: https://www.npmjs.com/package/@bytecodealliance/jco

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.

### Host IO extensions

Opt-in providers can use the Node-only `@bytecodealliance/preview2-shim/io-worker`
entry point to operate on existing streams in the shim's IO worker. Host-selected
modules load lazily and share the worker's stream, future, and poll ownership rules.
Guest code cannot select extension modules.

The Node `wasi:tls` provider and its TLS policy live in
[`jco-std`](../jco-std/README.md#http-1), which wraps the supplied TCP streams
without opening a replacement connection.
