# `node:timers`

| Imports | Implementation |
| --- | --- |
| `node:timers`, `node:timers/promises` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/timers` and `/timers/promises` |

`node:timers` and `node:timers/promises` target Node.js 24.20.0. Keep ordinary
imports in application code and bundle them with `jco componentize --bundle`:

```js
import { setTimeout, clearTimeout } from "node:timers";
import { setTimeout as delay, scheduler } from "node:timers/promises";

const pending = setTimeout(() => console.log("later"), 100);
pending.refresh();
clearTimeout(pending);
await delay(10, "ready");
await scheduler.yield();
```

## Timer handles and promises

The callback module supplies timeout, interval and immediate scheduling and
cancellation. Timeouts support `refresh()`, numeric/string cancellation IDs,
`close()` and `Symbol.dispose`. Immediates support cancellation and disposal.
`close()` remains functional because Node 24 marks it legacy, not deprecated.
Removed exports such as `enroll` and `active` are not reintroduced.

The promise module supplies delays, immediates, interval async iterators and the
scheduler singleton. It shares identity with `timers.promises` and the callback
functions' custom promisify hooks. Abort rejects with `AbortError`, `ABORT_ERR`
and the signal's reason as `cause`; interval iterators retain ticks while the
consumer is busy and release the timer when the loop breaks.

## Engine requirements

No additional WIT import or host mapping is required by the adapter. The component
engine supplies the task scheduler and its underlying clocks. StarlingMonkey
supports scheduling; the current QuickJS backend lacks task timers, so scheduling
throws `ERR_JCO_UNSUPPORTED_NODE_API` (or rejects for promise APIs). Imports and
argument validation remain usable without timers.

`setImmediate` uses the runtime's native implementation when present, otherwise
a zero-delay timer task. Nested immediates run in later tasks, but a Web engine
cannot reproduce libuv's I/O/check phase ordering. The adapter does not replace Web
globals: imported functions return Node-style handles while the engine's global
timer functions retain their native identities and return types. Cancel imported
timers with the imported cancellation functions or their handle methods.

`ref()`, `unref()` and `hasRef()` track handle state and forward liveness changes
when runtime handles support them. Active `unref()` and `{ ref: false }` throw or
reject explicitly on engines with numeric Web timer handles, including
StarlingMonkey. A failed promise setup cancels its timer. Native Node timer
handles support these operations when using jco-std directly in Node.

Node's private async-hook instrumentation, delay warnings, native inspection and
private abort-listener protection against `stopImmediatePropagation()` are not
ported. Abort handling uses the engine's public event API. Direct jco-std imports
can coexist with native Node builtins, but their timer handles and cancellation
registries are separate.

## Implementation source

The TypeScript adaptation follows Node's `lib/timers.js`, `lib/internal/timers.js`
and `lib/timers/promises.js` at commit
`71b8b174857e25106d39b61a9e6f30d927da8b01`, with retained MIT notices. Engine timers
replace Node's native queue. The audited unenv 2.0.0-rc.24 implementation was not
selected: its promise delays resolve immediately, interval promises yield only
once, and fallback handles lack the required lifecycle semantics.
