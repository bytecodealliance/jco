# `node:trace_events`

| Imports | Implementation |
| --- | --- |
| `node:trace_events` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/trace-events` |

Jco supports `createTracing()`, `getEnabledCategories()`, and the returned
`Tracing` object's `categories`, `enabled`, `enable()`, and `disable()` members.
The default export shares the named exports. As in Node, `Tracing` is not an
exported constructor.

## Component usage

Use ordinary Node imports in application code:

```js
import { createTracing, getEnabledCategories } from "node:trace_events";

const tracing = createTracing({ categories: ["node.fs.sync"] });
tracing.enable();
try {
  // Host filesystem operations performed while enabled can appear in the trace.
  console.log(getEnabledCategories());
} finally {
  tracing.disable();
}
```

Bundle the application with `jco componentize`:

```console
jco componentize source.js --bundle --wit wit --out component.wasm
```

Jco adds `jco:node/trace-events@0.1.0` and its WIT dependency to the selected
world. Tracing requires no additional WASI interfaces of its own.

## Granting host tracing

Tracing uses a host provider. The default provider rejects `enable()` and
`getEnabledCategories()` with `ERR_JCO_TRACE_EVENTS_ADAPTER_REQUIRED`.
Importing the module, creating a disabled object, reading its properties, and
disabling an already-disabled object do not call the provider. A failed enable
leaves the object disabled; host errors retain their name, code, and message.

To enable actual Node tracing, select the supplied Node provider explicitly:

```console
jco transpile component.wasm --out-dir out \
  --map 'jco:node/trace-events@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/trace-events/host/node'
```

The provider uses Node's real tracing agent. Categories are shared with other
components, native `node:trace_events` objects, and the host's
`--trace-event-categories` flags. Disabling one object releases only its own
categories. Repeated enable/disable calls are idempotent, and active objects stay
alive until disabled. Native Node emits the warning for more than ten active
tracing objects.

## Capture boundary

Trace data describes the **Node host runtime**. It does not instrument the
component's QuickJS or StarlingMonkey engine, guest garbage collection, or guest
performance marks. A host operation performed on behalf of a component can emit
Node trace events while the corresponding category is enabled.

Node controls trace-file creation, flushing, rotation, timestamps, and the host's
`--trace-event-file-pattern` setting. The provider follows Node's tracing
availability and main-thread restrictions. Guest command-line flags are not
forwarded to the host. The separate `node:inspector` provider handles the
`NodeTracing` inspector protocol.

Direct jco-std users can inject a provider with the `trace-events/core` factory;
that instance can coexist with native Node imports. Application components
should use `node:trace_events` so Jco supplies the WIT adapter.

## Compatibility and implementation source

The compatibility target is Node.js **24.20.0**, commit
`71b8b174857e25106d39b61a9e6f30d927da8b01`. The guest core adapts
[`lib/trace_events.js`](https://github.com/nodejs/node/blob/71b8b174857e25106d39b61a9e6f30d927da8b01/lib/trace_events.js)
under Node's MIT license, with the license retained in the source. Shared Jco
helpers supply argument errors, inspection, and WIT error transport; an owned
host resource replaces Node's native `CategorySet` handle.

Node 24 requires an array of strings and rejects an empty array. This follows the
pinned runtime even though the [Node documentation](https://nodejs.org/api/tracing.html)
describes coercion of array members. An empty string category is accepted.
The `categories` getter preserves input order and duplicates and reflects later
array mutations; actual capture uses the categories copied at construction.
`getEnabledCategories()` returns the sorted host-wide union, or `undefined` when
there are none.

Inspection uses Jco's existing portable formatter; its quoting and line wrapping
can differ from Node for unusual or long category names. Guest state is updated
only after successful host operations, including when access is denied.

The audited unenv **2.0.0-rc.24** implementation ignores the supplied categories,
returns an empty category query, and only toggles an object's boolean state.
Jco therefore uses the Node adaptation and real host provider instead of enabling
that alias. Neither public API is deprecated in the pinned Node release.
