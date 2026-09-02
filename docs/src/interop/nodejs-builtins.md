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

## Supported modules

Browse the [supported modules](./nodejs-builtins/supported-modules/index.md) for
API-specific examples, capabilities, and compatibility limits. Each API has its
own page, with related submodules grouped together.

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

### Serving requests

`app.listen()` works on the `direct` transport, where the host owns the socket and calls
back into the guest for each request. Two things have to be arranged around it.

The host provider is one of the component's *imports*, so it cannot reach the component's
exports by itself. The application introduces them once, after instantiating:

```js
import * as httpHost from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host/node";

const instance = await instantiate(undefined, imports);
httpHost.setCallbacks(instance["jco:node/http-callbacks@0.1.0"]);
```

And the exports that suspend on an asynchronous import have to be named when transpiling:

```console
jco transpile app.wasm -o out --async-mode jspi \\
    --async-exports start --async-exports 'jco:node/http-callbacks@0.1.0#handle-request' \\
    --map 'jco:node/http@0.1.0=...'
```

> [!NOTE]
> Name them rather than passing `--async-exports '*'`. The wildcard marks an export's
> binding asynchronous without wrapping the export in `WebAssembly.promising`, so the first
> call that suspends fails with `SuspendError`.

The `wasi-sockets` transport also serves, with the guest owning the accept loop. Two things
differ from `direct`:

- **`listen()` does not return.** The guest blocks on a pollable to accept connections, so it
  serves from inside whichever export called `listen()`. An application that wants to report
  its port has to do so before that call returns.
- **The component is not portable to a stock WASI host.** ComponentizeJS's guest bindings do
  not emit a class for an imported resource that has no methods, while still referencing one
  when lifting a returned handle -- and `wasi:sockets/network`'s `network` is the only
  resource in WASI shaped that way, so any guest calling `instance-network()` fails with
  `import_network_0_2_12$Network is not defined`. It reproduces in twelve lines of WIT, a
  `resource token;` returned from a function, and affects ComponentizeJS 0.19.3 through
  0.22.0. Preview 2's `wasi:sockets` implementation is complete and is not involved.

  Jco works around it by declaring one unused method on `network` in the WIT it injects. That
  method is part of the component's imported interface, so the component declares a
  `wasi:sockets/network` that is not the standard one and a host implementing only the
  standard interface will refuse to link it. It runs against Jco's transpiled JavaScript
  host. The workaround is commented where it lives, in
  `packages/jco/lib/wit/builtin/0.2.12/wasi-sockets/package.wit`, and should be removed once
  ComponentizeJS emits the class on its own.

### Additional application globals

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

### Host-backed or broad subsystems

These modules contain useful portable pieces, but their complete public surfaces
also require operating-system access, Node internals, an event loop, or a larger
set of coordinated shims:

`node:crypto`, `node:http2`,
`node:perf_hooks`, `node:repl`, `node:stream`,
`node:stream/promises`, `node:stream/web`,
`node:v8`, `node:vm`, `node:wasi`, and `node:zlib`.

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
module shape, and throws from every entry point. See [`node:domain`](./nodejs-builtins/supported-modules/domain.md).

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
[unenv]: https://github.com/unjs/unenv
