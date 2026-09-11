# `node:diagnostics_channel`

| Imports | Implementation |
| --- | --- |
| `node:diagnostics_channel` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/diagnostics-channel` |

Publish/subscribe for instrumentation, entirely in-process, so it needs no WIT capability. Channels
are interned by name: a publisher and a subscriber that never share a reference still meet on the
same object.

`TracingChannel` is implemented in full -- `traceSync`, `tracePromise` and `traceCallback`, with
the `start`/`end`/`asyncStart`/`asyncEnd`/`error` sub-channels emitted in Node's order.

`Channel.bindStore` accepts anything offering `run(value, fn)`, which includes jco-std's
`AsyncLocalStorage`. Stores are therefore scoped synchronously: a bound store is visible while
subscribers run and does not follow an `await`. See [`node:async_hooks`](./async-hooks.md) for why.
