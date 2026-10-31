# Async-task contract

`intrinsics/async-task` satisfies `AsyncTaskModule` with named task and cooperative-thread exports.
Separate initializers return the actual task Map, task-ID array, component-index
array and symmetric-call stack. Two register initializers return distinct selected
native `WebAssembly.Global` instances, preserving raw Wasm imports and live
`.value` mutation. A narrow selected platform differs from `false`, which denotes
an absent WebAssembly implementation: may-block then returns `false`, while
blocking depth returns `{ value: 0 }`. Pure lookup and class selection do not read
an unused optional `Global` capability. `asyncBlockedCode` is context-free.
The platform contract requires only construction of the mutable i32 value slot;
providers need not implement unused native overloads or prototype methods.

The subtask initializer receives component lookup, registered memories, the
disposal symbol and the selected trap constructor. The task initializer additionally receives selected subtask and
waitable constructors, trap/event/determinism capabilities, the actual resource
scope counter and scope-task Map, task clearing owners and registers. They return
fresh classes once per relevant instantiation. Static IDs, `new`, `instanceof`
and live static state remain per store. Subtasks initialize before tasks without
a constructor-cell cycle.

Each task owns an implicit thread and any explicitly spawned threads. Thread IDs
are allocated from the component instance's thread table, independently of waitable
handles. Context slots belong to threads. Lookup validates the task ID as well as
the thread ID so recycled thread indices cannot revive stale register contents.
A task stays addressable until its last thread exits, even after its implicit
thread returns. Host tasks have no guest thread table.

The thread constructor receives component lookup, registers and trap recording.
Thread start validation selects its WebAssembly platform and type-check module
only when `thread.new-indirect` is used. Importing the subpath creates no native
module or store state.

Lookup, creation and clearing take separate explicit contexts. Structural generic
views let consumers require only the task methods they use. Resources, core
suspending wrappers and waitables consume these actual owners; their generated
task callbacks are removed. Defaults compose their own static dependencies, so
sibling overrides do not implicitly intercept internal calls. Initializers select
the constructors and owners shared by those defaults.

Each task groups its private slots in one private record. Constructors, private
brands, prototype methods and static state remain separate for each store;
another store's methods cannot read that task's private state.

Context get/set, cancellation, yield, return, driver and import lowering receive
operation-specific views. Lift/lower callbacks and canonical metadata remain
per-call operands. Existing partial callbacks preserve their null receiver and
operand order. Direct symmetric-call callbacks bind context with `void 0` in
named mode; the suspending wrapper's slow callback preserves its null receiver.
Inline callbacks retain their original function identity. A narrow lazy
future-value predicate remains until the future family migrates; selecting a
class or owner does not invoke it. The host event writer remains until N12.

Custom providers must publish this subpath and replace the old resource, core
and waitable task callbacks with lookup/creation/register owners. The standalone
declaration contains all structural types without private classes, factory
options or a runtime operation registry.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)
