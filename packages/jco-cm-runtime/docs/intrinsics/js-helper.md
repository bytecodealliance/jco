# JavaScript helper contract

`intrinsics/js-helper` satisfies `JsHelperModule`. `emptyFunc(...args)` is a
context-free no-op. `initializeDataViewCache()` creates a `DataViewCacheContext`
containing only a mutable `view`. `dataView(context, memory)` returns that view
when its buffer matches `memory.buffer`, or replaces it with a new view. Generated
bindings create this cache only when a memory load or store selects `dataView`,
once per instantiation. Memory growth and switches between memories refresh the
same live cache owner; independent instantiations have independent caches.

Importing either function allocates no cache. Providers implementing earlier v1
output must add this named subpath when adopting this compiler. A provider may
wrap `dataView` while re-exporting the other defaults; each default uses its own
static implementation dependencies.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)
