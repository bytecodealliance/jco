# Component contract

`intrinsics/component` satisfies `ComponentModule`. Separate selected initializers
return the actual instance-flag Map, store-trap error cell, store scheduling owner
and component async-state Map. Trap-message initialization receives only the
compiler's message record. Generated bindings share these owners with
tasks and waitables; no universal options object or operation registry is needed.

`checkMayLeave` and its receiver-preserving guard need only instance flags and the
selected trap constructor. Trap normalization receives that constructor and the
actual message lookup. Deadlock checking uses the shared trap, scheduling and
async-state owners; host-operation tracking also receives the selected disposal
symbol. It preserves synchronous results, counts pending asynchronous wake sources
and forwards disposal with the host value's receiver.

`initializeComponentAsyncStateClass(context)` returns a per-instantiation class,
with its own statics and identity. It receives the selected representation-table
constructor, shared handle allocator and flag/trap owners, narrow normalization
and deadlock contexts, and the actual selected `Waitable` constructor. State
lookup receives the selected class and actual state Map. Handles
share the component allocator with resources; subtasks keep their own table.
The class preserves FIFO lock handoff and admission, one resumption per tick,
backpressure accounting and trap interruption. Backpressure waiters resolve only
at zero, once each, including under reentrant handlers; both inline and named
implementations use the same corrected event-driven algorithm.

Core suspending-import contexts now receive `mayLeave`, `traps` and `states`
component contexts, the actual task lookup owner and selected may-block register.
Custom providers adopting this compiler must publish the component subpath and
replace the earlier core `checkMayLeave`, `recordTrap` and `throwIfInterrupted`
callbacks with these actual contexts. Defaults use their own static operation
dependencies; overriding a sibling export does not implicitly intercept them.
Importing the module creates no state, timers, classes or waitables.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)

The component owns a separate thread table. Suspension records are keyed by thread identity, so several threads belonging to the same task can wait independently. Each scheduler tick resumes at most one thread; explicit suspension, readiness, cancellation, and traps retain the inline runtime's behavior. Task-ID scheduling methods delegate to those thread records.
