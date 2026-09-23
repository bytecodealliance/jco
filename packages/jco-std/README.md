# `@bytecodealliance/jco-std`

This [`@bytecodealliance/jco`][jco] sub-project contains shared functionality and
reusable libraries that can be used for building WebAssembly Components in Javascript.

[WebAssembly Components][cm-book] are a WebAssembly binaries that use the Component Model,
an evolving architecture for interoperable WebAssembly libraries, applications and environments.

WebAssembly components can be used from server side applications _and_ in the browser, and
`@bytecodealliance/jco-std` contains shared functionality and helpers for both environments.

[cm-book]: https://component-model.bytecodealliance.org/
[jco]: https://www.npmjs.com/package/@bytecodealliance/jco

# Adapters

Below is a list of adapters provided by `@bytecodealliance/jco-std`:

## HTTP

| Export               | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `http/adapters/hono` | Enables easier building of [Hono][hono] HTTP servers |

## NodeJS API (experimental)

`jco-std` also makes available an experimental NodeJS API that is used by tools like `jco` to
build NodeJS programs as components.

| Export                                                 | Description                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `wasi/0.2.x/node/24.x.x/assert`                        | `node:assert` adapter, Node 24 on WASI p2                                     |
| `wasi/0.2.x/node/24.x.x/console`                       | `node:console` guest adapter over an explicit host capability                 |
| `wasi/0.2.x/node/24.x.x/errors`                        | Node 24 global error constructors and shared coded-error behavior             |
| `wasi/0.2.x/node/24.x.x/dns`                           | `node:dns` guest adapter over an explicit host capability                     |
| `wasi/0.2.x/node/24.x.x/fs`                            | `node:fs` and `node:fs/promises` over an explicit host capability             |
| `wasi/0.2.x/node/24.x.x/http`                          | `node:http` API with direct, WASI sockets, and WASI HTTP implementations      |
| `wasi/0.2.x/node/24.x.x/http2`                         | `node:http2` API with direct and cleartext WASI sockets implementations       |
| `wasi/0.2.x/node/24.x.x/https`                         | `node:https` API sharing the `node:http` core and implementations             |
| `wasi/0.2.x/node/24.x.x/net`                           | `node:net` module over WASI Preview 2 0.2.12 sockets                          |
| `wasi/0.2.x/node/24.x.x/net/core`                      | `node:net` core over injected WASI Preview 2 sockets                          |
| `wasi/0.2.x/node/24.x.x/os`                            | `node:os` guest adapter over an explicit host capability                      |
| `wasi/0.2.x/node/24.x.x/path`                          | `node:path` adapter, Node 24 on WASI p2                                       |
| `wasi/0.2.x/node/24.x.x/string-decoder`                | Guest-local `node:string_decoder` implementation for Node 24                  |
| `wasi/0.2.x/node/24.x.x/timers`                        | Node 24 callback timers over engine scheduling                                |
| `wasi/0.2.x/node/24.x.x/timers/promises`               | Promise timers, abortable interval iterators and scheduler                    |
| `wasi/0.2.x/node/24.x.x/domain`                        | `node:domain`, deprecated upstream: every use throws                          |
| `wasi/0.2.x/node/24.x.x/async-hooks`                   | `node:async_hooks` guest adapter, Node 24, synchronous scopes only            |
| `wasi/0.2.x/node/24.x.x/diagnostics-channel`           | `node:diagnostics_channel` guest adapter, Node 24                             |
| `wasi/0.2.x/node/24.x.x/child-process`                 | `node:child_process` guest adapter, Node 24 over an explicit host capability  |
| `wasi/0.2.x/node/24.x.x/cluster`                       | `node:cluster` guest adapter, Node 24 over an explicit host capability        |
| `wasi/0.2.x/node/24.x.x/events`                        | `node:events` entry points Jco implements over a supplied emitter core        |
| `wasi/0.2.x/node/24.x.x/module`                        | `node:module`, Node 24: classification and source maps; loading refuses       |
| `wasi/0.2.x/node/26.x.x/ffi`                           | `node:ffi` guest adapter, Node 26 over an explicit host capability            |
| `wasi/0.2.x/node/26.x.x/ffi/host`                      | Deny-by-default host for `jco:node/ffi`                                       |
| `wasi/0.2.x/node/26.x.x/ffi/host/node`                 | Opt-in host over the runtime's real `node:ffi`; `setSuffix()` pins the suffix |
| `wasi/0.2.x/node/24.x.x/inspector`                     | `node:inspector` guest adapter, Node 24 over an explicit host capability      |
| `wasi/0.2.x/node/24.x.x/inspector/promises`            | `node:inspector/promises`, sharing one core with `node:inspector`             |
| `wasi/0.2.x/node/24.x.x/inspector/host`                | Deny-by-default host for `jco:node/inspector`                                 |
| `wasi/0.2.x/node/24.x.x/inspector/host/node`           | Opt-in host over the runtime's real `node:inspector`                          |
| `wasi/0.2.x/node/24.x.x/stream` and `/stream/promises` | Classic Node streams over readable-stream 4.7.0, with Node 24 adapters        |
| `wasi/0.2.x/node/24.x.x/stream/consumers`              | Portable `node:stream/consumers`, Node 24                                     |
| `wasi/0.2.x/node/24.x.x/stream/iter`                   | Experimental iterable streams from Node 24.20                                 |
| `wasi/0.2.x/node/24.x.x/repl`                          | `node:repl` over the readline port; global-scope evaluation only              |
| `wasi/0.2.x/node/24.x.x/tty`                           | `node:tty` guest adapter, Node 24 over an explicit host capability            |
| `wasi/0.2.x/node/24.x.x/tty/host`                      | Deny-by-default host for `jco:node/tty`                                       |
| `wasi/0.2.x/node/24.x.x/tty/host/node`                 | Opt-in host over the runtime's real `node:tty` and its descriptors            |
| `wasi/0.2.x/node/24.x.x/wasi`                          | `node:wasi` guest adapter, Node 24; construction only, running refuses        |
| `wasi/0.2.x/node/24.x.x/wasi/host`                     | Deny-by-default host for `jco:node/wasi`                                      |
| `wasi/0.2.x/node/24.x.x/wasi/host/node`                | Opt-in host running the real `node:wasi` constructor for its `uvwasi` checks  |
| `wasi/0.2.x/node/24.x.x/child-process/host`            | Deny-by-default host for `jco:node/child-process`                             |
| `wasi/0.2.x/node/24.x.x/child-process/host/node`       | Opt-in host over the runtime's real `node:child_process`                      |
| `wasi/0.2.x/node/24.x.x/cluster/host`                  | Deny-by-default host for `jco:node/cluster`                                   |
| `wasi/0.2.x/node/24.x.x/cluster/host/node`             | Opt-in host over the runtime's real `node:cluster`                            |
| `wasi/0.2.x/node/24.x.x/console/host`                  | Deny-by-default host for `jco:node/console`                                   |
| `wasi/0.2.x/node/24.x.x/console/host/node`             | Opt-in host over the runtime's real `node:console`                            |
| `wasi/0.2.x/node/24.x.x/dns/promises`                  | `node:dns/promises`, sharing one core with `node:dns`                         |
| `wasi/0.2.x/node/24.x.x/dns/host`                      | Deny-by-default host for `jco:node/dns`                                       |
| `wasi/0.2.x/node/24.x.x/dns/host/node`                 | Opt-in host over the runtime's real `node:dns`                                |
| `wasi/0.2.x/node/24.x.x/fs/promises`                   | `node:fs/promises`, sharing one core with `node:fs`                           |
| `wasi/0.2.x/node/24.x.x/fs/host`                       | Deny-by-default host for `jco:node/fs`                                        |
| `wasi/0.2.x/node/24.x.x/fs/host/node`                  | Opt-in host over the runtime's real `node:fs`                                 |
| `wasi/0.2.x/node/24.x.x/http/core`                     | `node:http` core shared by the selectable implementations                     |
| `wasi/0.2.x/node/24.x.x/http/impl/wasi-sockets`        | `node:http` implementation over WASI Preview 2 sockets                        |
| `wasi/0.2.x/node/24.x.x/http/impl/wasi-http`           | `node:http` implementation over WASI Preview 2 HTTP                           |
| `wasi/0.2.x/node/24.x.x/http/host`                     | Deny-by-default host for `jco:node/http`                                      |
| `wasi/0.2.x/node/24.x.x/http/host/node`                | Opt-in host over the runtime's real `node:http` and `node:https`              |
| `wasi/0.2.x/node/24.x.x/https/core`                    | `node:https` core shared by the selectable implementations                    |
| `wasi/0.2.x/node/24.x.x/os/host`                       | Deny-by-default host for `jco:node/os`                                        |
| `wasi/0.2.x/node/24.x.x/os/host/node`                  | Opt-in host over the runtime's real `node:os`                                 |
| `node/path`                                            | Legacy unversioned alias for `wasi/0.2.x/node/24.x.x/path`                    |

# Quickstart

`@bytecodealliance/jco-std` can be used in varied ways via it's exports, this section
contains some examples of how to get started quickly.

## Http (via the Hono Adapter)

To use `@bytecodealliance/jco-std` to make building [Hono][hono] applications easier with WebAssembly,
use the `@bytecodealliance/jco-std/http/adapters/hono` export:

```ts
import { Hono } from "hono";

import { fire } from "@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/server";

const app = new Hono();
app.get("/", () => "Hello World!");

fire(app);

// Although we've called `fire()` with wasi HTTP configured for use above,
// we still need to actually export the `wasi:http/incoming-handler` interface object,
// as componentize-js will be looking for the ES module export.
export { incomingHandler } from "@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/server";
```

> [!NOTE]
> We use `@bytecodealliance/jco-std/wasi/0.2.x`, but if you'd like to use a specific version, you can
> use an explicitly versioned export like `@bytecodealliance/jco-std/wasi/0.2.12`.
>
> The `0.2.x` path selects the newest WASI 0.2 adapter verified with the ComponentizeJS
> version used by Jco. It may change in any `jco-std` release. Use an explicitly versioned
> path when your component must retain an older WIT world.

[hono]: https://hono.dev

## Node.js compatibility APIs

> [!WARNING]
> Jco's Node.js built-in compatibility for components is experimental and subject
> to change. APIs, behavior, and generated component interfaces may change
> incompatibly without a semver-major release.

The table above lists the available adapters. Application code should normally
keep its `node:` imports and let `jco componentize` select the implementation.
See the [Node.js built-in compatibility guide](https://bytecodealliance.github.io/jco/interop/nodejs-builtins.html)
for setup, versioning, capabilities, and compatibility boundaries.

### `node:path`

```js
import path, { matchesGlob } from "node:path";
import { join as winJoin } from "node:path/win32";

export function outputPath(name) {
  if (!matchesGlob(name, "**/*.js")) throw new TypeError("expected JavaScript");
  return `${path.resolve("dist", name)}|${winJoin("C:\\dist", name)}`;
}
```

See [`node:path`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/path.html).

### `node:string_decoder`

```js
import { Buffer } from "node:buffer";
import { StringDecoder } from "node:string_decoder";

const decoder = new StringDecoder("utf8");
decoder.write(Buffer.from([0xf0, 0x9f]));
decoder.end(Buffer.from([0x8c, 0x8d])); // "🌍"
```

See [`node:string_decoder`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/string-decoder.html).

### `node:repl`

```js
import repl from "node:repl";

export function attach(input, output) {
  const server = repl.start({ prompt: "app> ", input, output, useGlobal: true });
  server.context.app = { version: "1.0.0" };
  return server;
}
```

See [`node:repl`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/repl.html).

### `node:tty`

```js
import { ReadStream, WriteStream, isatty } from "node:tty";

export function terminal() {
  if (!isatty(0) || !isatty(1)) throw new Error("a terminal is required");
  return { input: new ReadStream(0), output: new WriteStream(1) };
}
```

See [`node:tty`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/tty.html).

### `node:wasi`

```js
import { WASI } from "node:wasi";

export function createWasi() {
  return new WASI({ version: "preview1" });
}
```

See [`node:wasi`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/wasi.html).

### Node.js error globals

```js
export function describeFailure() {
  const cause = new TypeError("invalid input");
  return new Error("operation failed", { cause }).cause.message;
}
```

See [Node.js error globals](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/errors.html).

### `node:child_process`

```js
import { execFileSync } from "node:child_process";

export function nodeVersion() {
  return execFileSync("node", ["--version"], { encoding: "utf8" }).trim();
}
```

See [`node:child_process`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/child-process.html).

### `node:fs`

```js
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";

export async function replace(path, contents) {
  await writeFile(path, contents);
  return readFileSync(path, "utf8");
}
```

See [`node:fs`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/fs.html).

### `node:os`

```js
import os from "node:os";

export function hostSummary() {
  return `${os.platform()} ${os.arch()} (${os.availableParallelism()} CPUs)`;
}
```

See [`node:os`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/os.html).

### `node:dns`

```js
import dns from "node:dns";
import dnsPromises from "node:dns/promises";

export function configuredServers() {
  return [...dns.getServers(), ...dnsPromises.getServers()];
}
```

See [`node:dns`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/dns.html).

### `node:net`

```js
import { connect, createServer } from "node:net";

createServer((socket) => socket.end("hello")).listen(8080, "127.0.0.1");
connect(8080, "127.0.0.1").setEncoding("utf8").on("data", console.log);
```

See [`node:net`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/net.html).

### `node:http` and `node:https`

```js
import { createServer } from "node:http";
import { get } from "node:https";

createServer((request, response) => {
  response.end(`received ${request.method} ${request.url}`);
}).listen(8080, "127.0.0.1");

get("https://example.com/", (response) => response.resume());
```

See [`node:http`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/http.html)
and [`node:https`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/https.html).

### `node:http2`

```js
import { connect } from "node:http2";

const session = connect("https://example.com");
const stream = session.request({ ":path": "/status" });
stream.on("end", () => session.close());
stream.end();
```

See [`node:http2`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/http2.html).

### `node:timers`

```js
import { setTimeout as delay, scheduler } from "node:timers/promises";

await delay(10, "ready");
await scheduler.yield();
```

See [`node:timers`](https://bytecodealliance.github.io/jco/interop/nodejs-builtins/supported-modules/timers.html).

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
