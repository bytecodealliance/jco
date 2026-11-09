# Stopping running instances

A host controls how long a transpiled component remains usable. Returning from an export,
closing a channel, draining output, and stopping the instance are separate lifecycle events.
Choose the operation that matches the work you want to finish:

| Operation | What it finishes |
| --- | --- |
| Await an exported call | The call's result. Guest background work may continue after it returns. |
| `instance._util.whenIdle()` | Guest task exit, including background work after a call returns. |
| Dispose a received future or return a stream iterator | That readable channel end. Other guest work can continue. |
| `instance._util.stop()` | Execution and runtime-managed cleanup for the entire generated instantiation. |
| Preview 3 `cli._flush()` / `cli._shutdown()` | Queued output writes / host-owned stdout and stderr transfers. |

## Stop an instance permanently

Call `_util.stop()` when the host is finished with an instance, including when abandoning
unfinished work:

```js
import { instantiate } from './component.js';

const instance = await instantiate(getCoreModule, imports);
try {
  await instance.run();
} finally {
  instance._util.stop();
}
```

This example deliberately ends any background work left after `run()` returns. If that work
must finish, [wait for guest tasks to exit](#wait-for-guest-tasks-to-exit) before stopping.

For direct ES module output, import `_util` from the generated module and call `_util.stop()`.
For instantiation output, use the `_util` returned by `instantiate()`. Each instantiation has
its own runtime state: stopping one stops its entire component graph, including nested
components, without stopping other instantiations of the same generated module.

Stopping is permanent. An instance cannot be restarted; create another instantiation to run
it again. Repeated calls to `stop()` do nothing.

## What stopping does

`stop()` synchronously marks the instance stopped and initiates cleanup:

- Further calls into its components fail, and pending guest calls reject with a
  `WebAssembly.RuntimeError`. Guest execution cannot resume when pending host work completes.
- Runtime scheduler timers are cleared.
- Both ends of its streams and futures are closed. A host stream read interrupted while waiting
  for data rejects with an error whose `code` is `"ERR_COMPONENT_STOPPED"`; a host future read
  still waiting for its value also rejects. Discarded
  host-provided sources receive the disposal notification used when a guest discards their channel.
- Host resources still owned by the guest have their `Symbol.dispose` method called.
  Borrowed resources and resources already returned to the host are not disposed.

Guest Wasm destructors are not run. Stopping can also release runtime-managed resources
after a guest trap.

If synchronous host-resource disposal throws, cleanup continues for other resources and
`stop()` throws an `AggregateError`. The instance remains stopped. Deferred source disposal
uses the reporting behavior described in [Preview 3 host value disposal](./preview3-host-value-disposal.md).

The call does not await asynchronous host cleanup. Promise handlers and deferred disposal
run afterward. Hosts remain responsible for cancelling their own I/O and timers and for
awaiting any cleanup completion they need to observe. A host operation that ignores its
disposal notification can continue independently.

Like other JavaScript APIs, `stop()` cannot interrupt synchronous Wasm that never yields
control back to JavaScript. It also does not promise immediate memory reclamation: release
references to the generated instance, exports, and values so JavaScript garbage collection
can reclaim them when they are no longer reachable.

## Recognize an interrupted stream

A host stream's `next()` or `read()` rejects with `code: "ERR_COMPONENT_STOPPED"` when
instance shutdown interrupts it. Reads started after shutdown on that stream also reject.
This is a JavaScript binding guarantee, not a new Canonical ABI copy result.

```js
try {
  for await (const item of stream) {
    consume(item);
  }
} catch (error) {
  if (error?.code !== 'ERR_COMPONENT_STOPPED') throw error;
  // The instance was stopped before the stream finished normally.
}
```

A read that already copied data still delivers that data; a subsequent read reports the
shutdown. A stream that ended normally or whose iterator was returned or disposed before
shutdown still reports ordinary EOF (`done: true`). Calling `return()` to clean up an
interrupted iterator remains safe. The error code above applies to host stream reads;
other stopped operations, including future reads, retain their existing rejection behavior.

## Channel disposal and value ownership

Disposing a received future releases its readable end. Once `await future` or a fulfillment
callback has received a value, the recipient owns that value; disposing the future does not
dispose it. A copied disposable value that has not yet been delivered is cleaned up when
the future is discarded. See [Dropping a received future](../transpiling.md#dropping-a-received-future).

Stopping the instance is broader than disposing one channel. Host-owned resources already
returned to the caller remain the caller's responsibility. A returned value that needs to
call back into the stopped guest can no longer execute that guest code.

## Wait for guest tasks to exit

`instance._util.whenIdle()` resolves once no guest task remains in the generated instantiation.
A task counts until it exits, including work it performs after returning its result. This lets
hosts wait for background work that outlives an exported call.

Waiting does not stop the instance or prevent new calls. A long-lived task can keep the wait
pending indefinitely; ask such tasks to finish through the application's own protocol first.
The promise also resolves if the instance stops or traps, so resolution alone is not evidence
of successful completion. Observe exported-call failures and, for background traps,
[`options.onTrap`](../transpiling.md#instantiation).

`whenIdle()` tracks guest tasks. It does not wait for arbitrary host I/O, deferred disposal,
or destination flushing. With a workload whose guest tasks are expected to exit, an orderly
sequence is:

```js
import * as cli from '@bytecodealliance/preview3-shim/cli';

try {
  await instance.run();
  await instance._util.whenIdle();
  await cli._shutdown();
} finally {
  instance._util.stop();
}
```

Use a host timeout or other application policy if waiting indefinitely is inappropriate.
Calling `stop()` abandons outstanding guest work and releases idle waiters; it does not wait
for normal task exit first. Keep waiting and forced teardown as separate choices.

## Wait for selected calls

With `--call-tracking`, use `_util.calls.start(exportedFunction, ...args)` to obtain a
handle whose `result` preserves the call's return value and whose `finished` promise
reports when that invocation's guest execution and descendant calls have ended.
Unrelated long-lived calls do not keep this wait pending. See
[Tracking individual calls](./call-tracking.md) for usage, completion outcomes, and
stream/future consumption requirements.

## Finish work and drain output

For orderly shutdown, first stop accepting new application work and ask any long-lived guest
producer to finish through the application's own protocol. Wait for the work you need to
preserve, then drain the host destinations before calling `stop()`.

An exported call can return while guest tasks continue in the background. Awaiting the call
alone therefore does not establish that the guest has finished producing output. Similarly,
completion of a component-model stream write acknowledges the copy to the receiver, not a
flush to its final destination.

The Preview 3 shim provides `cli._flush()` and `cli._shutdown()` for stdout and stderr.
`_flush()` waits for writes already queued at the destinations. `_shutdown()` closes their
host-owned readers, finishes active transfers, and awaits destination completion. Producers
must have stopped writing before `_shutdown()` begins. These helpers do not stop the component
instance or wait for all its guest work.

See [Preview 3 output flush and shutdown](./preview3-output-flush-and-shutdown.md) for the
Node.js and browser APIs, destination acknowledgements, and the sequence used by `jco run`.
Abruptly stopping an instance does not guarantee delivery of all guest output.

## Host embedding policy and the Canonical ABI

`_util.stop()` is a Jco host convenience. Its dedicated shutdown hooks are separate from
ordinary canonical stream and future drop operations. Shutdown can close pending copies
and unwritten future writers; ordinary guest operations retain the Canonical ABI's drop
checks. Stopping an instance is not an additional canonical instruction.

See [Differences with Wasmtime](./differences-with-wasmtime.md#stopping-and-shutting-down-instances)
for a comparison of pending operations, host sources, resources, and memory during teardown,
and why Jco provides explicit lifecycle control in browsers and Node.js.
