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

Only `node:` specifiers participate in this mechanism. Legacy bare specifiers such
as `buffer`, `path`, and `querystring` are not rewritten.

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

| Imports                                           | Implementation                                                                                       | Notes                                                                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node:assert`, `node:assert/strict`               | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/assert`                                            | Adapted from the MIT-licensed Node.js 24 implementation. Requires no WIT capability.                                                                                               |
| `node:path`, `node:path/posix`, `node:path/win32` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/path`                                              | Jco's portable path implementation, connected to `wasi:cli/environment` for the guest working directory and environment.                                                           |
| `node:perf_hooks`                                 | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/perf-hooks`                                        | Portable timing and observers; native telemetry throws. Runtime requirements are described below.                                                                                  |
| `node:readline`, `node:readline/promises` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/readline` and `/readline/promises` | Node 24.20 line parsing, questions, terminal editing and cursor actions over supplied streams. No WIT capability. |
| `node:string_decoder`                             | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/string-decoder`                                    | Guest-local streaming decoder for Node 24. Requires no WIT capability.                                                                                                             |
| `node:domain`                                     | _(refused)_                                                                                          | Deprecated upstream in its entirety. Resolves so the failure explains itself; every use throws `ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`.                                          |
| `node:ffi`                                        | `@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi`                                               | **Node 26 only.** Native calls and host memory over an explicit host capability; denied by default. Callbacks and guest-buffer addresses are refused -- see below.                 |
| `node:module`                                     | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/module`                                            | Classification, source maps and `require.resolve` are exact. Everything that **loads** throws `ERR_JCO_UNSUPPORTED_NODE_API` -- see below. Requires no WIT capability.             |
| `node:async_hooks`                                | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/async-hooks`                                       | Synchronous scopes only. Requires no WIT capability. Asynchronous use is refused rather than silently losing the store -- see below.                                               |
| `node:diagnostics_channel`                        | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/diagnostics-channel`                               | Channels and tracing channels. Requires no WIT capability. Bound stores are scoped synchronously.                                                                                  |
| `node:child_process`                              | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process`                                     | Synchronous APIs over an explicit application-provided host capability; denied by default.                                                                                         |
| `node:cluster`                                    | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/cluster`                                           | Primary/worker control over an explicit host capability. Partly unsupported -- see below.                                                                                          |
| `node:console`                                    | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console`                                           | Guest console over an explicit application-provided host capability; denied by default, so every call throws until the application maps a provider.                                |
| `node:dns`, `node:dns/promises`                   | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dns`                                               | Name resolution over an explicit host capability; denied by default.                                                                                                               |
| `node:fs`, `node:fs/promises`                     | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs`                                                | Synchronous, callback, and promise facades over an explicit filesystem capability; denied by default.                                                                              |
| `node:http`                                       | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http`                                              | Client and server APIs over a selectable direct, Preview 2 sockets, or Preview 2 WASI HTTP implementation -- see below. Servers need `direct` or `wasi-sockets`.                   |
| `node:https`                                      | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/https`                                             | The `node:http` core with the `https:` profile and a TLS-aware `Agent`; same implementation selection. TLS uses the `direct` host or an explicit `wasi:tls` provider -- see below. |
| `node:net`                                        | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/net/core`                                          | TCP clients, servers, and address utilities over Preview 2 `wasi:sockets`; native handles and IPC are unsupported -- see below.                                        |
| `node:inspector`, `node:inspector/promises`       | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/inspector`                                         | Session, console, and broadcast surface over an explicit host capability; denied by default. The host calls back through a guest-exported interface -- see below.                  |
| `node:process`                                    | Jco typed facade and explicit Node passthrough                                                       | Host process state and operations over `jco:node/process@0.1.0`; lazy default properties, named functions and objects. See Process restrictions below.                             |
| `node:sqlite` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/sqlite` | SQLite over an explicit typed host capability; denied by default. Synchronous SQL callbacks are unsupported -- see below. |
| `node:os`                                         | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/os`                                                | Machine and user information over an explicit host capability; denied by default. Static POSIX constants resolve without a provider -- see below.                                  |
| `node:buffer`                                     | unenv's portable Buffer core with a Jco public adapter                                               | Covers the commonly used modern Buffer operations. Jco controls deprecated and runtime-dependent exports.                                                                          |
| `node:events`                                     | unenv's EventEmitter with a Jco layer from `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/events` | Covers the complete Node 24 module surface, including the `on()` async iterator and `EventEmitterAsyncResource`. Requires no WIT capability.                                       |
| `node:querystring`                                | unenv's Node-derived querystring implementation                                                      | Covers the complete Node 24 module surface and shares the audited Buffer core used by `node:buffer`.                                                                               |
| `node:stream`, `node:stream/promises` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/stream` and `/stream/promises` | Classic streams, pipelines, operators, disposal, and Web adapters. No WIT capability. |
| `node:stream/consumers`                           | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/stream/consumers`                                  | Portable Node 24 collection helpers over async iterables and engine globals. Requires no WIT capability.                                                                           |
| `node:stream/iter`                                | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/stream/iter`                                       | Experimental Node 24.20 iterable streams. Requires no WIT capability. Classic output adapters are explicitly unsupported.                                                          |

### Classic streams

`node:stream` and `node:stream/promises` provide `Readable`, `Writable`, `Duplex`,
`Transform`, `PassThrough`, callback/promise pipelines, `finished`, readable
operators, cancellation, async disposal, and `duplexPair`. The implementation
reuses [readable-stream 4.7.0](https://github.com/nodejs/readable-stream/tree/v4.7.0),
with typed adaptations targeting Node 24.20, including Web Stream conversions
and support for all typed-array views. Buffer and EventEmitter identities are
shared with the corresponding `node:` imports. Scheduling uses guest microtasks;
no process, filesystem, network, or other host capability is required.

```js
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

await pipeline(
    Readable.from(['hello']),
    new Transform({ transform(chunk, encoding, done) { done(null, chunk.toString().toUpperCase()); } }),
    new Writable({ write(chunk, encoding, done) { /* consume chunk */ done(); } }),
);
```

For Web Streams, use `Readable.fromWeb()`, `Writable.fromWeb()`, or
`Duplex.fromWeb()` before calling `finished`, `addAbortSignal`, or the
readable/writable/error/disturbance inspection helpers. Those helpers need private
engine state when used on Web Streams directly and throw
`ERR_JCO_UNSUPPORTED_NODE_API`. Classic streams and public Web reader/writer
conversions are supported. The deprecated `Duplex.toWeb({ type })` alias throws;
use `readableType` instead.

> [!NOTE]
> Classic streams are tested on QuickJS and StarlingMonkey. The current QuickJS
> backend lacks Web Stream, text-codec, and Abort globals, so Web conversions and
> operations requiring those globals need an engine that supplies them.

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
classic streams. The experimental `toReadable()`, `toReadableSync()`, and
`toWritable()` adapters are not yet connected to the classic implementation.
They throw `ERR_JCO_UNSUPPORTED_NODE_API` without inspecting their arguments;
use the classic constructors directly.

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

The component engine supplies the portable Web globals shared with Node. With
ComponentizeJS 0.22.0's pinned StarlingMonkey runtime, this includes:

- `AbortController`, `AbortSignal`, `atob`, `btoa`, `Blob`, and `File`;
- `ByteLengthQueuingStrategy`, `CountQueuingStrategy`, `ReadableStream` and its
  exposed reader/controller classes, `WritableStream`, `TransformStream`,
  `CompressionStream`, and `DecompressionStream`;
- `console`, `Crypto`, `CryptoKey`, `SubtleCrypto`, `crypto`, `CustomEvent`,
  `DOMException`, `Event`, and `EventTarget`;
- `fetch`, `FormData`, `Headers`, `Request`, and `Response`;
- `Performance`, `performance`, `queueMicrotask`, timeout/interval functions,
  `structuredClone`, `TextEncoder`, `TextDecoder`, `URL`, and `URLSearchParams`.

When bundled source references `AbortController` or `AbortSignal`, Jco loads a
compatibility adapter for the legacy StarlingMonkey abort implementation. It
preserves the native constructors and signal objects while correcting `any()`'s
array handling, default reason identity, and `throwIfAborted()`. The adapter
detects the legacy calling convention and leaves conforming engines untouched.

The current embedded runtime does **not** expose a guest `WebAssembly` API.
Running the component in a Wasm host does not give its JavaScript code the ability
to compile or instantiate another Wasm module. Guest-side Wasm execution may be
supported in the future; the globals test currently asserts that this API is
absent and should gain execution coverage when the engine provides it.

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
import { Buffer } from 'node:buffer';
import { StringDecoder } from 'node:string_decoder';

const decoder = new StringDecoder('utf8');

export function decode() {
    return decoder.write(Buffer.from([0xf0, 0x9f])) + decoder.end(Buffer.from([0x8c, 0x8d]));
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

### Readline

`node:readline` and `node:readline/promises` support callback and promise questions,
line events, async iteration, streaming UTF-8/CRLF decoding, prompts, terminal
editing and history, keypress events, and cursor actions. Both share a port of
[Node v24.20.0's readline implementation](https://github.com/nodejs/node/tree/v24.20.0/lib/internal/readline).
The pinned unenv readline modules contain no-op implementations and are not used.

Applications keep ordinary Node imports and supply readable and writable streams:

```js
import * as readline from 'node:readline/promises';

export async function ask(input, output) {
    const rl = readline.createInterface({ input, output });
    try {
        const answer = await rl.question('What do you think of Node.js? ');
        output.write(`Thank you for your valuable feedback: ${answer}\n`);
    } finally {
        rl.close();
    }
}
```

Bundle application code with `jco componentize app.js --bundle --wit wit -o app.wasm`.
Readline itself requires no WIT imports. The streams determine where input and
output go. `node:process` is not yet supported, so the documentation's
literal `process.stdin`/`process.stdout` imports cannot yet be componentized.
The test fixture runs that literal example against the shim on Node, and runs the
same question/answer flow with supplied streams in QuickJS and StarlingMonkey.

#### Terminal and scheduling boundaries

Terminal streams may supply `setRawMode`, `columns`, and resize events. Terminal
mode emits ANSI sequences without inspecting a host `TERM` variable. Ctrl+Z can
be handled with a `SIGTSTP` listener; otherwise it throws
`ERR_JCO_UNSUPPORTED_NODE_API`, since a component cannot suspend its host process.
Host job-control `SIGCONT` events are unavailable.

Cursor widths use Node's non-ICU tables, with normalization where the engine
provides it; some Unicode widths differ from ICU-enabled Node. Deferred callbacks
and automatic cursor commits use microtasks rather than Node's separate next-tick
queue. Completion-error text uses portable string formatting.

Timed Escape-key disambiguation requires engine timers; engines without timers
throw an explicit `ERR_JCO_UNSUPPORTED_NODE_API` for that operation. Cancellation
accepts supplied AbortSignals; readline does not install missing Abort globals.
QuickJS async entry functions must be declared `async func` in WIT.

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

### SQLite databases

Application code keeps ordinary `node:sqlite` imports:

```js
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
try {
  db.exec('CREATE TABLE items(id INTEGER PRIMARY KEY, name TEXT)');
  db.prepare('INSERT INTO items(name) VALUES (?)').run('example');
  const rows = db.prepare('SELECT * FROM items').all();
} finally {
  db.close();
}
```

When bundling this module, Jco adds `jco:node/sqlite@0.1.0` to the selected WIT
world. WASI supplies no database API. This interface models databases, prepared
statements, lazy cursors, sessions, and SQL tag stores as resources; SQL values,
column metadata, and errors use typed records and variants. Providers can use
other SQLite implementations without depending on Node objects in the guest.

The default provider denies database creation, including `:memory:`, with
`ERR_JCO_SQLITE_ADAPTER_REQUIRED`. Importing the module and reading constants need
no database authority. Explicitly select the Node passthrough to execute SQL:

```console
jco transpile component.wasm \
  --map 'jco:node/sqlite@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/sqlite/host/node'
```

Database, backup, attached-database, and extension paths refer to the **host
filesystem**, independently of the guest's WASI preopens. The passthrough grants
Node's SQLite authority; use a restricted custom provider when narrower access
is required. Extension loading still requires the database's `allowExtension`
option and Node's native checks.

The compatibility target is Node **24.20.0**, rather than the rolling Node API
page. Supported operations include database open/close and transactions,
prepared statement `all`/`get`/`run`/`iterate`, named and positional parameters,
blobs, signed 64-bit bigints, array rows, column metadata, SQL tag stores,
sessions and plain changeset application, serialization/deserialization, limits,
defensive mode, extension loading, and promise-based `backup`. Statements and
sessions retain their owning database; early iterator return releases the active
cursor. SQL execution and SQLite error fields come from the real host engine.

`DatabaseSync.function`, `aggregate`, and `setAuthorizer`, changeset callback
options, and backup's progress callback throw `ERR_JCO_SQLITE_CALLBACK_UNSUPPORTED`.
Synchronous callbacks would need to re-enter the guest while its SQL import is
active, which this component interface cannot support. These APIs are present
as explicit stubs; no callback is invoked. APIs added after the pinned release
are outside this compatibility target.

Mapping a custom SQLite provider enables JSPI for the `backup` import and makes
component exports promising; await calls into the transpiled component. The
synchronous database tests run on both StarlingMonkey and QuickJS. Backup is
also tested end to end on StarlingMonkey; QuickJS currently cannot lower a
Promise returned by an exported guest function. Use StarlingMonkey for that
asynchronous guest flow.

The implementation is available directly at
`@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/sqlite`, with an injectable factory
at `sqlite/core`, but Jco's ordinary `node:` import handling is the recommended
application entry point. It can be mixed with other supported Node builtins.

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
import { DynamicLibrary, exportString, getInt32, setInt32, toString } from 'node:ffi';

// null resolves symbols from the host process image, which links libc.
const lib = new DynamicLibrary(null);
const malloc = lib.getFunction('malloc', { arguments: ['uint64'], return: 'pointer' });
const strlen = lib.getFunction('strlen', { arguments: ['pointer'], return: 'uint64' });

const pointer = malloc(64n);
setInt32(pointer, 0, 123456);
getInt32(pointer, 0); // 123456, read back out of host memory
exportString('hello ffi', pointer, 64);
strlen(pointer); // 9n -- native code reading what the guest wrote
toString(pointer); // "hello ffi"
```

Pointers cross as `bigint`, matching NodeJS.

Errors keep NodeJS's own codes, so `ERR_FFI_LIBRARY_CLOSED` and friends behave as they would on Node.

#### `node:ffi` incompatibilities

These are refused guest-side, before the host is reached, because a WebAssembly component
cannot express them:

| Surface                                                                          | Why                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
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
import { setSuffix } from '@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi/host/node';

setSuffix('dylib'); // before instantiating the component
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
import { Session } from 'node:inspector/promises';

const session = new Session();
session.connect();
const { result } = await session.post('Runtime.evaluate', { expression: '6 * 7' });
result.value; // 42, evaluated in the host isolate
```

Argument validation, session state, the `EventEmitter` surface, and error reconstruction all run
guest-side, so `ERR_INSPECTOR_NOT_CONNECTED`, `ERR_INSPECTOR_ALREADY_CONNECTED`,
`ERR_INVALID_ARG_TYPE`, and the protocol's `ERR_INSPECTOR_COMMAND` all match Node exactly. CDP
payloads cross the boundary as JSON; the inspector `console` forwards its arguments as JSON too,
which is best-effort for functions, symbols, and cycles.

#### The host calls back into the component

The inspector's two callbacks -- a `post` response and a session notification -- run the other way,
from host to guest. A component cannot implement a resource declared on an _imported_ interface (its
methods would run host-side), so the callbacks are a guest-**exported** interface,
`jco:node/inspector-callbacks@0.1.0`, holding one resource per callback kind: a one-shot
`post-callback` and a long-lived `notification-listener`. When bundled source imports
`node:inspector`, Jco adds both the `import jco:node/inspector@0.1.0;` and the matching
`export jco:node/inspector-callbacks@0.1.0;` to the selected world, and bundles the JS export
alongside the entry -- neither is written by hand.

The embedder wires the exported interface to the host adapter after instantiation:

```js
import * as inspectorHost from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/inspector/host/node';
import * as component from './transpiled/component.js';

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

| Surface                                                                                                                  | Behavior                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `builtinModules`, `isBuiltin`                                                                                            | Node 24's list, verbatim. `isBuiltin` agrees with Node on every builtin in every spelling, including prefix-only ones -- `isBuiltin("node:test")` is true and `isBuiltin("test")` is false |
| `SourceMap`                                                                                                              | Implemented in full: VLQ decoding, `findEntry`, `findOrigin`, `payload`, `lineLengths`                                                                                                     |
| `wrap`, `wrapper`                                                                                                        | Deprecated upstream but pure string work, so they behave as Node's do, including `wrap` reading a mutated `wrapper` live                                                                   |
| `constants`, `findSourceMap`, `getSourceMapsSupport`, `getCompileCacheDir`, `flushCompileCache`, `syncBuiltinESMExports` | Exact, down to Node's null-prototype return objects                                                                                                                                        |
| `globalPaths`                                                                                                            | `[]` -- a true statement, not a refusal: there is no `$HOME/.node_modules` to search                                                                                                       |
| `enableCompileCache`                                                                                                     | Reports `{ status: FAILED, message }`. Node's own protocol for "could not", so callers that branch on `status` keep working instead of catching                                            |
| `new Module(id)`                                                                                                         | Constructs, with Node's own-property shape. Its _methods_ are what need a loader                                                                                                           |

#### `createRequire`

`createRequire()` **succeeds**. Code routinely writes `const require = createRequire(import.meta.url)`
at module top level and only calls it on some paths; refusing at creation would break modules that
require nothing.

Calling the returned `require()` refuses and points at static `import`. But `require.resolve` is not
a refusal -- it answers truthfully:

```js
const require = createRequire(import.meta.url);
require.resolve('node:path'); // "node:path", exactly as Node answers
require.resolve('lodash'); // throws MODULE_NOT_FOUND -- which is the truth here
require.cache; // genuinely empty
require.main; // genuinely undefined
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

### TCP sockets

`node:net` implements Node 24.19's 18-export module surface over Preview 2
`wasi:sockets`. It includes TCP `Socket` and `Server`, `BoundSocket`,
`SocketAddress`, `BlockList`, IP-family predicates, overload normalization, and
the auto-family defaults. `connect` and `createConnection` are the same function,
and `Socket` and `Stream` are the same constructor, as in Node.

```js
import { connect, createServer } from 'node:net';

createServer((socket) => socket.end('hello')).listen(8080, '127.0.0.1');

connect(8080, '127.0.0.1').setEncoding('utf8').on('data', console.log);
```

Jco injects only the selected world's Preview 2 DNS, TCP, stream, and pollable
interfaces and their standard WIT packages. QuickJS worlds use 0.2.12;
StarlingMonkey worlds can use 0.2.10. There is no Jco-specific network host
interface and no bare `net` alias.

Preview 2 has no Unix-domain sockets, Windows named pipes, OS file descriptors,
libuv handles, TCP reset, IP type-of-service, or custom JavaScript DNS callback.
Those operations throw `ERR_JCO_UNSUPPORTED_NODE_API`. Address attempts are
sequential rather than reproducing Node's exact Happy Eyeballs timing. Socket
objects provide the common readable/writable methods and events but do not yet
inherit from classic `node:stream.Duplex`, because Jco does not have a faithful
classic stream core.

Reads support Node string encodings, buffered `read()`, and async iteration.
Writable operations complete through blocking WASI writes and do not yet provide
classic stream backpressure. `setNoDelay()`, `ref()`, and `unref()` preserve the
callable surface but cannot control the host's TCP_NODELAY or event-loop references.
Nonzero socket timeouts require an engine with JavaScript timers; engines without
them reject `setTimeout()` explicitly. The deprecated `bufferSize` getter throws
the Jco deprecated-API error; use `writableLength` instead.

Half-close depends on the host honoring WASI's directional `shutdown`. The
Preview 2 Node host shim 0.22.0 currently closes both directions; applications
using that host should let the peer finish its response before closing the
socket's writable side.

### HTTP and selectable implementations

The `node:http` adapter implements both client and server NodeJS HTTP APIs,
with outbound `request()` and `get()` calls with Node-style `ClientRequest`
and buffered `IncomingMessage` objects along with `http.Server`. `node:https`
is the same core driven with the `https:` protocol, port 443, and a TLS-aware
`Agent`, exactly as `lib/https.js` reuses `_http_client` and `_http_server`
upstream; it shares the implementation selection below.

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

For direct servers, instantiate with a provider bound to that component's
callback dispatcher. For example, after transpiling with
`--instantiation async --map jco:node/http@0.1.0=http-host`:

```js
import { instantiate } from './component.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { createHttpHost } from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host/node';

let instance;
const imports = new WASIShim().getImportObject();
imports['http-host'] = createHttpHost(() => instance.httpCallbacks);
instance = await instantiate(undefined, imports);
// Await application exports that create or control servers.
await instance.start();
```

Create a separate provider for each component instance. The server holds a
callback registration ID; handlers stay in the guest and run through the
exported dispatcher. The provider serializes callback entry and drains accepted
callbacks before close completes. Closing releases the guest registration;
listening again registers the same server's handler again. Direct client-only
applications can continue mapping the Node provider module without this factory.

> [!WARNING]
> All modes currently buffer complete request and response bodies.

Connection pooling, upgrades, and CONNECT proxy tunnels are explicit gaps.
Unavailable operations throw `ERR_JCO_UNSUPPORTED_NODE_API` rather than silently
doing nothing.

#### HTTPS

`node:https` exposes Node 24's six exports: `Agent`, `globalAgent`, `Server`,
`createServer`, `get`, and `request`. `https.Agent` subclasses `http.Agent` on
both prototype chains, keeps Node's `defaultPort`/`protocol`/`maxCachedSessions`
defaults and its TLS session cache, and produces the same 23-field `getName()`
key as Node, so option bags pool the way they would natively. Requests reject
non-`https:` protocols with `ERR_INVALID_PROTOCOL` and elide `:443` from the
authority, and `https.get()` ends the request itself.

TLS crosses the component boundary as a typed `tls-options` record on the
`jco:node/http@0.1.0` request and server options. It carries the serializable
subset of Node's `tls.connect` / `tls.createServer` options: `key`, `cert`,
`pfx`, `passphrase`, `ca`, `crl`, `dhparam`, `ciphers`, `ecdhCurve`, `sigalgs`,
`minVersion`, `maxVersion`, `secureProtocol`, `secureOptions`,
`sessionIdContext`, `honorCipherOrder`, `ALPNProtocols`, `servername`,
`rejectUnauthorized`, and `requestCert`. Material fields stay lists, so a
`key: [rsa, ecdsa]` bundle reaches the host intact. Options with no typed
representation -- `checkServerIdentity`, `SNICallback`, `ALPNCallback`,
`pskCallback`, `secureContext`, `session`, `ticketKeys`, and the OpenSSL engine
options -- throw `ERR_JCO_UNSUPPORTED_NODE_API` naming the option rather than
being dropped.

| Value          | `node:https` behaviour                                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `direct`       | Clients and servers. The opt-in Node provider routes `https` requests to `node:https.request` with the carried TLS options, and a server carrying a `tls` record to `node:https.createServer`, so the host's own TLS stack terminates the connection. |
| `wasi-sockets` | Verified clients over the existing TCP streams. TLS connections implicitly require `wasi:tls`, imported automatically for `node:https`. HTTPS servers are unsupported by the pinned client-only draft.                                                |
| `wasi-http`    | Clients only, with the `HTTPS` scheme. `wasi:http/outgoing-handler` owns certificate validation, so any per-request TLS option is refused; servers are rejected as for `node:http`.                                                                   |

TLS support is part of the `wasi-sockets` implementation, which uses the
`wasi:tls` host capability for TLS connections. Explicitly grant it when transpiling:

```sh
jco transpile component.wasm -o out \
  --map 'wasi:tls/types@0.2.0-draft=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/host/node'
```

Sockets and TLS share `wasi:io@0.2.12` stream resources directly. Without this
opt-in, HTTPS fails before connecting, with no plaintext fallback. Plain HTTP
needs no TLS capability.
The Node provider uses `node:tls` over the supplied TCP streams, system trust,
hostname verification, and HTTP/1.1 ALPN. Hosts needing private trust can map the
TLS interface to a module exporting:

```js
import { createTlsProvider } from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/host/node';
export const { ClientHandshake, ClientConnection, FutureClientStreams, isAvailable } = createTlsProvider({
    ca: [trustedCaPem],
    handshakeTimeoutMs: 10_000,
});
```

Based on upstream [`WebAssembly/wasi-tls` at `6781ae26084100c0628ef72cc44e4517c6c48ae5`](https://github.com/WebAssembly/wasi-tls/tree/6781ae26084100c0628ef72cc44e4517c6c48ae5/wit),
Jco's [local contract](https://github.com/bytecodealliance/jco/tree/main/packages/jco/lib/wit/builtin/wasi-tls-0.2.0-draft)
retains `wasi:tls@0.2.0-draft` but uses `wasi:io@0.2.12`, adds `is-available`, and
omits unstable-feature annotations. It is a provisional interface for Node.js,
web, and other host implementations. It exposes client handshake,
future polling, streams, and output shutdown. It has no server handshake,
certificate configuration, or ALPN controls. Only guest `servername` and
`rejectUnauthorized: true` are supported; other TLS options, including `ca`, are
rejected. TLS support is independent of the componentization backend.

> [!NOTE]
> `componentize-qjs` 0.4.3 currently fails during snapshot initialization when linking
> the TLS interface's shared IO resources, even for an otherwise empty component.
> StarlingMonkey is a workaround for this build-time issue.

The temporarily skipped component tests in `https-wasi-tls.ts` include deterministic
local TLS tests and a separately named public test requiring DNS and TCP/443 to
`example.com` (20-second execution deadline).

An `https.Server` always carries its `tls` record, even when no material was
supplied, so an implementation without a TLS stack refuses it; the `direct`
host then behaves like Node, which constructs the server and fails each
handshake. Because `jco:node/http@0.1.0` gained the record in place, a project
whose `wit/deps/jco-node-0.1.0/http.wit` predates it must delete that file so
the next `jco componentize` reinstalls the current interface: injection never
overwrites an existing dependency file.

### HTTP/2

Client and server code uses Node's normal session and stream APIs:

```js
import { connect, createServer } from 'node:http2';

export function requestStatus(authority) {
    const session = connect(authority);
    const stream = session.request({ ':path': '/status' });
    stream.end();
    return session;
}

export const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end(`received ${request.url}`);
});
```

Select its implementation independently:

```console
jco componentize component.js --wit wit --bundle \
  --with-nodejs-http2-via direct -o component.wasm
```

| Value              | Behavior                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `direct` (default) | Typed `jco:node/http2@0.1.0`, denied by default; an opt-in Node host uses real h2c and TLS/ALPN clients and servers.                                         |
| `wasi-sockets`     | Cleartext prior-knowledge HTTP/2 (`h2c`) clients and TCP servers, with guest-side framing, HPACK, settings, ping, reset, and stream/connection flow control. |
| `wasi-http`        | Rejects sessions and servers: outgoing-handler cannot expose observable Node sessions, stream control, or arbitrary inbound listeners.                       |

By default, the provider rejects both `connect()` and server construction with
`ERR_JCO_HTTP2_ADAPTER_REQUIRED`.

`direct` mode models sessions, streams, and servers as typed host-owned WIT
resources, with a passthrough implementation to NodeJS underneath. The WIT
interface used is `jco:node/http2-callbacks@0.1.0`.

> [!NOTE]
> Under WASI p2, Bodies are currently buffered; low-level sockets, priority,
> push, flow-control windows, and operations that cannot cross the boundary
> throw explicit errors.

The `wasi:sockets` implementation also deliberately omits server push, HTTP/1.1 `Upgrade: h2c`,
Unix-domain sockets, and Node's arbitrary `createConnection`/custom duplex
transport hooks.

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

## Process

As WASI has no concept of processes, `node:process` uses a Jco facade
over `jco:node/process@0.1.0`, targeting Node.js v24.20.0. This opt-in Node provider
therefore describes and controls **the embedding Node process** (via an adapter): its environment,
working directory, PID, resource measurements, diagnostics and credentials.

If using the passthrough NodeJS adapter, `process.exit()` terminates that
host; `kill()` sends a real OS signal, and `execve()` replaces the host
program where Node supports it.

When writing components against this API, you can Use normal Node imports
inside a component entry function:

```js
import process, { cwd, cpuUsage, hrtime } from 'node:process';

export function inspect() {
    return JSON.stringify({
        pid: process.pid,
        platform: process.platform,
        cwd: cwd(),
        cpu: cpuUsage(),
        nanoseconds: String(hrtime.bigint()),
    });
}
```

Componentize that component with:

```console
jco componentize app.js --bundle -w wit -o app.wasm
```

Jco adds the typed `jco:node/process` WIT import, and `jco transpile` will map that
to a provider that denies all functionality by default; host-dependent calls
throw `ERR_JCO_PROCESS_ADAPTER_REQUIRED`.

If you want to use the pass-through provider, you must map it in explicitly:

```console
jco transpile app.wasm \
  -o out \
  --map 'jco:node/process@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host/node'
```

The public facade contains no native Node process objects in its WIT boundary.
A different runtime can implement the same typed functions.

Direct jco-std adapters and native Node imports can coexist in a host application.

### Supplying your own process provider

Embedders can construct an object satisfying the public `ProcessHost` type and
pass it directly to the generated `instantiate` function. Start from the denial
provider and override the operations your application supports. You do not need
to implement every operation or forward anything to Node's native process.

For example, this TypeScript provider records exit requests and fails the current
guest call without exiting the embedding process:

```ts
import base from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host';
// To forward unoverridden operations to Node, swap the import above for:
// import base from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host/node';
import type { ProcessHost } from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process';

export function createProcessHost() {
    const exitRequests: number[] = [];
    const host = {
        ...base,
        exit(code) {
            const status = Number(code?.val ?? 0);
            exitRequests.push(status);
            throw {
                name: 'Error',
                code: 'COMPONENT_EXIT',
                message: `Component requested exit ${status}`,
            };
        },
    } satisfies ProcessHost;
    return { host, exitRequests };
}
```

The active import denies unoverridden operations. Comment it out and uncomment
the Node provider import to change the base to host passthrough. The custom `exit`
above still overrides that base, but other operations, including `abort`, `kill`,
environment writes and `chdir`, then affect the embedding Node process.

Generate bindings for explicit instantiation; no custom mapping is needed:

```sh
jco transpile app.wasm -o out --instantiation async
```

Then pass your implementation object directly in the imports. Jco's default
mapping names the process import after the denial-provider package; that key does
not force you to use its implementation. The generated binding types list the
expected import keys:

```js
import { instantiate } from './out/app.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { createProcessHost } from './my-process-provider.js';

const { host, exitRequests } = createProcessHost();
const component = await instantiate(undefined, {
    ...new WASIShim().getImportObject(),
    '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host': host,
});
```

The provider implements the WIT operations underneath the Node facade:

- Functions are synchronous, even with `--instantiation async`. Arguments are
  WIT values: `exit(23)` receives `{ tag: 'number', val: 23 }`, a string code uses
  the `text` tag, and an omitted code is `undefined`.
- With JavaScript component bindings, return the successful value directly, or
  throw a `ProcessError` record with `name`, `message`, and optional `code`,
  `errno`, `syscall`, and `path`. The guest receives an Error. Do not return
  `{ tag: 'ok', val: ... }` or `{ tag: 'err', val: ... }` wrappers. Numeric WIT
  lists may require typed arrays: for example, `getgroups` returns `Uint32Array`.
- Implement related operations consistently: environment access uses
  `envEntries`, `envGet`, and `envSet`; `process.exitCode` uses `getState` and
  `setExitCode`. This minimal example supports explicit exit requests only.
  Reading metadata such as `pid` or `argv` requires `metadata`.
- Keep mutable state per component when isolation is desired. Construct a new
  provider for each instance, as in the example. The facade does not isolate
  state that your provider shares with other instances or the host.
- `exit`, `abort`, and `execve` must not return successfully. This example throws
  an ordinary guest-visible error, which guest code can catch. Enforcing component
  termination requires the embedder's own lifecycle policy. Native streams and
  engine hooks listed under Process restrictions remain unsupported regardless
  of the provider.

The `node-process-custom` fixture in `packages/jco/test/fixtures/componentize`
contains the runnable JavaScript equivalent, checked against `ProcessHost`.
Its component calls `process.exit(23)`. End-to-end tests bind separate provider
objects in QuickJS and StarlingMonkey, verify the exit requests reach the correct
object, and confirm the host stays alive and other operations remain denied.

### Process state and snapshots

Host imports are unavailable while the component engine initializes its snapshot.
Read runtime state inside exported guest functions. Metadata, argument arrays,
versions, configuration and features are obtained lazily at first access. Argument
arrays are guest-local snapshots; environment variables and mutable state such as
`title`, `debugPort`, `exitCode` and report settings remain live on the host.
`process.env` supports property access, assignment, deletion, enumeration and
ordinary writable data descriptors. Assign strings, numbers or booleans; deprecated
implicit conversions of other values throw before coercion.

Named imports support functions and lazy objects such as `env`, `argv`, `versions`,
`report` and `allowedNodeEnvironmentFlags`. Runtime primitive exports (`pid`,
`platform`, `arch`, `version`, `exitCode`, and similar properties) are deliberately
absent from the ESM facade: use `process.pid`, for example. ESM bindings cannot be
lazy getters, and supplying a build-machine PID or a placeholder would be incorrect.
Likewise, obtain the optional permission object through `process.permission`.
This implementation handles explicit `node:process` imports; it does not install a
new ambient `globalThis.process` object or intercept the bare `process` specifier.

### Process operations

The Node provider implements cwd/chdir, environment access and `loadEnvFile`, CPU,
thread CPU, memory and resource usage, monotonic `hrtime`, uptime and memory limits,
active resource names, identity and credential operations, `kill`, the setting
overload of `umask`, termination and `execve`, diagnostic reports, allowed Node
flags, permission queries and host source-map settings. Errors cross WIT with their
name, code, errno, syscall and path fields and become guest Error instances.
Diagnostic reports and resource measurements describe the host runtime, including
its JavaScript heap. They are not measurements of just one component.

Ordinary EventEmitter listeners and custom events stay in the guest and use Jco's
already-audited `node:events` implementation. `nextTick` uses the guest microtask
queue; it does not reproduce Node's separate next-tick phase or its ordering ahead
of promise reactions. `ref`/`unref` invoke the guest object's
`Symbol.for('nodejs.ref')`/`Symbol.for('nodejs.unref')` protocols, falling back to
ordinary `ref`/`unref` methods. Warnings are
forwarded to Node and scheduled for guest warning listeners. QuickJS currently
rejects Promise-returning exports for synchronous WIT functions; the async
`nextTick` component test runs on StarlingMonkey, while synchronous passthrough
and denial tests run on both engines.

### Process restrictions

Native stream objects (`stdin`, `stdout`, `stderr`), IPC channels and handle transfer,
module loading (`dlopen`, `getBuiltinModule`), exception-capture hooks and
finalization callbacks cannot cross this boundary. Their entry points throw
`ERR_JCO_UNSUPPORTED_NODE_API`. Registering automatic host events (signals,
`beforeExit`, `exit`, IPC, rejection/exception and worker events) throws the same
error; the adapter does not silently register listeners that will never run.
These restrictions also apply with the Node provider mapped.

Deprecated `binding`, `assert`, `mainModule`, `domain`, the no-argument `umask()`
overload, the `multipleResolves` event and deprecated feature flags throw
`ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API` before inspecting arguments or calling
providers. Legacy `hrtime()` and `nextTick()` remain functional; legacy status is
not deprecation. Platform-specific credential operations are available only when
the Node host supports them. Node 26 additions are outside the Node 24 contract.

### Process implementation sources

`unenv@2.0.0-rc.24`'s process module was inspected, including its environment,
hrtime, next-tick and TTY dependencies. Its placeholder PIDs, zero memory metrics,
local cwd and unimplemented host operations do not meet this contract. Jco uses
native Node operations behind WIT instead, with a small TypeScript facade.
Tuple clock subtraction and warning normalization follow Node's MIT-licensed
`internal/process/per_thread.js` and `internal/process/warning.js` at commit
`71b8b174857e25106d39b61a9e6f30d927da8b01`; the source retains attribution.

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
| `node:timers/promises`                    | A component-aware timer/event-loop integration is needed for delays, cancellation, and abort signals.                                                                                                                       |
| `node:trace_events`, `node:tty`           | The fallbacks preserve useful shapes, but tracing and terminal detection are synthetic or no-op without runtime integration.                                                                                                |
| `node:url`                                | There is substantial Node-derived code, but its eager `node:path` dependency adds a WASI environment requirement even for global-only URL use, and its namespace combines modern and legacy APIs that need separate policy. |

### Host-backed or broad subsystems

These modules contain useful portable pieces, but their complete public surfaces
also require operating-system access, Node internals, an event loop, or a larger
set of coordinated shims:

`node:crypto`, `node:dgram`, `node:http2`,
`node:perf_hooks`, `node:repl`, `node:stream`,
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

## Performance measurements

`node:perf_hooks` targets Node.js 24.20.0. Jco bundles a TypeScript adaptation of
Node's user timing, resource timing, observer and function timing implementations.
It does not use unenv's placeholder observers or histograms.

Keep ordinary imports in application code:

```js
import { performance, PerformanceObserver } from "node:perf_hooks";

const observer = new PerformanceObserver((entries) => {
  for (const entry of entries.getEntries()) console.log(entry.name, entry.duration);
});
observer.observe({ type: "measure" });
performance.mark("start");
// Application work.
performance.measure("elapsed", "start");
```

Bundle JavaScript with `jco componentize app.js --bundle --wit wit -o app.wasm`.
The adapter adds no WIT imports. Clock-based operations use the component engine's
monotonic `performance.now()` and `timeOrigin`; they fail explicitly if the engine
lacks them. Explicit timestamps require no clock. Non-null mark/measure detail
requires the engine's `structuredClone` implementation. The module owns its timing
buffers; it does not replace the engine's global `performance` object.

### Supported timing operations

Marks, measures (including named marks and start/end/duration options), timeline
queries and clearing, explicit resource timings, resource buffer notifications,
observers and `timerify` are implemented. Observers support `mark`, `measure`,
`resource` and `function` entries. Function timing includes promise settlement and
constructor calls. Observer and resource-buffer callbacks use component timers;
their ordering relative to other tasks can differ from Node's `setImmediate`.
Resource entries describe timings supplied by the application; network operations
are not automatically instrumented.

### Native performance telemetry

`createHistogram`, `monitorEventLoopDelay`, `eventLoopUtilization`,
`performance.nodeTiming` and `performance.toJSON()` throw
`ERR_JCO_UNSUPPORTED_NODE_API`. Components do not expose Node's HDR histogram
binding, libuv event-loop counters or process startup milestones. The `histogram`
option to `timerify` is consequently unavailable. GC, HTTP, HTTP/2, DNS and network
observer instrumentation is unavailable. Deprecated node-entry `kind` and `flags`
accessors throw `ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`, naming the `detail` replacement.

The public module exports and constants match the pinned Node 24 surface; APIs
introduced in Node 26's rolling documentation are outside this compatibility target.
The source files retain Node's MIT license and pinned source provenance.

QuickJS currently supplies a clock but lacks task timers and Web event targets.
Marks, measures, resource entries within the buffer limit, and synchronous function
timing work there. Observer subscription, event listeners and resource buffer
overflow fail explicitly; `PerformanceObserver.supportedEntryTypes` is empty.
StarlingMonkey supports these runtime facilities and the observer APIs.
