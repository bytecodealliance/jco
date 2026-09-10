# `node:https`

| Imports | Implementation |
| --- | --- |
| `node:https` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/https` |

HTTPS shares the [HTTP implementation selection](./http.md), including the
`--with-nodejs-http-via` option.

`node:https` exposes Node 24's six exports: `Agent`, `globalAgent`, `Server`,
`createServer`, `get`, and `request`. `https.Agent` subclasses `http.Agent` on
both prototype chains, keeps Node's `defaultPort`/`protocol`/`maxCachedSessions`
defaults and its TLS session cache, and produces the same 23-field `getName()`
key as Node, so option bags pool the way they would natively. Requests reject
non-`https:` protocols with `ERR_INVALID_PROTOCOL` and elide `:443` from the
authority, and `https.get()` ends the request itself.

TLS options are configured through `jco:node/tls@0.1.0`. Direct HTTP requests
and servers carry a one-use configuration handle, which the HTTP host consumes
from the same TLS provider. Certificate, cipher, ALPN, trust, and SNI settings
have one capability boundary instead of separate HTTP and TLS WIT records.
The existing serializable HTTPS option subset remains supported; native objects
and callback options such as `checkServerIdentity` and `SNICallback` remain
explicitly unsupported by the buffered HTTP adapter.

| Value          | `node:https` behavior                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `direct`       | Clients and servers using `jco:node/http` and `jco:node/tls`. Bind `createHttpHost(callbacks, tls)` to the same TLS provider imported by the component.               |
| `wasi-sockets` | Verified clients call `jco:node/tls.start-tls` over the existing TCP streams. A provider can delegate to `wasi:tls`. The pinned draft does not support HTTPS servers. |
| `wasi-http`    | HTTPS is rejected because outgoing-handler cannot use the TLS capability. Select `direct` or `wasi-sockets`.                                                          |

For WASI stream upgrades, bind `createWasiTlsBridge(yourWasiTlsProvider)` from
`@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/wasi` as the primary
`jco:node/tls` import. The bridge reuses the WASI TLS future, connection, and IO
resources. Only `servername` and `rejectUnauthorized: true` are supported by
that draft; trust and ALPN are provider policy. The optional native TLS factory
also accepts `{ wasiTls: yourWasiTlsProvider }` to serve both transports.
The existing native WASI TLS provider still awaits publication of the
preview2-shim `io-worker` export; the new native Node TLS provider does not
have that dependency.

Projects with checked-in `http.wit` or `http2.wit` dependencies must update them
together with `tls.wit`. Injection adds missing files but never overwrites
existing dependency files. Plain HTTP continues to work without granting TLS.
