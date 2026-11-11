# Tracking individual calls

An exported call can return a stream or future while its guest task continues producing
values. Awaiting the result therefore does not establish that the guest has finished.
Whole-instance `whenIdle()` includes all guest work, so an unrelated long-lived call can
keep it pending indefinitely.

Optional call tracking lets a host observe the end of one invocation's guest execution,
including its descendant calls, while other work continues.

## Enable tracking

Enable tracking when transpiling:

```sh
jco transpile component.wasm -o out --instantiation async --call-tracking
```

The JavaScript transpilation option is `callTracking: true`. The Rust API exposes
`TranspileConfig::call_tracking` through `transpile_with_config`. For standalone host
declarations, use `jco types --call-tracking` or Rust's `generate_types_with_config`.

Enabled bindings expose `instance._util.calls`. Direct ESM output exposes the same API
through its `_util` export. Without the option, neither the API nor its instrumentation
is generated. This is an experimental Jco embedding feature, not a Canonical ABI extension.

## Start and observe a call

```js
const call = instance._util.calls.start(instance.processRequest, request);
const response = await call.result;

// Consume the output while its guest producer can still run. Waiting for finished
// before consuming a backpressured stream could deadlock its producer.
for await (const chunk of response.body) {
  await destination.write(chunk);
}

const completion = await call.finished;
switch (completion.status) {
  case 'completed':
    break;
  case 'stopped':
    throw new Error('The instance was stopped before execution finished');
  case 'trapped':
    throw completion.error;
}
```

`start(fn, ...args)` invokes a generated export from this instance and returns a frozen
handle with two properties:

| Property | Meaning |
| --- | --- |
| `result` | The export's ordinary return value, promise, or future wrapper, with the same representation as a direct call. |
| `finished` | A promise for the invocation's terminal guest-execution outcome. It does not reject. |

Synchronous exceptions propagate from `start()` without returning a handle. Asynchronous
failures remain observable through `result`. A `completed` execution outcome says that the
selected guest execution has ended; a declared WIT error can still make `result` fail.
A `trapped` outcome contains the invocation's trap error or a store-wide trap error.
Existing `onTrap` notifications still apply. Stopping an instance settles outstanding
handles as `stopped`; a handle that has already finished keeps its original outcome.

Calls are associated at their generated entry point. There is no ambient “last call”
lookup, and calls made reentrantly by host imports receive separate handles when started
through the tracking API. Functions from another instantiation, arbitrary callbacks, and
bound wrappers are rejected with `TypeError` before invocation. Export aliases that refer
to the same generated function are accepted.

For exported resource methods, supply the receiver explicitly:

```js
const read = instance._util.calls.startWithThis(resource, resource.read, size);
const bytes = await read.result;
const completion = await read.finished;
```

Exported resource constructors can be passed directly to `start(ResourceClass, ...args)`.
Constructing or awaiting a handle does not transfer ownership of returned resources.

## Streams, futures, and selected work

Tracking starts the invocation immediately, including exports whose future-returning
wrapper would otherwise defer execution until read. It does not read the returned future
or consume returned streams. The usual awaitable layers and disposal behavior are
preserved. Continue consuming or disposing channel results according to their ordinary
contracts; their producers may need that participation before `finished` can settle.

A handle includes the guest tasks transitively called by its invocation, even if the
initial task exits first. It does not include unrelated calls merely because they share
an instance or exchange stream values. To wait for several nodes in a dataflow pipeline,
keep the handles for the selected producer and consumer invocations:

```js
const outcomes = await Promise.all(selectedCalls.map(call => call.finished));
```

Completion does not await arbitrary host I/O, destination flushing, asynchronous host
cleanup, or release of every resource and task handle. It is an execution predicate, not
a resource-lifetime predicate. A selected long-lived producer can keep its handle pending
indefinitely. Tracking neither cancels a call nor prevents new calls. Whole-instance
`whenIdle()` and `stop()` retain their existing behavior.

## Runtime compatibility and cost

Tracking lives in generated binding glue and works with the bundled runtime and external
runtime providers. It reuses the existing task ancestry and idle-notification contracts;
providers need no additional task methods, scheduler fields, modules, or feature flag.
A provider that already correctly implements those lifecycle contracts can be used
unchanged.

Enabled output adds export registration and invocation-entry instrumentation. Only calls
started through the tracking API retain tracking records. While handles are pending,
lifecycle notifications scan live guest tasks to determine which selected roots still
have work. Finished records release their internal task references. Applications that do
not need this facility should leave it disabled.

Wasmtime's optional task-group hooks also support attributing activity to an originating
call, including tracing enter/exit notifications. Its group disposal includes task-handle
lifetimes. Jco's handles intentionally document guest execution completion instead; they
do not expose runtime tasks or reproduce Wasmtime's full hook API.
