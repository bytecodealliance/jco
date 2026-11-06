# Stopping running instances

A host controls how long a transpiled component remains usable. Returning from an export,
closing a channel, draining output, and stopping the instance are separate lifecycle events.
Choose the operation that matches the work you want to finish:

| Operation | What it finishes |
| --- | --- |
| Await an exported call | The call's result. Guest background work may continue after it returns. |
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
must finish, wait for the application's completion signal before stopping.

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
- Both ends of its streams and futures are closed. A host stream read waiting for data reaches
  the end of the stream; a host future read still waiting for its value rejects. Discarded
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

## Channel disposal and value ownership

Disposing a received future releases its readable end. Once `await future` or a fulfillment
callback has received a value, the recipient owns that value; disposing the future does not
dispose it. A copied disposable value that has not yet been delivered is cleaned up when
the future is discarded. See [Dropping a received future](../transpiling.md#dropping-a-received-future).

Stopping the instance is broader than disposing one channel. Host-owned resources already
returned to the caller remain the caller's responsibility. A returned value that needs to
call back into the stopped guest can no longer execute that guest code.

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
