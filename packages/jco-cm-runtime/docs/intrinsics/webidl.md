# WebIDL contract

`intrinsics/webidl` satisfies `WebIdlModule`.
`initializeWebIdlProxyCache()` returns only `{ proxy: undefined }`;
`globalThisIdlProxy(context)` lazily creates and caches the adapter over the host's
`globalThis`. Importing the subpath or creating the empty cache constructs no
proxy or symbols. Each selected cache owns its adapter and private symbols.

Generated direct-module bindings initialize this context before WebIDL import
destructuring invokes the adapter. Explicit `instantiate` calls use their supplied
imports and select no WebIDL cache. Accessor/setter conventions, HTML/DOM name
normalization, method receivers, proxy argument unwrapping and reflection retain
inline behavior. Native methods that require a receiver still fail when
destructured and called without it. Available properties depend on the host's Web
APIs. Custom API-v1 runtimes must publish this new subpath when adopting this
compiler's direct WebIDL output; they may re-export the matching defaults.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)
