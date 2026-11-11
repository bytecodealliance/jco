# Security model

This chapter describes what Jco does and does not protect against, who is responsible for the
rest, and how that differs between Node.js and browsers. It covers every package published from
the Jco repository.

To report a vulnerability, follow the [Bytecode Alliance security policy][ba-security]. Do not
open a public issue. [What is considered a security vulnerability?](./what-is-a-vulnerability.md)
says which bugs qualify.

## How Jco differs from Wasmtime

Jco's model is derived from [Wasmtime's][wasmtime-security], and the goal is the same: an
embedder can run a component it does not trust, and that component can reach only what the
embedder gave it. The way Jco gets there is different in three respects, and each one narrows
what Jco itself can promise.

**Jco is not a WebAssembly engine.** Wasmtime compiles and executes WebAssembly, so memory
isolation, control-flow integrity, and Spectre hardening are its own code. Jco generates
JavaScript that asks someone else's engine (V8, SpiderMonkey, JavaScriptCore) to execute the core
modules of a component. The core WebAssembly sandbox is the engine's guarantee. Jco's own
guarantees start where the component model starts: the bindings between core modules and
JavaScript, and the WASI implementations behind them.

**The host side is JavaScript, and JavaScript is porous.** A Wasmtime host is a Rust program whose
state is reachable only through typed APIs. A Jco host is a JavaScript realm in which generated
bindings, the WASI shims, the embedder's code, and every npm dependency share one global object,
one set of built-in prototypes, and one module cache. Any of them can modify what the others see.
Jco defends the boundary between the guest and that realm. It cannot defend the parts of the realm
from each other.

**Jco runs on two platforms with different ambient authority.** On Node.js the process can open
any file and socket the operating system user can. In a browser the page can act as its origin:
read its storage, change its DOM, and send requests carrying the user's credentials. What a guest
gains from an escape, what the defaults are, and what isolation tools exist all depend on the
platform. See [Platforms](#platforms).

## Roles and trust

| Role | Examples | Trusted? |
| --- | --- | --- |
| Embedder | The application that imports transpiled bindings, configures the shims, and implements host imports | Yes. It has full authority and decides what the guest receives. |
| Guest | A component's core WebAssembly modules, and any JavaScript engine compiled into them | **No.** This is the adversary the model is written for. |
| Tool input | A component given to `jco transpile`, WIT files, a component in a bundler's module graph | **No** for components and WIT. See [Tooling](#tooling) for source code given to `jco componentize`. |
| Realm code | Other JavaScript in the same realm: npm dependencies, other scripts on the page | Yes. It has the embedder's authority whether or not the embedder intends that. |
| Platform | The JavaScript and WebAssembly engine, Node.js, the browser, the operating system | Yes. Jco depends on it and cannot check it. See [What Jco depends on](#what-jco-depends-on). |

Data returned from a guest is untrusted even when the call succeeds. Bindings guarantee that a
value has the shape its WIT type describes: a `string` is a JavaScript string, a `u32` is in
range. They guarantee nothing about its content. An embedder that uses a guest-supplied string as
a path, a URL, a SQL fragment, or HTML must validate it as it would any other outside input.

## The boundaries

A component reaches the host through four layers. The first belongs to the platform; Jco is
responsible for the other three.

### 1. Core WebAssembly: the engine's sandbox

The engine confines each core module to its own linear memories and tables, type-checks every
call, and exposes the outside world only through imports. Jco relies on this and adds nothing to
it. A bug that breaks it is an engine bug.

Jco's obligation at this layer is to not undermine the engine: generated code hands each core
module exactly the imports the component declares, and never a reference to host objects, to
another component's memory, or to JavaScript globals that the component did not import.

One output mode changes this layer. `jco transpile --js` converts core modules to JavaScript for
engines without WebAssembly support. That code is still confined to its own typed arrays, but it
does not trap the way WebAssembly does, for example on an out-of-bounds memory access. Treat
`--js` output as a compatibility fallback, not as a place to run untrusted components.

### 2. The component model: generated bindings

`js-component-bindgen` generates the JavaScript that implements the Canonical ABI, either inline
or by importing `@bytecodealliance/jco-cm-runtime`. This code is Jco's equivalent of a runtime,
and these are its guarantees:

- **Guest-supplied pointers, lengths, and indices are checked.** Lifting a value never reads
  outside the memory of the instance that produced it, and where the Canonical ABI traps, the
  bindings trap instead of carrying on with wrong data.
- **Handles cannot be forged.** A guest can use a resource, stream, future, or task only through
  a handle it was given, of the right type, in its own table. It cannot reach another instance's
  resources or a host object it was never passed.
- **Component instances are isolated from each other.** Inside one transpiled component, a
  sub-component can affect another only through the interfaces that connect them.
- **Lowering a guest value does not alter the realm.** No value a guest can produce, including
  one whose record field or key is named `__proto__` or `constructor`, changes a prototype, a
  global, or host state beyond the returned value itself.
- **A trap ends the instance, not the host.** A trap is reported as a `WebAssembly.RuntimeError`
  to the call that caused it, and the instance refuses further calls. See
  [Detecting traps](../advanced/detecting-traps.md). A guest cannot make the bindings throw
  outside a call the embedder made, in a way that surfaces as an uncaught exception or an
  unhandled rejection.

These hold for a guest that is actively hostile, including one that is not a valid output of any
toolchain. The exception is `--valid-lifting-optimization`, which removes checks on the
assumption that the component is well-behaved. Do not use it for components you do not trust.

### 3. Capabilities: the WASI shims

A component has no ambient authority. Everything it can do to the outside world is an import, and
the embedder chooses what satisfies each import: one of Jco's shims, its own code, or nothing.

`@bytecodealliance/preview2-shim` and `@bytecodealliance/preview3-shim` implement WASI on top of
the platform's APIs. When the embedder configures a restriction, the shim guarantees it holds:

- **Filesystem.** A guest reaches only files under the directories preopened for it. No path it
  can construct escapes a preopen, whether through `..`, absolute paths, or symbolic links,
  including links the guest created.
- **Network.** With network access denied, no interface reaches the network: not sockets, not
  name lookup, not `wasi:http`.
- **Environment and arguments.** A guest sees only the variables and arguments configured for it.
- **Instances.** Two components given separate `WASIShim` instances do not see each other's
  preopens, environment, or arguments.

**Do not treat the defaults as a sandbox.** What a guest receives when nothing is configured
depends on the package and its version:

- `@bytecodealliance/jco` currently grants full host access by default on Node.js. `jco run`
  without `--sandbox` gives the guest the host's filesystem, environment, and network, as an
  ordinary Node.js program would have. This is historical behaviour, and a future release of
  `jco` will deny access by default.
- `@bytecodealliance/jco-transpile` does not grant full host access by default.

Because the default differs between packages and will change, state the restrictions for an
untrusted component explicitly: `new WASIShim({ sandbox: { ... } })` in code, or
`jco run --sandbox` on the command line. See the [Preview 2 shim](../wasi/preview2-shim.md)
chapter.

Two limits follow from implementing WASI in JavaScript without operating-system support:

- **Path confinement is resolved in userland.** Node.js exposes no `openat`-style API, so the
  shims resolve and check a path and then open it. The guarantee above holds against everything
  the guest does through its own imports. It does not hold against another process, or other host
  code, that rearranges the directory tree while the guest is running. Closing that gap would
  mean performing every file operation in native code through `@bytecodealliance/jco-node-fs`,
  which Jco does not do today. Do not preopen a directory that a less trusted party can write to
  from outside.
- **The Preview 3 shim has no per-instance sandbox.** Its configuration is process-global, so
  every component in the realm shares one set of preopens, environment variables, and arguments.
  To give two Preview 3 components different capabilities, run them in separate workers or
  processes.

Host imports written by the embedder are part of the embedder. If an import hands the guest more
than was intended, that is a bug in the embedding.

### 4. Tooling: transpiling and building

`jco transpile`, `@bytecodealliance/jco-transpile`, and
`@bytecodealliance/rolldown-plugin-jco` accept components that may be hostile. Processing one:

- executes none of the component's code,
- writes only inside the requested output directory, and
- produces JavaScript in which every name and string taken from the component (import and export
  names, WIT identifiers, module specifiers) appears as data. A component cannot inject code into
  its own bindings.

Transpiling does not make a component safe to run. The output imports whatever the component
imports, and what satisfies those imports decides what the component can do. Review the imports
(`jco wit component.wasm`) before running the output.

`jco componentize` is different: it bundles and evaluates the JavaScript it is given, with
whichever engine backend is selected, and may resolve and load project dependencies. Its input is
source code the developer is building, and it is trusted like any other build input. Do not
componentize source you would not run.

## Platforms

| | Node.js | Browser |
| --- | --- | --- |
| Ambient authority of the realm | The operating system user: files, sockets, environment, child processes | The page's origin: DOM, storage, cookies, credentialed requests to the origin |
| Defaults | Full filesystem, environment, and network access with `jco` today; see [Capabilities](#3-capabilities-the-wasi-shims) | No filesystem preopens, no raw sockets, stdin closed. Outbound HTTP is allowed through `fetch`, and currently [carries the user's session](#browsers) to the page's origin. |
| Restricting a guest | `WASIShim` `sandbox` options, `jco run --sandbox` | `WASIShim` `sandbox` options, and the page's Content Security Policy |
| Stopping a runaway guest | `worker.terminate()`, or killing the process | `worker.terminate()` on a Web Worker |
| Isolation stronger than a realm | `worker_threads`, child processes, the Node.js permission model, containers | Web Workers, sandboxed or cross-origin iframes |
| Platform's own boundary | None between JavaScript and the operating system | Same-origin policy, site isolation, CSP, permission prompts |

### Node.js

Node.js has no boundary between JavaScript and the operating system, so the shims are the only
thing between a guest and the host. A shim bug is a full sandbox escape. For untrusted
components, add a layer that does not depend on Jco: the Node.js permission model
(`--permission`), a container, a separate operating-system user, or all three.

`@bytecodealliance/jco-node-fs` is a native addon written in Rust and loaded into the Node.js
process. It is the one place where Jco's own code can be memory-unsafe.

`jco serve` is a development server. It is not hardened against hostile network traffic, and its
`--isolate-requests` modes separate requests for correctness, not as a security boundary between
mutually distrusting tenants.

### Browsers

The browser's own sandbox stays in place around everything Jco does: a guest that escapes Jco
entirely has the authority of the page, never of the user's machine. That makes the page's
origin the asset to protect.

- **Known limitation: outbound HTTP can carry the user's session.** A guest's `wasi:http`
  requests should not be sent with the user's credentials, but in the current implementation
  they can be. The browser shims call `fetch` without setting its `credentials` option, so the
  browser's default applies and a request to the page's own origin includes the user's cookies
  and HTTP authentication. A guest that is allowed outbound HTTP can therefore call the
  application's own API as the signed-in user. This is a limitation of the current
  implementation, not an intended capability, and it may change in a future release. Until then,
  deny network access with `sandbox.enableNetwork: false`, restrict destinations with CSP
  `connect-src`, or serve the guest from an origin that holds no session.
- **Content Security Policy applies to the output.** Compiling WebAssembly requires
  `'wasm-unsafe-eval'` under a restrictive `script-src`. The bindings `jco transpile` generates
  do not use `eval` or `new Function`.
- **WebIDL bindings are not a sandbox.** The experimental `webidl:` imports bind a guest directly
  to objects on `globalThis`. A guest given the DOM has the page.
- **Timing and shared memory.** Whether a guest can build a high-resolution timer, and whether
  Spectre-class attacks cross a boundary, is decided by the browser's site isolation and
  cross-origin isolation, not by Jco. Do not keep secrets in a realm that also runs a guest you
  do not trust; put the guest in a cross-origin iframe.

### Other runtimes

Deno, Bun, and edge runtimes such as `workerd` may run Jco's output, but Jco is not tested against
them for security. The guarantees in this chapter are stated for Node.js and for current versions
of Chrome, Firefox, and Safari.

## What Jco does not protect against

- **Other code in the realm.** A dependency that modifies `Object.prototype`, replaces
  `WebAssembly.instantiate`, or patches `fetch` changes how bindings and shims behave. So can the
  embedder. This is how JavaScript works; an attacker with code execution in the realm has
  already won. Freezing built-ins, for example with hardened JavaScript, is the embedder's
  choice and is not required or tested by Jco.
- **Resource exhaustion by the guest's own execution.** Jco has no equivalent of Wasmtime's fuel
  or epoch interruption. A synchronous guest call occupies its thread until it returns, and a
  guest can grow its memories to the maximum they declare. Bound these from outside: run the
  guest in a worker, terminate it on a deadline, and limit the memory of the worker or process.
  This exclusion covers the guest's computation. Jco's own code hanging, or allocating without
  bound in the host on the guest's behalf, is covered; see the
  [cheat sheet](./what-is-a-vulnerability.md#cheat-sheet).
- **Side channels.** Spectre, timing, and cache attacks between a guest and anything else in its
  process are the engine's and the platform's domain.
- **Deterministic cleanup.** Host objects held by a stopped or trapped instance are released when
  the garbage collector reaches them. See
  [Differences with Wasmtime](../advanced/differences-with-wasmtime.md).
- **What a granted capability is used for.** A guest given a directory can fill it. A guest given
  the network can send what it knows anywhere. Jco enforces whether a capability was granted,
  not how it is used.
- **Supply chain of the application.** Jco's packages are published from CI with provenance, but
  an application's other dependencies run in the same realm with the same authority.

## Packages

| Package | Runs | Role in the model |
| --- | --- | --- |
| `@bytecodealliance/jco` | Build time, and as host for `run` and `serve` | CLI over the packages below. In the current version, `run` grants full access unless `--sandbox` is passed. `serve` is for development only. |
| `@bytecodealliance/jco-transpile`, `js-component-bindgen` | Build time; their output runs in the host | Boundary 4 when run, boundary 2 through the code they generate |
| `@bytecodealliance/jco-cm-runtime` | Host | Boundary 2, when selected with `--cm-runtime-es-module`. Experimental. |
| `@bytecodealliance/preview2-shim` | Host | Boundary 3 for WASI 0.2 |
| `@bytecodealliance/preview3-shim` | Host | Boundary 3 for WASI 0.3. No per-instance sandbox. |
| `@bytecodealliance/jco-node-fs` | Host, native code | Filesystem primitives for the shims. Memory safety matters here. |
| `@bytecodealliance/rolldown-plugin-jco` | Build time | Transpiles components in a bundler's module graph. Same guarantees as `jco transpile`. |
| `@bytecodealliance/jco-std` | Guest, except its `host/node` adapters | See below |

### `jco-std`

Most of `jco-std` is guest-side library code: framework adapters and Node.js built-in
compatibility modules that are bundled into a component. It runs inside the sandbox with the
component's capabilities and no others. A bug there can make an application misbehave, but it
cannot grant a component authority, so it is a security issue only when it breaks a security
property the helper documents, such as the randomness behind a `node:crypto` function.

Two parts need more care:

- **`host/node` adapters run in the host and grant host authority on purpose.** Mapping
  `jco:node/child-process`, `jco:node/sqlite`, `jco:node/inspector`, or a similar interface to
  its `host/node` provider gives the guest that Node.js API with the authority of the process. No
  restriction configured on a WASI shim applies to it. These adapters are never mapped by
  default. Mapping one is a decision to trust the guest with it.
- **`node:vm` is not a sandbox.** Code evaluated through it shares the component's globals and
  capabilities.

### Componentization engines

`jco componentize` embeds a JavaScript engine (StarlingMonkey through ComponentizeJS, QuickJS
through `componentize-qjs`, or Perry) into the component it produces. Those engines are separate
projects with their own security policies. Once embedded, the engine is guest code: a bug in it
can corrupt the component's own state, but stays inside boundaries 1 to 3.

Scripts loaded into one engine instance with
[script-only components](../advanced/script-only-components.md) share that engine's JavaScript
realm. A script engine is not a boundary between scripts; use one engine instance per trust
boundary.

## Experimental features

Some features are still changing and have not had the review the rest of Jco has. Bugs in them
are fixed in the open as ordinary bugs unless they also affect a configuration that uses no
experimental feature. Do not rely on them to contain untrusted components.

- `@bytecodealliance/jco-cm-runtime` and `--cm-runtime-es-module`
- Experimental parts of `jco componentize`: new engines and backends such as Perry, and Node.js
  built-in compatibility
- `webidl:` imports
- `jco transpile --js`
- `jco serve`

Component Model async, the WebAssembly JavaScript Promise Integration it builds on, WASI 0.3
components, and `jco componentize` itself are not experimental. They are covered by this model.

## What Jco depends on

Jco's guarantees assume the layers beneath it work. The Jco project does not fix, and does not
take responsibility for, vulnerabilities in them.

| Dependency | Jco relies on it for | Report to |
| --- | --- | --- |
| V8, SpiderMonkey, JavaScriptCore | The core WebAssembly sandbox, JSPI, JavaScript semantics, Spectre mitigations | The engine or browser vendor |
| Node.js | `node:fs`, `node:net`, `node:http`, `worker_threads`, the permission model | [Node.js][node-security] |
| Browsers | Same-origin policy, site isolation, CSP, `fetch`, OPFS, Workers | The browser vendor |
| `wasm-tools`, Binaryen | Parsing, validating, and optimizing components | [Bytecode Alliance][ba-security]; [Binaryen][binaryen] |
| ComponentizeJS, StarlingMonkey, `componentize-qjs`, Perry | The engine inside components built with `jco componentize` | The respective project |
| npm dependencies | Bundling, argument parsing, and other tooling | The package's maintainers |

If you cannot tell whether a problem is in Jco or beneath it, report it to Jco privately and the
maintainers will route it.

For a vulnerability in a dependency, Jco will:

- update, pin, or replace the dependency in a regular release when a fix exists,
- publish an advisory of its own only when Jco users must act and updating the platform is not
  enough, for example when Jco used the dependency in a way that turned a minor bug into an
  escape, and
- treat its own misuse of a platform API as a Jco bug. "Node.js follows symbolic links here" is
  Node.js working as documented; a shim that relies on it not doing so is a Jco vulnerability.

Jco's guarantees apply on platform versions that still receive security updates from their
vendor: maintained Node.js release lines and current browser releases. Running Jco's output on an
engine with known, unpatched sandbox escapes is outside this model.

## Recommendations for embedders

To run a component you do not trust:

1. **Read its imports** with `jco wit`, and refuse what you do not intend to provide.
2. **Configure the sandbox explicitly.** Start from `preopens: {}`, `env: {}`,
   `enableNetwork: false`, and add only what is needed. Never rely on defaults on Node.js.
3. **Use instantiation mode** (`--instantiation`) and pass imports yourself, so that no import is
   resolved from the module graph without your knowledge.
4. **Keep `--valid-lifting-optimization`, `--js`, and experimental features off.**
5. **Put the guest in a worker** and terminate it on a deadline. Limit the worker's memory.
6. **Add a boundary Jco does not implement**: the Node.js permission model or a container on the
   server, a cross-origin iframe and CSP in the browser.
7. **Validate everything the guest returns** before using it in a path, query, URL, or markup.
8. **Keep the platform patched.** The WebAssembly sandbox is only as good as the engine.

If you need hard resource limits, deterministic interruption, or multi-tenant isolation in one
process, use a runtime built for that, such as [Wasmtime][wasmtime].

[ba-security]: https://bytecodealliance.org/security
[wasmtime]: https://wasmtime.dev
[wasmtime-security]: https://docs.wasmtime.dev/security.html
[node-security]: https://nodejs.org/en/security
[binaryen]: https://github.com/WebAssembly/binaryen
