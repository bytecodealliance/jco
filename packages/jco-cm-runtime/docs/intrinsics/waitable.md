# Waitable contract

`intrinsics/waitable` satisfies `WaitableModule`. `initializeWaitableClass()`
takes no context and returns a fresh constructor for the instantiation.
`initializeWaitableSetClass(events)` captures only the selected live
`TASK_CANCELLED` code. Component state receives the same selected waitable
constructor, preserving class identity across tasks, component handles and
`instanceof` checks without a factory callback or constructor dependency cycle.

New-set operations receive the actual component lookup and selected set
constructor. Wait/poll also receive the selected trap constructor, a narrow
task lookup and host event-writer capability; poll alone receives `NONE`.
Drop needs lookup, task metadata, the trap constructor and the selected set
constructor. Join needs lookup and both selected constructors to reject handles
of the wrong kind. Removal needs the trap and set constructors and its
per-call state/handle operand. Memory and canonical options remain per-call
operands rather than shared runtime state.

Task lookup uses its own static default operation and actual state owners.
Only event writing remains a lazy bridge until host operations migrate.
Lookup preserves the generated helper's current-task fallback behavior. Waits
retain their synchronous fast path, cancellation rules, waiter counts and live
memory buffer; pending events are consumed once. Default operations call their
own static dependencies, so overriding a sibling export does not intercept
those calls. Required customization uses the explicit selected capabilities.

Custom providers must publish the waitable subpath and replace the component
constructor's earlier `createWaitable` callback with `Waitable`. Importing the
subpath allocates no store state and reads no optional platform facilities.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)
