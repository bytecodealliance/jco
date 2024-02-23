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

### `fn[Symbol.for('cabiLower')](memory, realloc, postReturn, stringEncoding, resourceTables) -> coreFn`

A function that has a native optimized implementation, can expose its native optimized bindgen through
a `Symbol.for('cabiLower')` method.

This function takes the following arguments:

* `memory`: The WebAssembly memory object for the component to which we are binding, if needed.
* `realloc`: The realloc function inside of the component we are binding, [per component model semantics](https://github.com/WebAssembly/component-model/blob/main/design/mvp/Binary.md#canonical-definitions), if needed.
* `postReturn`: The post-return function for the call, if needed.
* `stringEncoding`: If needed, with `'utf8'` as the default.
* `resourceTables`: If needed, an ordered list of resource tables in which they uniquely appear in the function parameters of type `ResourceTable[]`.

The return value of this function is then a new function, `coreFn`, which represents an optimized native
function which can be provided as a direct core function import to the `WebAssembly.instantiate` operation
of the core binary for the component being linked, providing a direct host-native binding to the inner core
binary of the component without needing an intermediate lowering operation in the component model semantics.

### `ResourceTable: { head: number, entries: number[] }`

Resource handles are tracked in handle tables, which are represented as slabs with a free list through the JS type defined above.

### `ResourceClass[Symbol.for('cabiResourceDrop')](table: ResourceTable) -> coreFn`

For a given resource class, a `Symbol.for('cabiResourceDrop')` symbol function is defined to obtain a drop function for that resource against the provided resource table.
