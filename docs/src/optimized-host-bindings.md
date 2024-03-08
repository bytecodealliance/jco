# Host Bindings

The default mode for host bindings in JS hosts in Jco is through the high-level JS-based bindgen.

The benefit of this approach is that all host bindings are available as normal JS imports. For
example, JavaScript developers can directly import a function like
`import { getRandomBytes } from 'wasi:random/random'`, and directly interact with the bindings
at a high level.

This also makes it easy to provide custom or virtual implementations for bindings using the same
host semantic conventions.

But for performance-sensitive applications, host bindings still need to have a fast path for
optimized bindgen.

## Using Native Host Bindings

Given a JS host that implements such a binding, the `--import-bindings` flag may be used to customize
which host bindings mode to use:

* The default bindgen mode is `--import-bindings=js` using high-level JS bindings for all imports.
* When generating `--import-bindings=hybrid`, Jco will still generate the high-level bindgen for all imports, but
  check for a `Symbol.for('cabiLower')` and use this optimized bindgen when available on a function-by-function
  basis.
* For `--import-bindings=optimized`, Jco will omit outputting the high-level JS bindgen for imports, and instead use
  the low-level bindgen function directly, assuming `Symbol.for('cabiLower')` is defined on all imports.
* For `--import-bindings=direct-optimized`, instead of reading a `Symbol.for('cabiLower')`, Jco will assume that
  imports are all these lower functions instead (useful in instantiatio mode).

This scheme implies instantiation mode to provide the host bindings, or for the host to support
providing the imports as a host ESM import scheme such as `import { getRandomBytes } from 'wasi:random/random'`.

## Optimized Host Bindings Spec

### `fn[Symbol.for('cabiLower')](canonOpts) -> coreFn`

A function that has a native optimized implementation, can expose its native optimized bindgen through
a `Symbol.for('cabiLower')` method, taking a `canonOpts` object.

The following `canonOpts` fields may be defined as needed:

* `memory`: The WebAssembly memory object for the component to which we are binding, if needed.
* `realloc`: The realloc function inside of the component we are binding, [per component model semantics](https://github.com/WebAssembly/component-model/blob/main/design/mvp/Binary.md#canonical-definitions), if needed.
* `postReturn`: The post-return function for the call, if needed.
* `stringEncoding`: If needed, with `'utf8'` as the default.
* `resourceTables`: If needed, an ordered list of resource tables in which they uniquely appear in the
function parameters and results of type `ResourceTable[]`.

The return value of this function is then a new function, `coreFn`, which represents an optimized
native function which can be provided as a direct core function import to the
`WebAssembly.instantiate` operation of the core binary for the component being linked, providing a
direct host-native binding to the inner core binary of the component without needing an intermediate
lowering operation in the component model semantics.

### `ResourceTable: number[]`

Resource handles are tracked in handle tables, a set of shared slab data structures primarily
relating handles to resource ids (reps) for the particular table. Each resource usually has a unique
handle table assign for every component it is used in.

When handles are passed between component functions, resource state needs to be maintained between
these tables, therefore in optimized bindgen, this shared state needs to be operated on. For example,
resource creation creates an own handle in the table for that resource of the component caller,
requiring the creator to populate a table of the caller.

In optimized bindgen, this is acheived by mutating the data structure accordingly. Great care needs
to be taken to ensure the full component model semantics are followed in this process.

The implementation here is based on a JS array of integers. This is done instead of using typed
arrays because we need resizability without reserving a large buffer like resizable typed arrays
might for the same use case (and unless that changes in future).

The number bits are the lowest 29 bits, while the flag bit for all data values is 1 << 30. We avoid
the use of the highest bit entirely to not trigger SMI deoptimization.

Each entry consists of a pair of u32s, with each pair either a free list entry, or a data entry.

#### Free List Entries:

 |    index (x, u30)   |       ~unused~      |
 |------ 32 bits ------|------ 32 bits ------|
 | 01xxxxxxxxxxxxxxxxx | ################### |

Free list entries use only the first value in the pair, with the high bit always set
to indicate that the pair is part of the free list. The first entry pair at indices
0 and 1 is the free list head, with the initial values of 1 << 30 and 0 respectively.
Removing the 1 << 30 flag gives 0, which indicates the end of the free list.

#### Data Entries:

 |    scope (x, u30)   | own(o), rep(x, u30) |
 |------ 32 bits ------|------ 32 bits ------|
 | 00xxxxxxxxxxxxxxxxx | 0oxxxxxxxxxxxxxxxxx |

Data entry pairs consist of a first u30 scope value and a second rep value. The field
is only called the scope for interface shape consistency, but is actually used for the
ref count for own handles and the scope id for borrow handles. The high bit is never
set for this first entry to distinguish the pair from the free list. The second value
in the pair is the rep for the resource, with the high bit in this entry indicating
if it is an own handle.

The free list numbering and the handle numbering are the same, indexing by pair, so to
get from a handle or free list numbering to an index, we multiply by two.

For example, to access a handle n, we read the pair of values n * 2 and n * 2 + 1 in
the array to get the context and rep respectively. If the high bit is set on the
context, we throw for an invalid handle. The rep value is masked out from the
ownership high bit, also throwing for an invalid zero rep.

### `resourceInstance[Symbol.for('cabiRep')]`

Normally imported resource classes do not have to define any special symbols, as they are assigned
rep numbers when passed in.

When using hybrid or optimized bindgen, high-level functions may still return and take high-level
resource classes as parameters. For example, a resource type used optimized in import bindgen might
still be constructible elsewhere to be passed in as a parameter to an exported function of a
component attached to that optimized low-level import bindgen.

As a result, when using low-level bindgen, any high-level resource instances MUST define a
`Symbol.for('cabiRep')` symbol in order for these resources to correctly interact with low-level
bindgen functions referring to those same resources.

### `ResourceClass[Symbol.for('cabiDispose')](rep) -> void`

Just like `Symbol.dispose` is used in high-level bindgen for imported resources to provide a
destructor for when an own handle to a resource is dropped, low-level bindgen provides this hook
for imported resources through the `cabiDispose` function.

The `Symbol.for('cabiDispose')` function is an optional destructor which is available as a direct
static method on the imported resource class.

Unlike the other low-level functions, this one does not need to be bound and is called directly, as
it takes the rep directly to handle internal destructor mechanisms.

Imported resources created externally are always "captured" explicitly when passed in to high-level
functions, even when defining `Symbol.for('cabiRep')`, so any GC is implicitly averted. In these
capture cases their `resourceInstance[Symbol.dispose]()` disposal will always be called instead
of `cabiDispose`, even if they do not define a `Symbol.dispose`. This allows any custom GC hooks to
apply correctly.
