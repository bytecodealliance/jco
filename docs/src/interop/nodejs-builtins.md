# NodeJS built-in compatibility

Jco's long-term goal is to let existing Node.js programs become WebAssembly
components with as few source changes as possible.

> [!WARNING]
> Jco's Node.js built-in compatibility for components is experimental and subject
> to change. APIs, behavior, and generated component interfaces may change
> incompatibly without a semver-major release.

In the ideal case, application code can keep an ordinary import such
as `import { Buffer } from "node:buffer"`, and `jco componentize` supplies
a portable implementation while producing the component.

> [!NOTE]
> In the future, NodeJS compatibility will likely be built into the layer
> _below_ Jco -- ComponentizeJS. When that day comes, the NodeJS compatibility
> layer in Jco will likely be deprecated.

## Compatibility boundaries

Note that this is a best-ieffort compatibility layer, not a Node.js process inside
WebAssembly. Node APIs often assume access to an operating system, threads,
subprocesses, native addons, or Node's event loop.

JS WebAssembly components can only use capabilities declared by WIT worlds, given that
the built-in JavaScript engine does not automatically provide Node internals, in Jco we
support NodeJS compatibility API by API, with explicit behavior and tests for
each supported module.

## Enabling Node.js built-ins

Node built-ins are replaced while Jco bundles component source. JavaScript entry
points must pass `--bundle`; TypeScript entry points are bundled automatically:

```console
jco componentize app.js --bundle --wit wit -o app.wasm
jco componentize app.ts --wit wit -o app.wasm
```

### Bundling behavior

During bundling, Jco's Node built-in plugin resolves supported `node:` imports to
virtual ES modules.

Virtual modules and their portable dependencies are included in
the guest JavaScript before [ComponentizeJS][componentize-js] or
`componentize-qjs` embeds it in a WebAssembly component.

Application source should keep its normal `node:` imports. Direct imports of the
underlying `jco-std` implementation are not the recommended application-facing
interface for Node.js compatibility.

## Implementation selection

Resolution follows a deliberate quality order:

1. A Jco or jco-std implementation wins when it has better Node compatibility or
   needs a WASI-aware design.
2. An audited [unenv][unenv] implementation is used when its complete public
   surface and dependency graph work in a component.
3. An admitted module can expose an explicit unsupported stub for an unavailable
   API. Deprecated APIs always fail immediately rather than running a deprecated
   implementation.
4. Everything else remains unresolved. Jco never enables unenv's entire alias map
   merely because an alias exists.

Bare specifiers participate too, but only as a fallback. A dependency written before the
`node:` prefix existed says `require("stream")`, and leaving that unresolved fails the build
for most of npm. So Jco resolves the specifier normally first, and only treats it as a
builtin when nothing answers to the name -- a package that genuinely installs `buffer`,
`punycode` or `process` still wins.

## Combining built-ins with `jco-std`

Node built-in compatibility can be mixed freely with direct imports from
[`@bytecodealliance/jco-std`](./jco-std.md) and other portable packages.

They are resolved as separate parts of the same bundle, not selected as alternative
componentization modes. For example, a component can use jco-std's Hono adapter
while its application code imports `node:assert` and `node:buffer`.

## Currently supported modules

The current compatibility target is Node.js 24.20.0. Implementations that predate
that patch retain their pinned Node 24 provenance; `node:stream/iter` specifically
targets the release where it was introduced. The unenv-backed modules are
audited against `unenv@2.0.0-rc.24`; upgrading unenv requires rerunning the
compatibility suites.

These entry points are namespaced by two independent versions: the WASI version they adapt
Node to, and the Node major they implement. The modules below live under
`wasi/0.2.x/node/<major>.x.x`, where `0.2.x` means the latest WASI p2 release and `<major>.x.x`
means any release of that Node major -- most modules under `24.x.x`, and `node:ffi`, which does not
exist before Node 26, under `26.x.x`. Both axes move on their own -- Node's builtin semantics change across majors, and the
same module adapted to WASI p3 is a different implementation -- so a new Node major or a p3
adaptation is added alongside rather than replacing what is there.

Downstream projects should use explicit versions matching what they target, and Jco pins both
when it bundles, so what is being built for is always explicit.

Automatically selecting the right WASI and NodeJS versions at build time, or detecting them,
is planned.

> [!NOTE]
> To support `node/path` remains as an alias for `wasi/0.2.x/node/24.x.x/path`, so imports written before the
> entry points were versioned keep resolving.
>
> It is the only such alias: modules added after the split, including `node:assert`, are
> available only under a versioned entry point.

| Imports                                           | Implementation                                                                                       | Notes                                                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node:assert`, `node:assert/strict`               | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/assert`                                            | Adapted from the MIT-licensed Node.js 24 implementation. Requires no WIT capability.                                                                               |
| `node:path`, `node:path/posix`, `node:path/win32` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/path`                                              | Jco's portable path implementation, connected to `wasi:cli/environment` for the guest working directory and environment.                                           |
| `node:string_decoder`                             | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/string-decoder`                                    | Guest-local streaming decoder for Node 24. Requires no WIT capability.                                                                                             |
| `node:domain`                                     | _(refused)_                                                                                          | Deprecated upstream in its entirety. Resolves so the failure explains itself; every use throws `ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`.                          |
| `node:ffi`                                        | `@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi`                                               | **Node 26 only.** Native calls and host memory over an explicit host capability; denied by default. Callbacks and guest-buffer addresses are refused -- see below. |
| `node:module`                                     | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/module`                                            | Classification, source maps and `require.resolve` are exact. Everything that **loads** throws `ERR_JCO_UNSUPPORTED_NODE_API` -- see below. Requires no WIT capability. |
| `node:async_hooks`                                | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/async-hooks`                                       | Synchronous scopes only. Requires no WIT capability. Asynchronous use is refused rather than silently losing the store -- see below.                               |
| `node:diagnostics_channel`                        | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/diagnostics-channel`                               | Channels and tracing channels. Requires no WIT capability. Bound stores are scoped synchronously.                                                                  |
| `node:child_process`                              | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process`                                     | Synchronous APIs over an explicit application-provided host capability; denied by default.                                                                         |
| `node:cluster`                                    | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/cluster`                                           | Primary/worker control over an explicit host capability. Partly unsupported -- see below.                                                                          |
| `node:console`                                    | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console`                                           | Guest console over an explicit application-provided host capability; denied by default, so every call throws until the application maps a provider.                |
| `node:dns`, `node:dns/promises`                   | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dns`                                               | Name resolution over an explicit host capability; denied by default.                                                                                               |
| `node:fs`, `node:fs/promises`                     | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs`                                                | Synchronous, callback, and promise facades over an explicit filesystem capability; denied by default.                                                              |
| `node:http`                                       | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http`                                              | Client and server APIs over a selectable direct, Preview 2 sockets, or Preview 2 WASI HTTP transport. Serving works on the `direct` transport; see below.          |
| `node:inspector`, `node:inspector/promises`       | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/inspector`                                         | Session, console, and broadcast surface over an explicit host capability; denied by default. The host calls back through a guest-exported interface -- see below.  |
| `node:os`                                         | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/os`                                                | Machine and user information over an explicit host capability; denied by default. Static POSIX constants resolve without a provider -- see below.                  |
| `node:buffer`                                     | unenv's portable Buffer core with a Jco public adapter                                               | Covers the commonly used modern Buffer operations. Jco controls deprecated and runtime-dependent exports.                                                          |
| `node:events`                                     | unenv's EventEmitter with a Jco layer from `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/events` | Covers the complete Node 24 module surface, including the `on()` async iterator and `EventEmitterAsyncResource`. Requires no WIT capability.                       |
| `node:querystring`                                | unenv's Node-derived querystring implementation                                                      | Covers the complete Node 24 module surface and shares the audited Buffer core used by `node:buffer`.                                                               |
| `node:stream/consumers`                           | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/stream/consumers`                                  | Portable Node 24 collection helpers over async iterables and engine globals. Requires no WIT capability.                                                           |
| `node:stream/iter`                                | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/stream/iter`                                       | Experimental Node 24.20 iterable streams. Requires no WIT capability. Classic output adapters are explicitly unsupported.                                          |
| `node:crypto`                                     | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/crypto`                                            | Synchronous `sha1`/`sha256` digests and HMAC, implemented in the guest because Node-shaped code hashes inline and cannot await. Randomness is the engine's WebCrypto; ciphers, keys and signatures defer to `crypto.subtle`. |
| `node:timers`                                     | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/timers`                                            | The engine's timers, plus `setImmediate`/`clearImmediate`, which are Node's rather than the web's.                                                                 |
| `node:https`, `node:net`, `node:process`, `node:stream`, `node:stream/promises`, `node:tty`, `node:url`, `node:util`, `node:util/types`, `node:zlib` | unenv's portable implementations                                          | Carried as they are, behind a thin adapter that gives each a stable identity in the bundle. `node:stream`'s adapter is CommonJS so that `require("stream")` is the `Stream` constructor, as it is in Node. |

### Stream consumers and iterable streams

`node:stream/consumers` supports Node 24 applications written before or after the
24.20 iterable-stream addition. `node:stream/iter` exposes the experimental 24.20
batch-oriented API. Both execute entirely inside the guest and share byte
normalization, limits, text decoding, and collection behavior. Importing either
specifier adds no host or WIT capability.

For example, ordinary Node application source can use both entry points:

```js
import { text as consumeText } from 'node:stream/consumers';
import { from, pull, text } from 'node:stream/iter';

export async function run() {
    const upper = (batch) =>
        batch?.map((chunk) => chunk.map((byte) => (byte >= 97 && byte <= 122 ? byte - 32 : byte))) ?? null;
    return {
        consumed: await consumeText(['consumer']),
        transformed: await text(pull(from('iterable'), upper)),
    };
}
```

Bundle that source normally; the WIT world only needs to describe the component's
own imports and exports:

```console
jco componentize app.js --bundle --backend starlingmonkey -w app.wit -o app.wasm
```

The implementation uses engine-provided iterable, typed-array, Blob, text-codec,
and abort globals. `fromReadable()` and `fromWritable()` work with duck-typed
classic streams. `toReadable()`, `toReadableSync()`, and `toWritable()` need real
classic Node stream constructors, which neither the component engine nor the
audited unenv release provides. Those functions remain present but immediately
throw `ERR_JCO_UNSUPPORTED_NODE_API`; they do not inspect their arguments first.

> [!WARNING]
> Node marks `node:stream/iter` experimental. Its Jco implementation is likewise
> experimental and may change incompatibly without a semver-major release as the
> upstream Node 24 API evolves.

### Globals

Node's [Globals API](https://nodejs.org/docs/latest-v24.x/api/globals.html) is a
catalog of runtime bindings, not a `node:globals` module. Jco therefore does not
resolve that specifier. Bundled code can use `Buffer` without importing
`node:buffer`; Rolldown injects Jco's existing audited Buffer adapter only when a
free `Buffer` identifier is referenced. A source graph that never uses it pays no
bundle-size or initialization cost.

Three more Node globals are injected the same way, for the same reason -- package code
reaches them without importing anything:

- `process`, from `node:process`. Because it is defined, code that branches on
  `typeof process === "undefined"` to detect a browser takes its Node path, which is the
  same choice Node presents it with.
- `setImmediate` and `clearImmediate`, from `node:timers`.

### Regular-expression syntax the engine does not implement

StarlingMonkey's SpiderMonkey is built without Unicode property escapes, so a regular
expression containing `\p{...}` is a *syntax* error: the module carrying one cannot be
parsed at all, and the failure surfaces during pre-initialization rather than where it was
written.

While bundling, Jco replaces each escape with the exact set of code points it matches,
computed from the building runtime's own Unicode tables, so the rewritten expression matches
what Node matches. An escape is left alone when its expression is not in `u`/`v` mode -- where
`\p` is a literal `p` and rewriting would change the meaning -- or when the building runtime
does not know the property.

The component engine already supplies the portable Web globals shared with Node,
so Jco leaves their identities and behavior untouched. With ComponentizeJS 0.22.0's
pinned StarlingMonkey runtime, this includes:

- `AbortController`, `AbortSignal`, `atob`, `btoa`, `Blob`, and `File`;
- `ByteLengthQueuingStrategy`, `CountQueuingStrategy`, `ReadableStream` and its
  exposed reader/controller classes, `WritableStream`, `TransformStream`,
  `CompressionStream`, and `DecompressionStream`;
- `console`, `Crypto`, `CryptoKey`, `SubtleCrypto`, `crypto`, `CustomEvent`,
  `DOMException`, `Event`, and `EventTarget`;
- `fetch`, `FormData`, `Headers`, `Request`, and `Response`;
- `Performance`, `performance`, `queueMicrotask`, timeout/interval functions,
  `structuredClone`, `TextEncoder`, `TextDecoder`, `URL`, `URLSearchParams`, and
  `WebAssembly`.

Some of these retain StarlingMonkey's existing WASI feature requirements, such as
clocks for timers, random for WebCrypto, stdio for console, and HTTP for network
fetches. Jco does not add a Node-specific WIT capability for globals.

### Errors globals

The Node [Errors API](https://nodejs.org/docs/latest-v24.x/api/errors.html) is
cross-cutting behavior rather than a `node:errors` module. Standard error
constructors are globals, while individual Node APIs create coded and system
errors. Jco therefore does not resolve `node:errors`; Node 24 rejects that
specifier as well.

Bundled code can use `Error`, `AggregateError`, `DOMException`, `EvalError`,
`RangeError`, `ReferenceError`, `SuppressedError`, `SyntaxError`, `TypeError`, and
`URIError` without an import. Rolldown injects
`@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/errors` only for constructors
actually referenced by the source graph. A graph that uses none of them contains
none of the adapter after bundling.

The adapter preserves the guest engine's constructor identities, supplies
portable fallbacks for missing newer constructors and V8 Error extensions, and
provides the common coded/system-error core used by other jco-std Node shims. No
WIT capability is required. Error classes, codes, and documented system fields
are compatibility targets; exact stack frames and source positions remain
engine-specific.

### Assert

Jco keeps its own assert implementation because the assertion namespace is a
coherent system: comparison semantics, callable/default/strict identities,
`AssertionError`, and error matching must work together (and can change across
versions).

The implementation covers Node 24's public module surface and comparison of
cycles, Maps, Sets, typed arrays, errors, symbols, and other built-in families.
The deprecated `CallTracker` API throws immediately. The deprecated multi-argument
form of `assert.fail()` also throws immediately, while its current zero- and
one-argument forms remain available.

### Path and WASI capabilities

Path manipulation is portable, but `path.resolve()` and related operations need a
current working directory.

Jco obtains that value through `wasi:cli/environment@0.2.x`, so the selected WIT
world must import exactly one compatible version when it uses `node:path`:

```wit
world app {
  import wasi:cli/environment@0.2.6;
  // component imports and exports...
}
```

Jco selects the adapter matching the version in the world. A component that only
uses capability-free built-ins such as assert, Buffer, or querystring does not
need this import.

### String decoder

Bundled source can use the documented Node 24 streaming decoder directly:

```js
import { Buffer } from "node:buffer";
import { StringDecoder } from "node:string_decoder";

const decoder = new StringDecoder("utf8");

export function decode() {
  return decoder.write(Buffer.from([0xf0, 0x9f])) +
    decoder.end(Buffer.from([0x8c, 0x8d]));
}
```

Jco maps the import to a guest-local implementation based on Node 24.20.0. It
retains incomplete UTF-8, UTF-16LE, base64, and base64url groups between calls,
supports Node's encoding aliases, and accepts strings or any `ArrayBufferView`.
It reuses the audited Buffer core already used by `node:buffer`; it does not add a
WIT import, callback export, host adapter, or JSPI operation.

Because the adapter is selected only when bundled code resolves
`node:string_decoder`, source graphs that do not import it pay no decoder code or
initialization cost. The legacy bare `string_decoder` specifier is deliberately
not intercepted.

### Child processes and host capabilities

A WebAssembly guest cannot spawn a process itself. When bundled source imports
`node:child_process`, Jco ensures that the selected world declares the dedicated
interface:

```wit
world app {
  import jco:node/child-process@0.1.0;
  // component imports and exports...
}
```

If the selected world does not already contain the import, Jco edits its `.wit`
file in place, adds a comment identifying the generated line, installs the
interface definition under `deps/jco-node-0.1.0`, and prints a CLI warning naming
the changed files. This makes the capability change visible in the application's
source control. `--world` is honored when a package defines multiple worlds, and
repeated componentization does not add duplicate imports or dependencies.

The interface definition also ships in `jco-std` under `wit/node-0.1.0`.
Declaring or generating the import does not grant host access: Jco's default
transpilation map uses a provider that throws
`ERR_JCO_CHILD_PROCESS_ADAPTER_REQUIRED`. An application must make the security
decision explicitly, for example by mapping the Node host provider:

```console
jco transpile component.wasm \
  --map 'jco:node/child-process@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process/host/node'
```

That produces the call path guest `node:child_process` → WIT capability → host
adapter → Node `node:child_process`.

The current interface supports `spawnSync`, `execFileSync`, and `execSync`,
including buffered input/output, encoding, cwd, environment, shell, stdio,
timeout, signal, identity, and Windows options. `spawn`, callback-based `exec`
and `execFile`, `ChildProcess`, and `fork`/IPC are present but throw
`ERR_JCO_UNSUPPORTED_NODE_API`. A synchronous WIT function cannot faithfully
carry Node callbacks, lifecycle events, or interactive streams; those APIs stay
explicitly unavailable until the capability grows an asynchronous resource and
stream model.

### Clusters and host capabilities

A guest has no process model, so `node:cluster` follows the same pattern as
`node:child_process`. When bundled source imports it, Jco ensures the selected world
declares the interface, editing the `.wit` file in place, installing the definition under
`deps/jco-node-0.1.0`, and printing a CLI warning naming the changed files:

```wit
world app {
  import jco:node/cluster@0.1.0;
  // component imports and exports...
}
```

Declaring or generating the import does not grant host access. Jco's default
transpilation map uses a provider that throws `ERR_JCO_CLUSTER_ADAPTER_REQUIRED`, so an
application must make the security decision explicitly, for example by mapping the Node
host provider:

```console
jco transpile component.wasm \
  --map 'jco:node/cluster@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/cluster/host/node'
```

That produces the call path guest `node:cluster` → WIT capability → host adapter → Node
`node:cluster`. Because a transpiled component is itself a Node process, `cluster.fork()`
re-executes the entry, so a forked worker runs the component again and observes itself as
a worker.

Two differences from Node are unavoidable:

- **Event timing.** Node delivers cluster events on its event loop. A guest cannot be
  called back across the host boundary, so events are queued by the host and emitted
  when the guest next touches the module; `cluster.pump()` drains them on demand.
- **Messages cross as JSON.** WIT has no dynamic value type, so values JSON cannot
  represent -- functions, symbols, cycles, `BigInt` -- are rejected rather than
  silently altered.

These throw `ERR_JCO_UNSUPPORTED_NODE_API` rather than failing quietly:

| API                                                                             | Why                                                                                                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `worker.process`                                                                | A `ChildProcess` handle cannot cross the component boundary.                                                                                                       |
| `listening` event, handle sharing                                               | Cluster distributes Node `net` handles; guest servers are `wasi:sockets`, so nothing hooks them. `SCHED_RR` is accepted but does not distribute guest connections. |
| `setupPrimary({ exec, execArgv, stdio, uid, gid, inspectPort, serialization })` | These configure the host runner executing the component, not a guest file.                                                                                         |

`cluster.isMaster` and `cluster.setupMaster()` are deprecated in Node, so they throw
`ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API` and point at `isPrimary`/`setupPrimary`.

### Console and host capabilities

Writing to a console is a host capability, not a portable one: a component has no
stdout of its own. `node:console` therefore resolves against
`jco:node/console@0.1.0`, which an application must provide.

It is **denied by default**. Transpiling maps the capability to jco-std's deny
host unless told otherwise, and every call -- `write`, `isTerminal`, `colorDepth`
-- throws `ERR_JCO_CONSOLE_ADAPTER_REQUIRED`. That is deliberate: a component that
silently discarded its output would be harder to diagnose than one that says the
capability is missing.

To grant it, map the interface to a provider. jco-std ships one for Node, which
writes through to the real `process.stdout`/`process.stderr` and reports their TTY
status and color depth:

```console
jco transpile component.wasm \
  --map 'jco:node/console@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console/host/node'
```

Formatting is done in the guest -- `Console`, the `log`/`warn`/`error` family,
`group` indentation, `count`, `time`, `table` and `dir` all run guest-side, and only
the finished string crosses the boundary.

### Filesystem and host capabilities

`node:fs` and `node:fs/promises` use one `jco:node/fs@0.1.0` host capability.
When either specifier occurs in bundled source, Jco adds a missing import to the
selected world, installs `fs.wit` under `deps/jco-node-0.1.0`, and prints a CLI
warning to alert to the fact that a WIT dependency has been added.

The default filesystem host provider always throws `ERR_JCO_FS_ADAPTER_REQUIRED`.
To use the passthrough NodeJS host provider you can map it in:

```console
jco transpile component.wasm \
  --map 'jco:node/fs@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs/host/node'
```

The resulting call path for filesystem function is:
1. guest `node:fs`
2. WIT capability
3. host adapter
4. NodeJS builtins

The Node provider delegates to Node 24's synchronous operations; guest callback APIs
queue their callbacks on a microtask, and promise APIs share the same descriptor
state through promise `FileHandle`s.

Common file and directory operations, metadata, directory entries, scalar and
vector descriptor I/O, and their callback/promise facades are supported.

> [!WARNING]
> APIs whose contract requires long-lived streams or event sources are not yet supported
> -- including `ReadStream`, `WriteStream`, `Utf8Stream`, `watch`, `watchFile`, and
> `openAsBlob`.
>
> These functions currently throw `ERR_JCO_UNSUPPORTED_NODE_API` because the typed WIT
> interface does not model those resources.

### OS and host capabilities

A WebAssembly guest has no view of the machine it runs on. When bundled source
imports `node:os`, Jco ensures that the selected world declares the dedicated
interface, following the same in-place WIT editing described for
`node:child_process`:

```wit
world app {
  import jco:node/os@0.1.0;
  // component imports and exports...
}
```

Declaring or generating the import does not grant host access: Jco's default
transpilation map uses a provider that fails every inspecting or mutating call
with `ERR_JCO_OS_ADAPTER_REQUIRED`. Static POSIX values that reveal no machine
state -- `EOL`, `devNull`, and `constants` -- resolve without a provider, so the
module can be imported and used for its constants even when access is denied. An
application must make the security decision explicitly, for example by mapping
the Node host provider:

```console
jco transpile component.wasm \
  --map 'jco:node/os@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/os/host/node'
```

That produces the call path guest `node:os` → WIT capability → host adapter →
Node `node:os`.

The interface supports `arch`, `availableParallelism`, `cpus`, `endianness`,
`freemem`, `getPriority`, `homedir`, `hostname`, `loadavg`, `machine`,
`networkInterfaces`, `platform`, `release`, `setPriority`, `tmpdir`, `totalmem`,
`type`, `uptime`, `userInfo`, and `version`, with Node's argument validation and
`ERR_SYSTEM_ERROR` reconstruction for failing calls.

### Async hooks and synchronous scopes

`AsyncLocalStorage` works within a synchronous scope: `run`, `getStore`, `exit`, `enterWith`,
nesting, `snapshot` and `bind` all behave as Node does, and `AsyncResource` binds to the context it
was constructed in.

What it cannot do is carry a store across an asynchronous boundary. `await` resolves through the
engine's internal `PerformPromiseThen`, which JavaScript cannot intercept -- patching
`Promise.prototype.then` does not see it -- and StarlingMonkey exposes no TC39 `AsyncContext` to
carry the value instead.

Rather than return an empty store after an `await`, Jco refuses at the call site: any callback
given to `run`, `exit`, `withScope` or a snapshot that returns a promise throws
`ERR_JCO_UNSUPPORTED_NODE_API`, naming the reason. A failure at the call site is easier to act on
than a store that silently disappears somewhere else.

`createHook`, `executionAsyncId`, `triggerAsyncId` and `executionAsyncResource` describe the async
resource graph and always throw: nothing tracks that graph in a component.

### Domains

`node:domain` is Stability 0 -- deprecated in its entirety -- and Jco implements none of it. Its
purpose is routing errors across asynchronous boundaries, which a component cannot do in any case
(see the async hooks section).

It still resolves rather than failing as an unknown import, so the error names the reason and a way
forward instead of reading `Could not resolve 'node:domain'`. Importing is fine; every use --
`create()`, `createDomain()`, `new Domain()`, and reading `active` or `_stack` -- throws
`ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`, pointing at `AsyncLocalStorage` for carrying context.

`active` and `_stack` are reachable on the default import only. An ES module binding cannot throw
on read, so `import { active } from "node:domain"` fails at build time instead.

### Foreign function interface (NodeJS v26+)

`node:ffi` lets a component call native code on the host.

As WASI has no dynamic loader and a component has no host address space, this is host-backed, like
`node:child_process`, and is **denied by default**.

To use the NodeJS passthrough version, you can map it in:

```console
jco transpile component.wasm \
  --map 'jco:node/ffi@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi/host/node'
```

> [!NOTE]
> The host adapter forwards to the runtime's real `node:ffi`, so the runtime
> must itself be Node 26 started with `--experimental-ffi`.
>
> Without it, calls fail with a message naming the version and the flag rather
> than a missing-module error.

using the load-call-read-write cycle would look something liek this:

```js
import { DynamicLibrary, exportString, getInt32, setInt32, toString } from "node:ffi";

// null resolves symbols from the host process image, which links libc.
const lib = new DynamicLibrary(null);
const malloc = lib.getFunction("malloc", { arguments: ["uint64"], return: "pointer" });
const strlen = lib.getFunction("strlen", { arguments: ["pointer"], return: "uint64" });

const pointer = malloc(64n);
setInt32(pointer, 0, 123456);
getInt32(pointer, 0);          // 123456, read back out of host memory
exportString("hello ffi", pointer, 64);
strlen(pointer);               // 9n -- native code reading what the guest wrote
toString(pointer);             // "hello ffi"
```

Pointers cross as `bigint`, matching NodeJS.

Errors keep NodeJS's own codes, so `ERR_FFI_LIBRARY_CLOSED` and friends behave as they would on Node.

#### `node:ffi` incompatibilities

These are refused guest-side, before the host is reached, because a WebAssembly component
cannot express them:

| Surface                                                                          | Why                                                                                                                                                                                                                                                                                          |
|----------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `getRawPointer(buffer)`                                                          | Guest memory is not mapped into the host address space, so a component's buffer has no host address. Any number returned would be a lie native code then dereferences.                                                                                                                       |
| `registerCallback()`, `unregisterCallback()`, `refCallback()`, `unrefCallback()` | A native callback is a function pointer the host would call back into the guest through, which the component boundary cannot carry.                                                                                                                                                          |
| `toBuffer(p, n, false)`, `toArrayBuffer(p, n, false)`                            | `copy: false` asks for a live view into host memory. Omit the argument for the copy Node returns by default.                                                                                                                                                                                 |
| A `buffer`, `arraybuffer`, or `function` **argument type**                       | A buffer argument would be copied, so native code writing through the pointer would write into a copy the guest never sees -- silently. Declare a `pointer` and use `toBuffer`/`exportBuffer`, which copy explicitly. Refused when the signature is declared, so the message names the type. |

#### `node:ffi`'s use of `suffix`

`suffix` comes from the host, but not at module load: a component's top-level code runs under
Wizer, which refuses imported calls outright ("You cannot call arbitrary imported functions during
Wizer initialization").

`suffix` is seeded with `"so"` and replaced the first time the guest touches
the host -- or on the first read of `ffi.suffix`, which syncs before answering.

The one stale window is a destructured `import { suffix }` read before any FFI call, which is also
the documented ``dlopen(`./lib.${suffix}`)`` idiom.

The host adapter therefore lets the application set it, which is the reliable way to
serve a guest that names `.dylib` or `.dll` files:

```js
import { setSuffix } from "@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi/host/node";

setSuffix("dylib");   // before instantiating the component
```

Note that you may not need to change the suffix if the runtime already has it set properly, as
`suffix` defaults to the runtime's own `ffi.suffix`.

### Inspector

`node:inspector` (and `node:inspector/promises`) exposes the V8 inspector: a `Session` speaking the
Chrome DevTools Protocol, the inspector `console`, and the experimental `Network`/`DOMStorage`
broadcast namespaces. The inspector is host machinery -- a WebSocket server and a protocol
dispatcher wired into the running isolate -- so WASI cannot express it. Like `node:child_process`,
it is host-backed and **denied by default**.

Map it to the Node passthrough to grant it:

```console
jco transpile component.wasm \
  --map 'jco:node/inspector@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/inspector/host/node'
```

The guest code is ordinary Node:

```js
import { Session } from "node:inspector/promises";

const session = new Session();
session.connect();
const { result } = await session.post("Runtime.evaluate", { expression: "6 * 7" });
result.value;   // 42, evaluated in the host isolate
```

Argument validation, session state, the `EventEmitter` surface, and error reconstruction all run
guest-side, so `ERR_INSPECTOR_NOT_CONNECTED`, `ERR_INSPECTOR_ALREADY_CONNECTED`,
`ERR_INVALID_ARG_TYPE`, and the protocol's `ERR_INSPECTOR_COMMAND` all match Node exactly. CDP
payloads cross the boundary as JSON; the inspector `console` forwards its arguments as JSON too,
which is best-effort for functions, symbols, and cycles.

#### The host calls back into the component

The inspector's two callbacks -- a `post` response and a session notification -- run the other way,
from host to guest. A component cannot implement a resource declared on an *imported* interface (its
methods would run host-side), so the callbacks are a guest-**exported** interface,
`jco:node/inspector-callbacks@0.1.0`, holding one resource per callback kind: a one-shot
`post-callback` and a long-lived `notification-listener`. When bundled source imports
`node:inspector`, Jco adds both the `import jco:node/inspector@0.1.0;` and the matching
`export jco:node/inspector-callbacks@0.1.0;` to the selected world, and bundles the JS export
alongside the entry -- neither is written by hand.

The embedder wires the exported interface to the host adapter after instantiation:

```js
import * as inspectorHost from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/inspector/host/node";
import * as component from "./transpiled/component.js";

inspectorHost.attachCallbacks(component.inspectorCallbacks);
```

Two timing rules follow from the component model, which forbids calling into a component while a
task is already active in it:

- **In-isolate `post` responses are synchronous.** `Runtime.evaluate`, `Debugger.*`, and the other
  in-isolate methods resolve during the post call, so the host returns the response directly and an
  awaited `Session.post` never needs a re-entrant callback. This is the same behavior as Node, which
  also fires those callbacks synchronously.
- **Notifications arrive between guest tasks**, like `node:cluster`'s events: the host queues each
  notification and delivers it once no exported call is in flight, never into a suspended `await`.

### Modules

`node:module` splits cleanly in two, and the split is not about effort.

**There is no module loader in a component.** `jco componentize` bundles the whole graph ahead of
time, and StarlingMonkey cannot compile or link a module that was not present at build time -- no
`dlopen`, no filesystem, no loader to hook. No host capability would fix this: the missing piece is
the guest engine's ability to instantiate new code. So every entry point whose job is to load
something throws `ERR_JCO_UNSUPPORTED_NODE_API` and says why:

`register` · `registerHooks` · `runMain` · `findPackageJSON` · `stripTypeScriptTypes` ·
`setSourceMapsSupport` · `Module.prototype.require` / `load` / `_compile` · and the `_*` loader
internals (`_load`, `_resolveFilename`, `_findPath`, `_nodeModulePaths`, and the rest).

**Everything else is real**, because it is classification or arithmetic:

| Surface | Behavior |
| --- | --- |
| `builtinModules`, `isBuiltin` | Node 24's list, verbatim. `isBuiltin` agrees with Node on every builtin in every spelling, including prefix-only ones -- `isBuiltin("node:test")` is true and `isBuiltin("test")` is false |
| `SourceMap` | Implemented in full: VLQ decoding, `findEntry`, `findOrigin`, `payload`, `lineLengths` |
| `wrap`, `wrapper` | Deprecated upstream but pure string work, so they behave as Node's do, including `wrap` reading a mutated `wrapper` live |
| `constants`, `findSourceMap`, `getSourceMapsSupport`, `getCompileCacheDir`, `flushCompileCache`, `syncBuiltinESMExports` | Exact, down to Node's null-prototype return objects |
| `globalPaths` | `[]` -- a true statement, not a refusal: there is no `$HOME/.node_modules` to search |
| `enableCompileCache` | Reports `{ status: FAILED, message }`. Node's own protocol for "could not", so callers that branch on `status` keep working instead of catching |
| `new Module(id)` | Constructs, with Node's own-property shape. Its *methods* are what need a loader |

#### `createRequire`

`createRequire()` **succeeds**. Code routinely writes `const require = createRequire(import.meta.url)`
at module top level and only calls it on some paths; refusing at creation would break modules that
require nothing.

Calling the returned `require()` refuses and points at static `import`. But `require.resolve` is not
a refusal -- it answers truthfully:

```js
const require = createRequire(import.meta.url);
require.resolve("node:path");   // "node:path", exactly as Node answers
require.resolve("lodash");      // throws MODULE_NOT_FOUND -- which is the truth here
require.cache;                  // genuinely empty
require.main;                   // genuinely undefined
```

#### A caveat on `builtinModules`

It reports Node's list, not the modules Jco resolves. `isBuiltin` asks "is this a Node builtin?",
which is a classification question, so answering for Node is the faithful thing. A guest that writes
`if (isBuiltin(x)) require(x)` therefore gets a true answer followed by a refusal. The table at the
top of this page is what says which builtins a component can actually import.

### Diagnostics channels

Publish/subscribe for instrumentation, entirely in-process, so it needs no WIT capability. Channels
are interned by name: a publisher and a subscriber that never share a reference still meet on the
same object.

`TracingChannel` is implemented in full -- `traceSync`, `tracePromise` and `traceCallback`, with
the `start`/`end`/`asyncStart`/`asyncEnd`/`error` sub-channels emitted in Node's order.

`Channel.bindStore` accepts anything offering `run(value, fn)`, which includes jco-std's
`AsyncLocalStorage`. Stores are therefore scoped synchronously: a bound store is visible while
subscribers run and does not follow an `await`. See the async hooks section above for why.

### Events

`node:events` is two pieces. The `EventEmitter` itself comes from unenv, audited against Node 24:
`on`/`emit`, one-shot `once`, listener ordering under `prependListener`, `eventNames`,
`removeAllListeners`, the per-emitter max-listener methods, and an unhandled `error` throwing all
match Node, as do `once()`, `on()`'s async iterator, `getEventListeners`, `addAbortListener` and
`EventEmitterAsyncResource`.

Three module-level functions do not, and Jco implements them in jco-std rather than exporting
something that fails when called:

| Entry point                                | unenv                                                                | Jco                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `events.listenerCount(emitter, eventName)` | throws `[unenv] node:events.listenerCount is not implemented yet!`   | delegates to the emitter's own `listenerCount`, as Node does, so a subclass that overrides it is honored |
| `events.setMaxListeners(n[, ...targets])`  | throws `[unenv] node:events.setMaxListeners is not implemented yet!` | sets the limit on `EventEmitter`s and `EventTarget`s, or the process-wide default when given no targets  |
| `events.getMaxListeners(target)`           | throws for an `EventTarget`; only handles emitters                   | reads either, falling back to the current default                                                        |

Argument validation matches Node's, `ERR_INVALID_ARG_TYPE` and `ERR_OUT_OF_RANGE` messages
included.

Node's module object _is_ the `EventEmitter` class, so `events === events.EventEmitter` holds here
too: the adapter keeps the class as the default export, and installs the three functions above as
statics on it so both access paths reach the working versions.

Note for anyone reading jco-std: it carries a separate, deliberately minimal `EventEmitter` of its
own for shims such as `node:cluster`. jco-std does not depend on unenv, and shim code importing a
`node:*` builtin would rely on a bundler rewriting it, which is not true of every way jco-std is
consumed. The two are independent by design.

### DNS and host capabilities

`node:dns` and `node:dns/promises` share one guest implementation and the
`jco:node/dns@0.1.0` capability. Jco adds that import and its `dns.wit`
dependency when bundled source uses either specifier. The default provider throws
`ERR_JCO_DNS_ADAPTER_REQUIRED`; applications opt into Node name resolution with:

```console
jco transpile component.wasm \
  --map 'jco:node/dns@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dns/host/node'
```

The WIT interface represents each DNS operation as a named, typed function; it
does not tunnel requests through a serialized dispatcher. The Node provider calls
the real asynchronous `node:dns/promises` operations directly. When an application
supplies a DNS host map, Jco automatically enables JSPI for every function in
`jco:node/dns@0.1.0`. The Preview 2 WIT calls therefore remain synchronous from the
guest's perspective without blocking Node's event loop or creating a worker for
each query. Because any component export may transitively call DNS, mapped
components expose promise-returning exports that JavaScript hosts must await.
Callback APIs retain callback delivery in the guest, and the promises subpath
shares server and default-result-order state with the main module.

`Resolver.cancel()` throws `ERR_JCO_UNSUPPORTED_NODE_API`. The synchronous WIT
boundary does not expose an outstanding c-ares request that a later guest call
could cancel. The provider boundary otherwise remains Node-independent, leaving
room for a future browser implementation.

### HTTP and selectable implementations

The `node:http` adapter implements both client and server NodeJS HTTP APIs,
with outbound `request()` and `get()` calls with Node-style `ClientRequest`
and buffered `IncomingMessage` objects along with `http.Server`.

As this API obviously requires access to the outside world of some sort, and
there are actually many ways to achieve that on the host side, you must select
the host implementation during componentization:

```console
jco componentize component.js --wit wit --bundle \
  --with-nodejs-http-via wasi-sockets -o component.wasm
```

| Value              | Component boundary                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `direct` (default) | Typed `jco:node/http@0.1.0`; denied by default, with an opt-in Node `node:http` provider.                  |
| `wasi-sockets`     | Preview 2 DNS lookup, TCP sockets, streams, and pollables; HTTP/1.1 framing and parsing live in the guest. |
| `wasi-http`        | Preview 2 `wasi:http/outgoing-handler` and `wasi:http/types`.                                              |

Jco injects only the selected mode's missing imports into the selected world. In
direct mode it also injects the `jco:node/http-callbacks@0.1.0` export and
re-bundles the component entry with the matching guest callback implementation.
Generated declarations include comments, pinned dependencies are installed under
`wit/deps`, and Jco warns about the visible WIT changes. Existing declarations,
including aliases, are preserved and repeated componentization is idempotent.

The `direct` implementation is asynchronous; Jco configures its typed request,
listen, close, and connection-count imports for JSPI so they appear synchronous
to the Preview 2 guest without a worker. Direct and `wasi-sockets` implement
clients and servers. `wasi-http` implements clients and rejects server
construction immediately because outgoing-handler cannot listen for arbitrary
connections.

> [!WARNING]
> All modes currently buffer complete request and response bodies.

Connection pooling, upgrades, CONNECT tunnels, and HTTPS are explicit gaps.
Unavailable operations throw `ERR_JCO_UNSUPPORTED_NODE_API` rather than silently
doing nothing.

#### Serving requests

`http.createServer()` and `server.listen()` work on the `direct` and `wasi-sockets`
implementations. What `listen()` does differs between them, and an application that wants to
report the port it is serving on has to know which.

> [!IMPORTANT]
> On `wasi-sockets` the guest owns the accept loop, so **the export that starts a server does
> not return while the server is serving**. `listen()` itself returns, and the statements
> after it run:
>
> ```js
> server.listen(0, "127.0.0.1");
> console.error(`listening on ${server.address().port}`);   // runs
> ```
>
> What waits is the return to the host. The guest accepts connections by blocking on a
> pollable, and that has to happen while the call is still open: a component only runs while
> a call into it is in progress, so there is no background task to move the accept loop into.
> Deferring it to a timer callback does let the export return -- and then the server answers
> nothing, because no guest code is running to accept. The socket is bound, so connections
> are reset rather than refused. Blocking is what makes it serve.
>
> While it waits, the host thread waits too. Preview 2's `pollable.block()` is served by
> `preview2-shim` through a worker and `Atomics.wait`, so the JavaScript host is parked for as
> long as the guest is waiting for a connection. A client in the *same* process therefore
> deadlocks -- it never gets a turn to send -- and has to run somewhere else, which is why the
> test for this drives the component from a separate process.
>
> Component-model async, where a guest can hold concurrent tasks the host drives, is what
> would change this; Preview 2 has no equivalent.
>
> For a program that would keep running under Node -- a script that calls `app.listen()` and
> stays up -- this is the shape you want, and `wasi:cli/run` is where it belongs: `run()`
> blocks for the lifetime of the server, exactly as the Node process would. If instead you
> need the export to return and requests to arrive afterwards, the host has to own the
> socket: use the `direct` implementation, or export `wasi:http/incoming-handler` and skip
> `node:http`'s server entirely.
>
> On `direct` the host owns the socket, `listen()` returns, and the export finishes normally.
> Requests arrive later, through the callbacks export.

Two things have to be arranged around the `direct` implementation.

The host provider is one of the component's *imports*, so it cannot reach the component's
exports by itself. The application introduces them once, after instantiating:

```js
import * as httpHost from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host/node";

const instance = await instantiate(undefined, imports);
httpHost.setCallbacks(instance["jco:node/http-callbacks@0.1.0"]);
```

And the exports that suspend on an asynchronous import have to be named when transpiling:

```console
jco transpile app.wasm -o out --async-mode jspi \
    --async-exports start --async-exports 'jco:node/http-callbacks@0.1.0#handle-request' \
    --map 'jco:node/http@0.1.0=...'
```

> [!NOTE]
> Name them rather than passing `--async-exports '*'`. The wildcard marks an export's
> binding asynchronous without wrapping the export in `WebAssembly.promising`, so the first
> call that suspends fails with `SuspendError`.

A component serving over `wasi-sockets` is not portable to a stock WASI host.
ComponentizeJS's guest bindings do not emit a class for an imported resource that has no
methods, while still referencing one when lifting a returned handle -- and
`wasi:sockets/network`'s `network` is the only resource in WASI shaped that way, so any guest
calling `instance-network()` fails with `import_network_0_2_12$Network is not defined`. It
reproduces in twelve lines of WIT, a `resource token;` returned from a function, and affects
ComponentizeJS 0.19.3 through 0.22.0. Preview 2's `wasi:sockets` implementation is complete
and is not involved.

Jco works around it by declaring one unused method on `network` in the WIT it injects. That
method is part of the component's imported interface, so the component declares a
`wasi:sockets/network` that is not the standard one and a host implementing only the standard
interface will refuse to link it. It runs against Jco's transpiled JavaScript host. The
workaround is commented where it lives, in
`packages/jco/lib/wit/builtin/0.2.12/wasi-sockets/package.wit`, and should be removed once
ComponentizeJS emits the class on its own.

### Express

Express is the widest test of this compatibility layer: nothing about it is written for
components, it is CommonJS throughout, and between `express`, `body-parser`, `send`,
`router`, `depd` and `iconv-lite` its dependency graph reaches most of what is listed above.
An ordinary Express program componentizes with no adapter and no WIT of its own:

```console
jco componentize app.js --bundle --wit wit -o app.wasm
```

Everything it needs -- `node:http`'s transport, `node:fs`, `wasi:cli/environment` for
`node:path` -- is discovered while bundling and added to the world, with a warning naming
what was added so it can be reviewed and committed.

Two limits are worth knowing before writing one:

- **Build the application inside a function, not at module scope.** `express()` resolves its
  default views directory with `path.resolve()`, and Jco's `node:path` reads the working
  directory from `wasi:cli/environment`. A component's module scope runs during
  pre-initialization, where reaching a WASI import fails the build outright, so
  `const app = express()` at the top level of a module cannot work. Building the application
  on first use is the only change an ordinary Express program needs.
- **`res.sendFile()`, `res.render()` and `express.static()` need a filesystem.** They work
  only in a world that imports `jco:node/fs` with a host wired up; the deny-by-default
  provider satisfies the import for an application that never calls them.
- **`app.listen()` behaves differently per implementation.** On `direct` it returns and the
  export finishes; on `wasi-sockets` the export serves until the server closes. See
  [Serving requests](#serving-requests).

### Buffer

The Buffer core comes from `unenv`'s wrapper around the MIT-licensed Feross
[`buffer`][feross-buffer] implementation. Jco adds the Node-facing module shape,
one shared `globalThis.Buffer`, and policy for exports that cannot be faithfully
provided in the guest.

Supported behavior includes common text and binary encodings, allocation and
filling, concatenation, comparison, integer and floating-point IO, searching,
slicing, copying, swapping, and JSON conversion. `atob()` and `btoa()` use runtime
globals when available and portable Buffer fallbacks otherwise.

#### Behavioral limits

There are intentional limits:

- `Buffer()` and `new Buffer()` are deprecated in Node and throw
  `ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`; use `Buffer.from()`,
  `Buffer.alloc()`, or `Buffer.allocUnsafe()` instead.
- `SlowBuffer` is deprecated and throws the same error.
- `isAscii`, `isUtf8`, `resolveObjectURL`, and `transcode` currently throw
  `ERR_JCO_UNSUPPORTED_NODE_API`.
- `Blob` and `File` use engine globals when those globals exist; otherwise their
  fallback constructors throw an unsupported-API error.
- The current portable core does not support the `base64url` encoding.

### Querystring

`unenv`'s querystring implementation is adapted from Node's MIT-licensed
implementation and is a strong fit for a component: it is deterministic, mostly
algorithmic, and needs no operating-system capability. Jco exposes its default
namespace and the named `decode`, `encode`, `escape`, `parse`, `stringify`,
`unescape`, and `unescapeBuffer` exports with Node-compatible alias identities.

The adapter initializes the same Buffer core as `node:buffer`. That matters for
malformed-percent fallback and `unescapeBuffer`, which use Buffer internally.

## How Jco evaluates unenv modules

### Different compatibility goals

`unenv` provides a valuable cross-runtime foundation used by browsers, edge
workers, server frameworks, and other non-Node environments. Its scope is broader
than Jco's: for many consumers, preserving an import and providing a conservative
fallback or no-op is preferable to making a bundle impossible.

A WebAssembly component has a different contract: Jco must know whether an API is
algorithmic, backed by a declared WASI capability, dependent on missing Node
internals, or intentionally mocked.

Consequently, an unenv compatibility marker or alias is a starting point for
review rather than an automatic promise of full Node behavior.

### Audit criteria

For each candidate, Jco checks:

- Node 24 export names, aliases, descriptors, types, and deprecations;
- transitive imports and assumptions about `process`, globals, the event loop, or
  the host platform;
- placeholders, mocks, no-ops, and `notImplemented` paths;
- differential behavior against Node 24; and
- execution through an actual guest component, not only source inspection or
  generated-bundle string checks.

### Upstream improvements

General correctness improvements should be contributed upstream when practical.
Until an improvement is in the pinned unenv release and passes Jco's guest tests,
Jco keeps a stronger local implementation or leaves the module disabled.

## Reviewed modules that are not enabled

The pinned unenv release currently supplies 55 public `node:` aliases. Jco exposes
a reviewed subset through Jco implementations and audited unenv cores. `node:ffi`
is not among them at all -- it is a Node 26 module, newer than the release unenv
targets. The other aliases were reviewed but are not automatically resolved.

The following grouping describes the main blocker, not a permanent judgment about
the module or upstream project.

### More semantic or dependency work needed

| Modules                                   | Why they are not enabled yet                                                                                                                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node:readline`, `node:readline/promises` | Interactive terminal behavior needs real guest streams and input handling; current fallbacks cannot reproduce it.                                                                                                           |
| `node:timers/promises`                    | A component-aware timer/event-loop integration is needed for delays, cancellation, and abort signals.                                                                                                                       |
| `node:trace_events`, `node:tty`           | The fallbacks preserve useful shapes, but tracing and terminal detection are synthetic or no-op without runtime integration.                                                                                                |
| `node:url`                                | There is substantial Node-derived code, but its eager `node:path` dependency adds a WASI environment requirement even for global-only URL use, and its namespace combines modern and legacy APIs that need separate policy. |

### Host-backed or broad subsystems

These modules contain useful portable pieces, but their complete public surfaces
also require operating-system access, Node internals, an event loop, or a larger
set of coordinated shims:

`node:crypto`, `node:dgram`, `node:http2`, `node:https`, `node:net`,
`node:perf_hooks`, `node:process`, `node:repl`, `node:sqlite`, `node:stream`,
`node:stream/promises`, `node:stream/web`, `node:timers`,
`node:tls`, `node:util`, `node:util/types`, `node:v8`, `node:vm`, `node:wasi`,
`node:worker_threads`, and `node:zlib`.

#### Future composition

This group is not all-or-nothing. A future implementation can combine portable
upstream algorithms with explicit host capabilities, just as Jco's path
implementation combines portable path logic with a WASI environment provider.

### Legacy or deprecated modules

`node:constants`, `node:punycode`, and `node:sys` are legacy or deprecated
surfaces. Jco does not enable their functional fallbacks by default. When a
deprecated API is added for import compatibility, Jco's policy is to expose an
immediate, explicit unsupported stub rather than execute the deprecated API.

`node:domain` is the worked example of that policy: it resolves, matches Node's
module shape, and throws from every entry point. See the domain section above.

## What happens for an unsupported import

An unsupported `node:` import is left unresolved during bundling. This makes the
missing compatibility visible instead of silently substituting a mock.

An explicit unsupported function inside an admitted module can be imported,
but calling that particular function throws a stable Jco error.

### Expanding support

This distinction lets applications use well-supported portions of modules such as
Buffer while keeping unavailable behavior easy to diagnose.

Jco has a clear path to expand support: add or connect a faithful implementation, test it
against Node and inside both JavaScript component backends, then add the specifier
to the audited allowlist.

[componentize-js]: https://github.com/bytecodealliance/ComponentizeJS
[feross-buffer]: https://github.com/feross/buffer
[unenv]: https://github.com/unjs/unenv
