# `node:perf_hooks`

| Imports | Implementation |
| --- | --- |
| `node:perf_hooks` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/perf-hooks` |

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

## Supported timing operations

Marks, measures (including named marks and start/end/duration options), timeline
queries and clearing, explicit resource timings, resource buffer notifications,
observers and `timerify` are implemented. Observers support `mark`, `measure`,
`resource` and `function` entries. Function timing includes promise settlement and
constructor calls. Observer and resource-buffer callbacks use component timers;
their ordering relative to other tasks can differ from Node's `setImmediate`.
Resource entries describe timings supplied by the application; network operations
are not automatically instrumented.

## Native performance telemetry

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
