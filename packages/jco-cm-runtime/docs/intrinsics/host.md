# Host-call contract

`intrinsics/host` satisfies `HostModule` with `prepareCall`, `asyncStartCall`,
`syncStartCall` and the context-free `storeEventInComponentMemory`.
Prepare receives task lookup, creation, may-block and trap capabilities. Start
receives the actual task/register/component-index owners, component lookup and
driver capabilities. Async start also receives the live blocking-depth register,
registered memory map and event codes. These views share existing owners;
selecting a start operation alone does not initialize task classes.

Start contexts retain the selected WebAssembly namespace. Its optional
`promising` method is read only when a callee needs a new JSPI wrapper, called
with that namespace as receiver and cached on that callee. Direct async calls
and cached wrappers do not read it. Metadata and lowered core arguments remain
call operands after context binding; callbacks preserve their null receiver.
Prepare records the executing caller thread, creates the callee's implicit thread,
and selects it in the registers. Return callbacks and suspended-call completion
restore the original caller thread, including its independent context slots.

The event writer validates its memory, pointer and event, writes two
little-endian u32 payloads and returns the event code. Default wait/poll
operations call that static dependency directly. Overriding a sibling host
export does not intercept the default waitable implementation.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)
