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

The current compatibility target is Node.js 24.19.0. The unenv-backed modules are
audited against `unenv@2.0.0-rc.24`; upgrading unenv requires rerunning the
compatibility suites.

These entry points are namespaced by two independent versions: the WASI version they adapt
Node to, and the Node major they implement. The modules below live under
`wasi/0.2.x/node/24.x.x`, where `0.2.x` means the latest WASI p2 release and `24.x.x` means any
Node 24. Both axes move on their own -- Node's builtin semantics change across majors, and the
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

| Imports                                           | Implementation                                                                                       | Notes                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node:assert`, `node:assert/strict`               | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/assert`                                            | Adapted from the MIT-licensed Node.js 24 implementation. Requires no WIT capability.                                                                |
| `node:path`, `node:path/posix`, `node:path/win32` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/path`                                              | Jco's portable path implementation, connected to `wasi:cli/environment` for the guest working directory and environment.                            |
| `node:domain`                                     | _(refused)_                                                                                          | Deprecated upstream in its entirety. Resolves so the failure explains itself; every use throws `ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`.           |
| `node:async_hooks`                                | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/async-hooks`                                       | Synchronous scopes only. Requires no WIT capability. Asynchronous use is refused rather than silently losing the store -- see below.                |
| `node:diagnostics_channel`                        | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/diagnostics-channel`                               | Channels and tracing channels. Requires no WIT capability. Bound stores are scoped synchronously.                                                   |
| `node:child_process`                              | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process`                                     | Synchronous APIs over an explicit application-provided host capability; denied by default.                                                          |
| `node:cluster`                                    | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/cluster`                                           | Primary/worker control over an explicit host capability. Partly unsupported -- see below.                                                           |
| `node:console`                                    | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console`                                           | Guest console over an explicit application-provided host capability; denied by default, so every call throws until the application maps a provider. |
| `node:buffer`                                     | unenv's portable Buffer core with a Jco public adapter                                               | Covers the commonly used modern Buffer operations. Jco controls deprecated and runtime-dependent exports.                                           |
| `node:events`                                     | unenv's EventEmitter with a Jco layer from `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/events` | Covers the complete Node 24 module surface, including the `on()` async iterator and `EventEmitterAsyncResource`. Requires no WIT capability.        |
| `node:querystring`                                | unenv's Node-derived querystring implementation                                                      | Covers the complete Node 24 module surface and shares the audited Buffer core used by `node:buffer`.                                                |

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

| Entry point | unenv | Jco |
| --- | --- | --- |
| `events.listenerCount(emitter, eventName)` | throws `[unenv] node:events.listenerCount is not implemented yet!` | delegates to the emitter's own `listenerCount`, as Node does, so a subclass that overrides it is honored |
| `events.setMaxListeners(n[, ...targets])` | throws `[unenv] node:events.setMaxListeners is not implemented yet!` | sets the limit on `EventEmitter`s and `EventTarget`s, or the process-wide default when given no targets |
| `events.getMaxListeners(target)` | throws for an `EventTarget`; only handles emitters | reads either, falling back to the current default |

Argument validation matches Node's, `ERR_INVALID_ARG_TYPE` and `ERR_OUT_OF_RANGE` messages
included.

Node's module object *is* the `EventEmitter` class, so `events === events.EventEmitter` holds here
too: the adapter keeps the class as the default export, and installs the three functions above as
statics on it so both access paths reach the working versions.

Note for anyone reading jco-std: it carries a separate, deliberately minimal `EventEmitter` of its
own for shims such as `node:cluster`. jco-std does not depend on unenv, and shim code importing a
`node:*` builtin would rely on a bundler rewriting it, which is not true of every way jco-std is
consumed. The two are independent by design.

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

The pinned unenv release currently supplies 55 public `node:` aliases. Jco resolves
eleven modules: eight implemented in jco-std (one of which, `node:domain`, is a
deliberate refusal), two layering a Jco implementation over an audited unenv core,
and one audited unenv module used as-is. The other aliases were reviewed but are
not automatically resolved.

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

`node:crypto`, `node:dgram`,
`node:dns`, `node:dns/promises`, `node:fs`, `node:fs/promises`, `node:http`,
`node:http2`, `node:https`, `node:inspector`, `node:inspector/promises`,
`node:module`, `node:net`, `node:os`, `node:perf_hooks`, `node:process`,
`node:repl`, `node:sqlite`, `node:stream`, `node:stream/consumers`,
`node:stream/promises`, `node:stream/web`, `node:string_decoder`, `node:timers`,
`node:tls`, `node:util`, `node:util/types`, `node:v8`, `node:vm`, `node:wasi`,
`node:worker_threads`, and `node:zlib`.

#### Future composition

This group is not all-or-nothing. For example, a future filesystem implementation
could combine portable upstream algorithms with explicit WASI filesystem
providers, just as Jco's path implementation combines portable path logic with a
WASI environment provider.

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
