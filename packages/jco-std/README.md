# `@bytecodealliance/jco-std`

This [`@bytecodealliance/jco`][jco] sub-project contains shared functionality and
reusable libraries that can be used for building WebAssembly Components in Javascript.

[WebAssembly Components][cm-book] are a WebAssembly binaries that use the Component Model,
an evolving architecture for interoperabl WebAssembly libraries, aplications and environments.

WebAssembly components can be used from server side applications _and_ in the browser, and
`@bytecodealliance/jco-std` contains shared functionality and helpers for both environments.

[cm-book]: https://component-model.bytecodealliance.org/
[jco]: https://www.npmjs.com/package/@bytecodealliance/jco

# Utilites

Below is a list of utilties provided by `@bytecodealliance/jco-std`:

## HTTP

| Export                                       | Description                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `http/adapters/hono`                         | Enables easier building of [Hono][hono] HTTP servers                          |
| `wasi/0.2.x/node/24.x.x/assert`              | `node:assert` adapter, Node 24 on WASI p2                                     |
| `wasi/0.2.x/node/24.x.x/console`             | `node:console` guest adapter over an explicit host capability                 |
| `wasi/0.2.x/node/24.x.x/errors`              | Node 24 global error constructors and shared coded-error behavior             |
| `wasi/0.2.x/node/24.x.x/dns`                 | `node:dns` guest adapter over an explicit host capability                     |
| `wasi/0.2.x/node/24.x.x/fs`                  | `node:fs` and `node:fs/promises` over an explicit host capability             |
| `wasi/0.2.x/node/24.x.x/http`                | `node:http` API with direct, WASI sockets, and WASI HTTP implementations      |
| `wasi/0.2.x/node/24.x.x/os`                  | `node:os` guest adapter over an explicit host capability                      |
| `wasi/0.2.x/node/24.x.x/path`                | `node:path` adapter, Node 24 on WASI p2                                       |
| `wasi/0.2.x/node/24.x.x/string-decoder`      | Guest-local `node:string_decoder` implementation for Node 24                  |
| `wasi/0.2.x/node/24.x.x/domain`              | `node:domain`, deprecated upstream: every use throws                          |
| `wasi/0.2.x/node/24.x.x/async-hooks`         | `node:async_hooks` guest adapter, Node 24, synchronous scopes only            |
| `wasi/0.2.x/node/24.x.x/diagnostics-channel` | `node:diagnostics_channel` guest adapter, Node 24                             |
| `wasi/0.2.x/node/24.x.x/child-process`       | `node:child_process` guest adapter, Node 24 over an explicit host capability  |
| `wasi/0.2.x/node/24.x.x/cluster`             | `node:cluster` guest adapter, Node 24 over an explicit host capability        |
| `wasi/0.2.x/node/24.x.x/events`              | `node:events` entry points Jco implements over a supplied emitter core        |
| `wasi/0.2.x/node/24.x.x/module`              | `node:module`, Node 24: classification and source maps; loading refuses       |
| `wasi/0.2.x/node/26.x.x/ffi`                 | `node:ffi` guest adapter, Node 26 over an explicit host capability            |
| `wasi/0.2.x/node/26.x.x/ffi/host`            | Deny-by-default host for `jco:node/ffi`                                       |
| `wasi/0.2.x/node/26.x.x/ffi/host/node`       | Opt-in host over the runtime's real `node:ffi`; `setSuffix()` pins the suffix |
| `wasi/0.2.x/node/24.x.x/inspector`           | `node:inspector` guest adapter, Node 24 over an explicit host capability      |
| `wasi/0.2.x/node/24.x.x/inspector/promises`  | `node:inspector/promises`, sharing one core with `node:inspector`             |
| `wasi/0.2.x/node/24.x.x/inspector/host`      | Deny-by-default host for `jco:node/inspector`                                 |
| `wasi/0.2.x/node/24.x.x/inspector/host/node` | Opt-in host over the runtime's real `node:inspector`                          |
| `wasi/0.2.x/node/24.x.x/stream/consumers`    | Portable `node:stream/consumers`, Node 24                                     |
| `wasi/0.2.x/node/24.x.x/stream/iter`         | Experimental iterable streams from Node 24.20                                 |
| `wasi/0.2.x/node/24.x.x/child-process/host`  | Deny-by-default host for `jco:node/child-process`                             |
| `wasi/0.2.x/node/24.x.x/child-process/host/node` | Opt-in host over the runtime's real `node:child_process`                  |
| `wasi/0.2.x/node/24.x.x/cluster/host`        | Deny-by-default host for `jco:node/cluster`                                   |
| `wasi/0.2.x/node/24.x.x/cluster/host/node`   | Opt-in host over the runtime's real `node:cluster`                            |
| `wasi/0.2.x/node/24.x.x/console/host`        | Deny-by-default host for `jco:node/console`                                   |
| `wasi/0.2.x/node/24.x.x/console/host/node`   | Opt-in host over the runtime's real `node:console`                            |
| `wasi/0.2.x/node/24.x.x/dns/promises`        | `node:dns/promises`, sharing one core with `node:dns`                         |
| `wasi/0.2.x/node/24.x.x/dns/host`            | Deny-by-default host for `jco:node/dns`                                       |
| `wasi/0.2.x/node/24.x.x/dns/host/node`       | Opt-in host over the runtime's real `node:dns`                                |
| `wasi/0.2.x/node/24.x.x/fs/promises`         | `node:fs/promises`, sharing one core with `node:fs`                           |
| `wasi/0.2.x/node/24.x.x/fs/host`             | Deny-by-default host for `jco:node/fs`                                        |
| `wasi/0.2.x/node/24.x.x/fs/host/node`        | Opt-in host over the runtime's real `node:fs`                                 |
| `wasi/0.2.x/node/24.x.x/http/core`           | `node:http` core shared by the selectable implementations                     |
| `wasi/0.2.x/node/24.x.x/http/impl/wasi-sockets` | `node:http` implementation over WASI Preview 2 sockets                     |
| `wasi/0.2.x/node/24.x.x/http/impl/wasi-http` | `node:http` implementation over WASI Preview 2 HTTP                           |
| `wasi/0.2.x/node/24.x.x/http/host`           | Deny-by-default host for `jco:node/http`                                      |
| `wasi/0.2.x/node/24.x.x/http/host/node`      | Opt-in host over the runtime's real `node:http`                               |
| `wasi/0.2.x/node/24.x.x/os/host`             | Deny-by-default host for `jco:node/os`                                        |
| `wasi/0.2.x/node/24.x.x/os/host/node`        | Opt-in host over the runtime's real `node:os`                                 |
| `node/path`                                  | Legacy unversioned alias for `wasi/0.2.x/node/24.x.x/path`                    |


# Quickstart

`@bytecodealliance/jco-std` can be used in varied ways via it's exports, this section
contains some examples of how to get started quickly.

## Hono Adapter

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

Jco can bundle the following Node.js APIs into JavaScript WebAssembly components:

- the portable Node globals already provided by the component engine, plus the
  existing audited Buffer adapter injected on demand for free `Buffer` references;
- Node's global error constructors and coded-error foundation, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/errors` and injected on demand;
- `node:assert` and `node:assert/strict`, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/assert`;
- `node:path`, `node:path/posix`, and `node:path/win32`, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/path`;
- synchronous `node:child_process` operations, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process` and the
  `jco:node/child-process@0.1.0` host capability;
- `node:async_hooks`, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/async-hooks`, for synchronous scopes;
- `node:diagnostics_channel`, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/diagnostics-channel`;
- `node:cluster`, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/cluster` and the
  `jco:node/cluster@0.1.0` host capability;
- `node:console`, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console` and the
  application-provided `jco:node/console@0.1.0` capability;
- `node:dns` and `node:dns/promises`, implemented by the versioned DNS adapter
  and the application-provided `jco:node/dns@0.1.0` capability;
- `node:fs` and `node:fs/promises`, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs` and the
  application-provided `jco:node/fs@0.1.0` capability;
- `node:os`, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/os` and the
  application-provided `jco:node/os@0.1.0` capability;
- `node:inspector` and `node:inspector/promises`, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/inspector` and the
  application-provided `jco:node/inspector@0.1.0` capability, with the host
  calling back into the component through a guest-exported callbacks interface;
- the `node:http` API, with selectable direct, `wasi:sockets`, and `wasi:http`
  implementations;
- `node:buffer`, with its modern core provided by Jco's audited unenv
  compatibility layer;
- `node:querystring`, provided by Jco's audited unenv compatibility layer;
- `node:events`, whose `EventEmitter` comes from Jco's audited unenv
  compatibility layer, completed by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/events` for the three
  module-level functions unenv leaves unimplemented;
- `node:string_decoder`, implemented guest-locally by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/string-decoder`;
- `node:module`, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/module`. Classification,
  source maps and `require.resolve` are exact; everything that loads throws,
  because a component has no module loader;
- `node:ffi`, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi` and the
  `jco:node/ffi@0.1.0` host capability. **Node 26 only**, and denied by default:
  granting it lets a component load native libraries and read and write host
  memory;
- `node:stream/consumers`, implemented portably by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/stream/consumers`; and
- the experimental Node 24.20 `node:stream/iter` API, implemented by
  `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/stream/iter`.

The two stream modules share portable byte normalization and collection helpers.
They use the component engine's iterable, typed-array, text-codec, Blob, and abort
globals and require no WIT capability. The iterable module's `fromReadable()` and
`fromWritable()` accept duck-typed classic streams. `toReadable()`,
`toReadableSync()`, and `toWritable()` throw `ERR_JCO_UNSUPPORTED_NODE_API` until
Jco has a faithful classic `node:stream` implementation; weak unenv constructor
mocks are not used.

Jco resolves Node compatibility modules in quality order:

- Custom/Higher-fidelity or WASI-aware Jco implementations
- Explicitly audited `unenv` modules.

Jco does not automatically enable unenv's complete alias list or
treat mocked and unimplemented exports as supported APIs.

The buffer adapter uses unenv's Feross `buffer` implementation for the portable
core API. Deprecated entry points (e.g. `Buffer()`/`new Buffer()` and `SlowBuffer`)
throw immediately.

Runtime-dependent APIs without a compatible guest implementation
also throw explicit unsupported-API errors.

The current implementation does not support the `base64url` encoding accepted by
Node's Buffer.

> [!NOTE]
> The assert shim targets Node.js 24.19.0 and requires no WIT/WASI capability. It is
> published under the `wasi/0.2.x/node/24.x.x` entry point, which should be used explicitly. Neither WASI
> versions nor Node majors are interchangeable, so a new Node major or a WASI p3 adaptation
> is added as its own entry point rather than replacing this one.

There is no unversioned alias for it -- `node/path` keeps one
only for backwards compatibility (that will be removed in a future breaking-change version
of `jco-std`).

`jco-std`'s node shimcomparison and assertion behavior is adapted from the corresponding
MIT-licensed Node.js sources. Error fields and assertion outcomes are compatibility
targets; some generated diff text and JavaScript engine stack frames can differ
from Node.

Deprecated APIs remain importable but immediately throw a clear unsupported-API
error rather than running their deprecated implementation.

### Paths

The `node:path`, `node:path/posix`, and `node:path/win32` builtins use the
MIT-licensed path algorithms from Node.js 24.20.0. Both lexical namespaces,
`matchesGlob()`, namespace identities, Node-style validation errors, and the
legacy `_makeLong` alias match that release. WASI targets use POSIX as the
default namespace; importing `node:path/win32` or using `path.win32` selects the
Windows algorithms explicitly.

Most path operations are pure and never access the host. `resolve()` and
`relative()` obtain the component working directory lazily from
`wasi:cli/environment#initial-cwd` when their inputs require it. Windows drive-relative
resolution also reads the matching `=C:`-style environment entry when one exists.
Therefore, a world that bundles any of these specifiers must import exactly one
`wasi:cli/environment@0.2.x` interface. No Jco-specific WIT interface or
deny-by-default host adapter is involved.

```js
import path, { matchesGlob } from "node:path";
import { join as winJoin } from "node:path/win32";

export function outputPath(name) {
  if (!matchesGlob(name, "**/*.js")) throw new TypeError("expected JavaScript");
  return `${path.resolve("dist", name)}|${winJoin("C:\\dist", name)}`;
}
```

Adapter authors can import `createPath()` from the versioned `jco-std` entry
point and supply typed `initialCwd` and `getEnvironment` providers. This is also
the boundary used by Jco's builtin adapter. `minimatch` 10.2.6 is bundled for
Node-compatible `matchesGlob()` behavior; it does not add filesystem access.

### String decoder

The versioned string-decoder module implements Node 24's `StringDecoder` in the
guest and reuses Jco's existing `node:buffer` core. It preserves incomplete UTF-8,
UTF-16LE, base64, and base64url groups across writes, accepts strings and all
`ArrayBufferView` inputs, and supports Node's encoding aliases. No WIT import,
host adapter, JSPI configuration, or machine capability is required.

```js
import { Buffer } from "node:buffer";
import { StringDecoder } from "node:string_decoder";

const decoder = new StringDecoder("utf8");
decoder.write(Buffer.from([0xf0, 0x9f]));
decoder.end(Buffer.from([0x8c, 0x8d])); // "🌍"
```

The implementation follows Node 24.20.0's module surface and portable decoder
algorithms. It also retains the legacy `text`, `lastChar`, `lastNeed`, and
`lastTotal` prototype members that remain present in Node 24, although new code
should use the documented constructor, `write()`, and `end()` API.

### Errors globals

Node's [Errors API](https://nodejs.org/docs/latest-v24.x/api/errors.html) is not an
importable `node:errors` module. It describes global JavaScript error constructors,
system-error fields, propagation conventions, and the stable `error.code` values
produced by other Node APIs.

When Jco bundles component source, references to `Error`, `AggregateError`,
`DOMException`, `EvalError`, `RangeError`, `ReferenceError`, `SuppressedError`,
`SyntaxError`, `TypeError`, and `URIError` automatically use the versioned errors
adapter. No source import or WIT capability is required:

```js
export function describeFailure() {
  const cause = new TypeError("invalid input");
  return new Error("operation failed", { cause }).cause.message;
}
```

```console
jco componentize component.js --wit wit --bundle -o component.wasm
```

The adapter preserves the guest engine's native constructor identities and adds
portable Node extensions when the engine lacks them, including
`Error.captureStackTrace`, `Error.stackTraceLimit`, and `Error.isError`. Shared
jco-std shims use the same implementation for coded validation and system-error
objects. Exact stack frames remain engine-specific.

Injection is demand-driven. If a bundled source graph never references one of
these constructors, Rolldown omits the errors adapter entirely, so the finished
bundle pays no code-size or runtime cost for it. `node:errors` deliberately remains
unresolved because Node 24 does not provide that module either.

### Child processes

Source that uses `node:child_process` must be bundled so Jco can replace the
Node import with the guest adapter. For example, `component.js` can export a
function backed by Node's synchronous API:

```js
import { execFileSync } from "node:child_process";

export function nodeVersion() {
  return execFileSync("node", ["--version"], { encoding: "utf8" }).trim();
}
```

The starting `wit/component.wit` does not need to declare the child-process
capability itself:

```wit
package example:child-process;

world app {
  export node-version: func() -> string;
}
```

Build the component with bundling enabled and, when needed, select the world
that Jco should update:

```console
jco componentize component.js \
  --wit wit \
  --world-name app \
  --bundle \
  -o component.wasm
```

When Jco detects `node:child_process`, it edits the selected world in place if
the import is missing:

```wit
world app {
  // Added by Jco because bundled source imports node:child_process.
  import jco:node/child-process@0.1.0;
  export node-version: func() -> string;
}
```

Jco also adds the interface definition at
`wit/deps/jco-node-0.1.0/package.wit` and prints a warning naming the modified
files so the generated changes are visible for review and commit. An existing
import or dependency is preserved, and running the command again does not add a
duplicate.

Adding the WIT import does not grant permission to spawn processes. By default,
Jco maps it to a host shim that throws
`ERR_JCO_CHILD_PROCESS_ADAPTER_REQUIRED`. Applications that intend to grant
process spawning must explicitly map the opt-in Node host adapter when
transpiling the component:

```console
jco transpile component.wasm \
  --map 'jco:node/child-process@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process/host/node'
```

The current WIT interface supports `spawnSync`, `execFileSync`, and `execSync`.
The asynchronous `spawn`, `exec`, and `execFile` APIs, `ChildProcess`, and
`fork`/IPC throw `ERR_JCO_UNSUPPORTED_NODE_API`: callbacks, lifecycle events,
and interactive streams cannot be represented faithfully by the synchronous
interface yet.

### Filesystem

Source can keep ordinary `node:fs` and `node:fs/promises` imports. For example:

```js
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";

export async function replace(path, contents) {
  await writeFile(path, contents);
  return readFileSync(path, "utf8");
}
```

Bundle the source when building the component:

```console
jco componentize component.js --wit wit --bundle -o component.wasm
```

If the selected world does not already import the filesystem capability, Jco
edits it in place, installs `fs.wit` under `wit/deps/jco-node-0.1.0`, and warns
about the generated changes:

```wit
world app {
  // Added by Jco because bundled source imports node:fs.
  import jco:node/fs@0.1.0;
}
```

Existing imports and dependency files are preserved, and rerunning the command
does not add duplicates. Use `--world-name` when the WIT package contains more
than one world.

The generated import grants no filesystem access by itself. Jco's default host
provider throws `ERR_JCO_FS_ADAPTER_REQUIRED`. A Node application must opt into
the real Node filesystem provider while transpiling:

```console
jco transpile component.wasm \
  --map 'jco:node/fs@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs/host/node'
```

The guest adapter shares one descriptor core across synchronous, callback, and
promise APIs. It supports path operations, metadata, directory entries, file
descriptors, vector I/O, and promise `FileHandle`s. Callback APIs complete on a
guest microtask. Stream constructors, file watching, `openAsBlob`, and other
resource-oriented APIs currently throw `ERR_JCO_UNSUPPORTED_NODE_API`; the WIT
boundary does not yet model their streams, events, or long-lived resources.

Note that the `node:` specifiers are replaced when Jco bundles source during
componentization. The package export can also be imported directly:

```ts
import assert, { deepStrictEqual } from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/assert";

assert(true);
deepStrictEqual({ ready: true }, { ready: true });
```

When bundled source imports `node:console`, Jco adds the host capability to the
selected WIT world if it is missing:

```wit
world component {
    // Added by Jco because bundled source imports node:console.
    import jco:node/console@0.1.0;
}
```

It also installs `console.wit` in the `jco-node-0.1.0` dependency directory and
prints a warning describing the generated edits. Existing imports and dependency
files are preserved, so repeated componentization does not create duplicates.

The capability is denied by default. This lets a component containing optional
console calls build without implicitly granting it Node.js host access; calling
an output method through the default mapping throws
`ERR_JCO_CONSOLE_ADAPTER_REQUIRED`.

Applications running under Node can explicitly select the passthrough provider:

```console
jco transpile component.wasm \
  --map 'jco:node/console@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console/host/node'
```

The guest boundary contains only a stream selector, strings, and terminal
metadata queries. It does not expose Node stream objects, so a browser console
provider can be added later without changing component-facing code.

### Operating-system information

Guest source uses the ordinary Node API:

```js
import os from "node:os";

export function hostSummary() {
  return `${os.platform()} ${os.arch()} (${os.availableParallelism()} CPUs)`;
}
```

When bundled source imports `node:os`, Jco adds a generated
`jco:node/os@0.1.0` import to the selected WIT world when it is absent, installs
`os.wit` in `wit/deps/jco-node-0.1.0`, and warns about both source changes.
Aliased existing imports are recognized and repeated componentization is
idempotent.

Machine inspection and priority changes are denied by default with
`ERR_JCO_OS_ADAPTER_REQUIRED`. The value exports `EOL`, `devNull`, and
`constants` use a non-sensitive POSIX/WASI snapshot so importing optional code
does not itself reveal host state. A Node application can opt into values from
the actual machine:

```console
jco transpile component.wasm \
  --map 'jco:node/os@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/os/host/node'
```

The opt-in adapter delegates the supported Node 24 surface to the runtime's
real `node:os` module and preserves typed CPU, network-interface, user, constant,
and structured-error records across WIT. All operations are synchronous, so no
JSPI configuration is required. Applications can build restricted providers
against the exported `OsHost` types and use the conversions in
`wasi/0.2.x/node/24.x.x/os/host-utils`; `os/core` builds the idiomatic guest
module from such a provider.

### DNS

Application source continues to use ordinary Node imports:

```js
import dns from "node:dns";
import dnsPromises from "node:dns/promises";

export function configuredServers() {
  return [...dns.getServers(), ...dnsPromises.getServers()];
}
```

Bundle the source when creating the component so Jco can replace both imports:

```console
jco componentize component.js --wit wit --world-name component --bundle -o component.wasm
```

If the selected world does not already import `jco:node/dns@0.1.0`, Jco adds the
generated import and `dns.wit` dependency and warns about the source changes.
Repeated builds preserve an existing import and do not add duplicates.

DNS access is denied by default with `ERR_JCO_DNS_ADAPTER_REQUIRED`. A Node host
can explicitly grant access when transpiling:

```console
jco transpile component.wasm \
  --map 'jco:node/dns@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dns/host/node'
```

The opt-in provider delegates queries directly to Node's real asynchronous
`node:dns/promises` implementation. When an application supplies a DNS host map,
Jco automatically uses JSPI to make that promise-returning host function appear
synchronous to the Preview 2 guest without blocking Node's event loop. Component
exports are consequently promise-returning and must be awaited by JavaScript hosts.

`Resolver.cancel()` throws `ERR_JCO_UNSUPPORTED_NODE_API`: the synchronous WIT
interface does not expose an in-flight c-ares request as a resource that a later
guest call could cancel. The WIT boundary remains runtime-neutral so a browser DNS
provider can be added later.

### HTTP

Application code uses the ordinary Node API:

```js
import { get } from "node:http";

export function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      const chunks = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => resolve(chunks.join("")));
    });
    request.once("error", reject);
  });
}
```

Servers use the same callback and class APIs:

```js
import { createServer } from "node:http";

const server = createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end(`received ${request.method} ${request.url}`);
});

server.listen(8080, "127.0.0.1");
```

Bundle it and select how `node:http` reaches the host:

```console
jco componentize component.js --wit wit --bundle \
  --with-nodejs-http-via wasi-http -o component.wasm
```

`--with-nodejs-http-via` accepts:

- `direct` (the default), which adds `jco:node/http@0.1.0`; its default provider
  throws `ERR_JCO_HTTP_ADAPTER_REQUIRED`, and a Node application can explicitly
  map `wasi/0.2.x/node/24.x.x/http/host/node` when transpiling. It supports
  clients and servers through real `node:http`;
- `wasi-sockets`, which implements HTTP/1.1 in the guest using only Preview 2
  socket and IO capabilities, including TCP servers; and
- `wasi-http`, which translates requests to Preview 2
  `wasi:http/outgoing-handler`. It rejects `Server` construction immediately
  because an outgoing-handler cannot listen for arbitrary inbound connections.

When the selected world is missing a required import or callback export, Jco
edits that world in place, adds generated comments and declarations, installs
the corresponding WIT packages under `wit/deps`, and prints a warning. Direct
servers use an imported host-owned `server` resource plus an exported
guest-owned request-listener resource. Jco re-bundles a small entry wrapper so
the callback implementation is present on the final component export. Existing
declarations and dependency files are preserved, aliases are recognized, and
repeated componentization does not add duplicates. Use `--world-name` when the
WIT package defines multiple worlds.

The initial implementation buffers each request and response at the
implementation boundary. Client and server objects retain Node-style callbacks
and events inside the guest. Connection pooling, upgrades, CONNECT tunnels,
HTTPS, and persistent HTTP/1.1 connections in the `wasi-sockets` implementation
are not implemented; unavailable operations throw explicit errors.

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
