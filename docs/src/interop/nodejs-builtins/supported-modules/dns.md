# `node:dns`

| Imports | Implementation |
| --- | --- |
| `node:dns`, `node:dns/promises` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dns` |

`node:dns` and `node:dns/promises` share one guest implementation and the
`jco:node/dns@0.1.0` capability. Jco adds that import and its `dns.wit`
dependency when bundled source uses either specifier. The default provider throws
`ERR_JCO_DNS_ADAPTER_REQUIRED`; applications opt into Node name resolution with:

```console
jco transpile component.wasm \
  --map 'jco:node/dns@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dns/host/node'
```

The WIT interface represents each DNS operation as a named, typed function; it
does not tunnel requests through a serialized dispatcher. The Node provider calls
the real asynchronous `node:dns/promises` operations directly. When an application
supplies a DNS host map, Jco automatically enables JSPI for every function in
`jco:node/dns@0.1.0`. The Preview 2 WIT calls therefore remain synchronous from the
guest's perspective without blocking Node's event loop or creating a worker for
each query. Because any component export may transitively call DNS, mapped
components expose promise-returning exports that JavaScript hosts must await.
Callback APIs retain callback delivery in the guest, and the promises subpath
shares server and default-result-order state with the main module.

`Resolver.cancel()` throws `ERR_JCO_UNSUPPORTED_NODE_API`. The synchronous WIT
boundary does not expose an outstanding c-ares request that a later guest call
could cancel. The provider boundary otherwise remains Node-independent, leaving
room for a future browser implementation.
