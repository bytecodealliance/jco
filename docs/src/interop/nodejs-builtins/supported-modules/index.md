# Supported modules

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

Each API page describes its implementation, host capabilities, examples, and
compatibility limits. Related submodules share their parent API page. See the
[compatibility overview](../../nodejs-builtins.md) for setup and bundling.

| API | Notes |
| --- | --- |
| [`node:assert`](./assert.md), [`node:assert/strict`](./assert.md) | Adapted from the MIT-licensed Node.js 24 implementation. Requires no WIT capability. |
| [`node:async_hooks`](./async-hooks.md) | Synchronous scopes only. Requires no WIT capability. Asynchronous use is refused rather than silently losing the store. |
| [`node:buffer`](./buffer.md) | Covers the commonly used modern Buffer operations. Jco controls deprecated and runtime-dependent exports. |
| [`node:child_process`](./child-process.md) | Synchronous APIs over an explicit application-provided host capability; denied by default. |
| [`node:cluster`](./cluster.md) | Primary/worker control over an explicit host capability. Partly unsupported. |
| [`node:console`](./console.md) | Guest console over an explicit application-provided host capability; denied by default, so every call throws until the application maps a provider. |
| [`node:dgram`](./dgram.md) | UDP sockets over an explicit host capability; denied by default. StarlingMonkey supports the Node passthrough. |
| [`node:diagnostics_channel`](./diagnostics-channel.md) | Channels and tracing channels. Requires no WIT capability. Bound stores are scoped synchronously. |
| [`node:dns`](./dns.md), [`node:dns/promises`](./dns.md) | Name resolution over an explicit host capability; denied by default. |
| [`node:domain`](./domain.md) | Deprecated upstream in its entirety. Resolves so the failure explains itself; every use throws `ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`. |
| [`node:events`](./events.md) | Covers the complete Node 24 module surface, including the `on()` async iterator and `EventEmitterAsyncResource`. Requires no WIT capability. |
| [`node:ffi`](./ffi.md) | **Node 26 only.** Native calls and host memory over an explicit host capability; denied by default. Callbacks and guest-buffer addresses are refused. |
| [`node:fs`](./fs.md), [`node:fs/promises`](./fs.md) | Synchronous, callback, and promise facades over an explicit filesystem capability; denied by default. |
| [`node:http`](./http.md) | Client and server APIs over a selectable direct, Preview 2 sockets, or Preview 2 WASI HTTP implementation. Servers need `direct` or `wasi-sockets`. |
| [`node:http2`](./http2.md) | Client and server sessions over selectable direct or WASI socket implementations. |
| [`node:https`](./https.md) | The `node:http` core with the `https:` profile and a TLS-aware `Agent`; same implementation selection. TLS uses `jco:node/tls`, optionally delegating to `wasi:tls`. |
| [`node:inspector`](./inspector.md), [`node:inspector/promises`](./inspector.md) | Session, console, and broadcast surface over an explicit host capability; denied by default. The host calls back through a guest-exported interface. |
| [`node:module`](./module.md) | Classification, source maps and `require.resolve` are exact. Everything that **loads** throws `ERR_JCO_UNSUPPORTED_NODE_API`. Requires no WIT capability. |
| [`node:net`](./net.md) | TCP clients, servers, and address utilities over Preview 2 `wasi:sockets`; native handles and IPC are unsupported. |
| [`node:os`](./os.md) | Machine and user information over an explicit host capability; denied by default. Static POSIX constants resolve without a provider. |
| [`node:path`](./path.md), [`node:path/posix`](./path.md), [`node:path/win32`](./path.md) | Jco's portable path implementation, connected to `wasi:cli/environment` for the guest working directory and environment. |
| [`node:perf_hooks`](./perf-hooks.md) | Portable timing and observers; native telemetry throws. See the API page for runtime requirements. |
| [`node:process`](./process.md) | Host process state and operations over `jco:node/process@0.1.0`; lazy default properties, named functions and objects. See the API page for process restrictions. |
| [`node:querystring`](./querystring.md) | Covers the complete Node 24 module surface and shares the audited Buffer core used by `node:buffer`. |
| [`node:readline`](./readline.md), [`node:readline/promises`](./readline.md) | Node 24.20 line parsing, questions, terminal editing and cursor actions over supplied streams. No WIT capability. |
| [`node:repl`](./repl.md) | Node 24.20 REPL over the readline port and supplied streams; `useGlobal: true` only, bundles acorn. No WIT capability. |
| [`node:sqlite`](./sqlite.md) | SQLite over an explicit typed host capability; denied by default. Synchronous SQL callbacks are unsupported. |
| [`node:stream`](./stream.md), [`node:stream/promises`](./stream.md) | Classic streams, pipelines, operators, disposal, and Web adapters. No WIT capability. |
| [`node:stream/consumers`](./stream.md) | Portable Node 24 collection helpers over async iterables and engine globals. Requires no WIT capability. |
| [`node:stream/iter`](./stream.md) | Experimental Node 24.20 iterable streams. Requires no WIT capability. Classic output adapters are explicitly unsupported. |
| [`node:string_decoder`](./string-decoder.md) | Guest-local streaming decoder for Node 24. Requires no WIT capability. |
| [`node:test`](./test.md), [`node:test/reporters`](./test.md) | Serial component tests, hooks, assertions, mocks, and reporters. No additional WIT imports. Runner requires engine `AbortController`; see the API page for engine limits. |
| [`node:timers`](./timers.md), [`node:timers/promises`](./timers.md) | Node 24 timer handles and promise timers over engine task scheduling; see the API page for runtime limits. |
| [`node:tls`](./tls.md) | Encrypted sockets, contexts, and inspection over `jco:node/tls`; denied by default. |
| [`node:tty`](./tty.md) | Node 24.20 `isatty`, `ReadStream` and `WriteStream` over the host process's descriptors through an explicit host capability; denied by default. |
| [`node:url`](./url.md) | Node 24 URL, URLSearchParams, URLPattern, domain and file conversions; relative file paths use optional WASI environment imports. |
| [`node:util`](./util.md), [`node:util/types`](./util.md) | Portable Node 24 utilities, sharing assertion equality and console formatting. No WIT capability; see the API page for engine and process restrictions. |

[Globals](./globals.md) and [Errors](./errors.md) document runtime-wide Node.js
APIs. They are not importable as `node:globals` or `node:errors`.
