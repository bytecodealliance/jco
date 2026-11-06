# Differences with Wasmtime

Jco and Wasmtime implement the Component Model in different host environments. The Canonical
ABI defines the behavior of guest-visible operations; each embedding also provides lifecycle
and integration APIs beyond those operations. Similar host APIs need not have identical
cleanup mechanisms or completion guarantees.

Jco runs in browsers and Node.js, where JavaScript garbage collection and platform I/O APIs
control much of an application's lifetime. A host can retain a promise, iterator, exported
function, or resource after guest execution ends. Jco therefore provides explicit lifecycle
operations to settle outstanding work, notify sources of disposal, and release resources
that would otherwise depend on application cleanup or garbage collection. These operations
give hosts more deterministic control over execution and cleanup initiation; they cannot
force the platform to reclaim all memory immediately.

## Stopping and shutting down instances

Jco's `instance._util.stop()` permanently stops the entire generated instantiation, including
its nested components. Its scope is comparable to destroying a Wasmtime store, which owns
its component instances. Wasmtime's component `Instance` is a handle into that store rather
than an independently destructible owner. See the [Wasmtime Store API][store-api] and
[component Instance API][instance-api].

For instructions on using Jco's API, see [Stopping running instances](./stopping-running-instances.md).

### Teardown behavior

The comparison below describes Jco's explicit stop operation and Wasmtime store destruction.
A trapped or poisoned store is a separate state: preventing further execution alone does not
perform all the cleanup associated with destroying the store.

| Concern | Jco `_util.stop()` | Wasmtime store destruction |
| --- | --- | --- |
| Pending execution | Explicitly rejects pending guest calls and prevents guest execution from resuming. | Disposes fibers and drops store-owned futures. |
| Pending stream reads | Rejects interrupted host reads with `code: "ERR_COMPONENT_STOPPED"`. | Drops channel state and associated host machinery; teardown does not promise a final EOF notification. |
| Pending future reads | Rejects host reads still waiting for a value. | Drops the relevant machinery; externally observed cancellation depends on the host implementation. |
| Host sources | Explicitly invokes iterator return or disposal hooks for discarded sources. | Rust destruction releases stored producers, consumers, and their captured state. |
| Host resources owned by the guest | Calls `Symbol.dispose` on captured owned objects. | Cleanup follows ownership of host data and resource tables; canonical resource-destructor callbacks are separate operations. |
| Memory | Objects may remain reachable after stop; JavaScript GC can reclaim them when references are released. | Destruction releases store-owned instance allocations. |
| Cleanup completion | Returns synchronously without awaiting asynchronous host disposal. | Rust `Drop` runs synchronously; separately owned external work can still outlive the store. |
| Cleanup failures | Synchronous resource-disposal errors are aggregated after other cleanup; deferred source-disposal errors are reported separately. | `Drop` has no returned cleanup result; the embedder defines how its own cleanup failures are handled. |

This is a source-level comparison against Wasmtime revision
[`67d70b4e`][wasmtime-revision]. Its [store destructor][store-drop] runs manual cleanup,
drops host data and internal state, and deallocates instances. The component cleanup path
[disposes fibers and drops pending host futures][concurrent-drop]. It does not walk every
stream or future through the ordinary reader/writer close operations as a final protocol
exchange.

Wasmtime still cleans up host sources: its [channel state][transmit-state] owns producer and
consumer closures, and releasing these can run Rust destructors. Jco needs explicit hooks
because losing interest in a JavaScript promise or retaining a stopped instance does not
provide the same deterministic destruction mechanism. Pending JavaScript operations may
remain observable to their callers, so settling them is useful independently of memory
reclamation.

### Resource ownership

Wasmtime's [`Resource<T>` contract][host-resource] leaves host-resource destruction to the
embedder. Normal `Store<T>` destruction drops its host data `T`; [`Store::into_data()`][into-data]
destroys the store while returning that data to the caller. Store destruction is therefore
not a promise to invoke each resource's canonical destructor. Explicit
[`ResourceAny::resource_drop`][resource-drop] is the operation that can invoke such a destructor.

Jco adds an explicit cleanup policy for host objects still owned by the guest. It does not
dispose borrowed host objects or host resources already returned to the caller, and it does
not execute guest Wasm destructors during stop. A value that needs the stopped guest to
execute code can no longer use that guest, even if its JavaScript wrapper remains reachable.

Channel ownership and payload ownership are also separate. After a future delivers its
payload to the host, disposing that future releases the channel without disposing the
delivered value. The recipient owns that value and its eventual cleanup.

### Interruption versus normal end of stream

A Jco host stream read interrupted by instance stop rejects with an error whose `code` is
`"ERR_COMPONENT_STOPPED"`. Subsequent reads on the interrupted stream also reject. Ordinary
EOF remains `done: true`: shutdown does not turn a stream that already ended or was explicitly
closed into an error. Reads that already copied data still deliver it before a later read
reports shutdown. See [Recognize an interrupted stream](./stopping-running-instances.md#recognize-an-interrupted-stream).

The [Canonical ABI's copy results][abi-channel-state] distinguish `COMPLETED`, `DROPPED`, and
`CANCELLED`, but do not carry a reason identifying instance shutdown. `CANCELLED` describes
cancellation of a copy operation; it should not be repurposed as a shutdown reason.
Jco's rejection is an additional host-binding policy. It leaves guest-visible copy result
codes, transferred counts, and ordinary guest drop validation unchanged. It does not require
a matching teardown notification in Wasmtime or other embeddings.

### Waiting and cleanup completion

Waiting for guest task exit, draining output, and completing host disposal are different
conditions. Waiting for guest tasks to exit before calling `stop()` allows application work
to finish normally. Long-lived tasks need an application-specific request to finish, or the
host can choose to abandon them with `stop()`.

A wait that resolves when an instance is stopped establishes that further guest execution
has ended. It does not establish that asynchronous host disposers, network operations, or
output destinations have finished. Hosts that require those guarantees must await the
completion signals supplied by their own providers as well.

Jco's Preview 3 output helpers are one such provider-specific mechanism. See
[Preview 3 output flush and shutdown](./preview3-output-flush-and-shutdown.md) for draining
stdout and stderr. Neither Jco stop nor Wasmtime store destruction is a general graceful
completion protocol for arbitrary external I/O.

### Relationship to the Canonical ABI

Jco's dedicated instance-stop hooks are a host embedding convenience, separate from ordinary
canonical channel drops. They can close pending copies and unwritten future writers during
teardown while preserving the [ordinary guest drop checks][abi-drop]. Wasmtime's store
destruction is likewise a host lifecycle operation. The ABI remains the authority for guest
operations; it does not require identical teardown notifications between the two hosts.

[store-api]: https://docs.wasmtime.dev/api/wasmtime/struct.Store.html
[instance-api]: https://docs.wasmtime.dev/api/wasmtime/component/struct.Instance.html
[wasmtime-revision]: https://github.com/bytecodealliance/wasmtime/commit/67d70b4e192e88faa597008560811dc7e2b1414b
[store-drop]: https://github.com/bytecodealliance/wasmtime/blob/67d70b4e192e88faa597008560811dc7e2b1414b/crates/wasmtime/src/runtime/store.rs#L2498
[concurrent-drop]: https://github.com/bytecodealliance/wasmtime/blob/67d70b4e192e88faa597008560811dc7e2b1414b/crates/wasmtime/src/runtime/component/store.rs#L200
[transmit-state]: https://github.com/bytecodealliance/wasmtime/blob/67d70b4e192e88faa597008560811dc7e2b1414b/crates/wasmtime/src/runtime/component/concurrent/futures_and_streams.rs#L2167
[host-resource]: https://github.com/bytecodealliance/wasmtime/blob/67d70b4e192e88faa597008560811dc7e2b1414b/crates/wasmtime/src/runtime/component/resources/host_static.rs#L60
[into-data]: https://github.com/bytecodealliance/wasmtime/blob/67d70b4e192e88faa597008560811dc7e2b1414b/crates/wasmtime/src/runtime/store.rs#L856
[resource-drop]: https://github.com/bytecodealliance/wasmtime/blob/67d70b4e192e88faa597008560811dc7e2b1414b/crates/wasmtime/src/runtime/component/resources/any.rs#L248
[abi-channel-state]: https://github.com/WebAssembly/component-model/blob/d230073ce81c6634f175b4d0c5ad900b5253f1f4/design/mvp/CanonicalABI.md#stream-and-future-state
[abi-drop]: https://github.com/WebAssembly/component-model/blob/d230073ce81c6634f175b4d0c5ad900b5253f1f4/design/mvp/CanonicalABI.md#-canon-streamfuturedrop-readablewritable
