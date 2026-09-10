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

Explicit `node:` imports select builtin adapters. Audited bare names also resolve
when no installed package shadows them. See [Express](./express.md) for the
portable globals and dependency compatibility used by ordinary npm libraries.

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

For whole-application compatibility, see [Express](./express.md).

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
