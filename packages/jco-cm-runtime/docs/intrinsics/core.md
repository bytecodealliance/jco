# Core contract

`intrinsics/core` satisfies `CoreModule`. Pure helpers receive operands only.
Compilation receives the selected WebAssembly methods and the applicable Node
policy; the methods keep their original receiver. File compilation creates its
cache only when selected and loads Node filesystem support only when called.
Optional JSPI constructors are read when their operation needs them.

`initializeTaskRegisters()` returns the actual mutable owner shared by task,
component and resource operations. Metadata operations take that owner explicitly.
Synchronous scopes restore both enclosing registers on success or failure;
asynchronous scopes clear their own registers without clearing a different task.
`initializeComponentMemoryMap()` returns the actual shared memory lookup map.
These initializers return state rather than an operation registry.

Constructor initializers return selected class values once per instantiation.
`initializeRepTableClass({ RuntimeError })` preserves `new`, `instanceof` and its
per-class `FREE` sentinel. `initializeComponentErrorClass()` preserves each
store's error constructor and payload behavior. Managed-buffer and manager class
initializers receive only their resource owners or selected buffer constructor.
Separate instantiations have separate class identities; constructors are never
hoisted into shared module state. Importing this subpath initializes no classes,
maps, symbols, codecs or optional platform facilities.

`initializeHasOwnProperty()` returns the native unbound function selected for
the instantiation. Error extraction receives it explicitly and preserves its
`.call` receiver. Default operations use their own static dependencies; overriding
a sibling task operation does not intercept default resource destructor internals.
The explicit host `instantiateCore` callback retains its existing two-argument
signature and takes precedence over the default named core operation.

Custom providers adopting this compiler must publish the core subpath and update
resource borrow/destructor contexts to receive `registers`; the earlier v1
`getCurrentTask`/`withTask` bridge shapes are replaced by shared state and the
remaining narrowly named task capability.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)

Thread metadata includes `taskID`, `threadID`, and `componentIdx`. The async metadata wrapper preserves a synchronous callback's raw return value and restores its enclosing registers immediately. For promise results it clears only registers still owned by the same task and thread, so an earlier completion cannot clear a later thread. Suspending host calls may complete synchronously without an ambient thread; a returned promise still traps when blocking is disallowed.
