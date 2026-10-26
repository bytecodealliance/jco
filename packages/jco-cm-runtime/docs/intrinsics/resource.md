# Resource table contract

```js
import { tableGet } from '@bytecodealliance/jco-cm-runtime/intrinsics/resource';

const context = { RuntimeError: WebAssembly.RuntimeError };
const entry = tableGet(context, [1 << 30, 0, 7, 42 + 2 ** 32], 1);
// { rep: 42, scope: 7, own: true }
```

Generated bindings create one stable `ResourceTableGetContext` after selecting
their WebAssembly implementation: once per explicit `instantiate` call, or once
per direct module evaluation. It contains only `RuntimeError`. Tables and handles
are operands; tables remain shared with inline resource operations in that store.
The function has no receiver dependency. It must use the supplied constructor for
traps, including when the global WebAssembly implementation is absent or differs.
No codecs, scratch arrays, scheduler or optional JSPI facilities are initialized
by this operation or by importing runtime metadata.

`tableGet(context, table, handle)` reads an array-like table without changing it
and returns `{ rep, scope, own }`.

- Slots 0 and 1 form a sentinel; resource handles start at 1. Indices are shared
  by all handle kinds of a component instance, so a table may contain holes.
- Slot `handle << 1` holds the scope; bit 30 marks a freed entry.
- Slot `(handle << 1) + 1` holds an unsigned 32-bit representation. Owned entries
  store the representation plus `2 ** 32`; subtract that value to obtain `rep`.
  A freed entry stores zero.
- A representation of zero is valid for both owned and borrowed entries. Only
  handle index zero is reserved.
- A missing slot or freed entry traps with
  `unknown handle index <handle>` using `context.RuntimeError`.

The API version is currently 1. See the [runtime API](../runtime.md) for module contracts.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)
