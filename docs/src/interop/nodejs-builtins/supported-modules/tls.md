# `node:tls`

| Imports | Implementation |
| --- | --- |
| `node:tls` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls` |

`node:tls` targets Node 24.20.0 and exposes its complete module export list.
An injected `jco:node/tls@0.1.0` provider supplies encrypted sockets, listeners,
secure contexts, certificate inspection, cipher/CA queries, and TLS controls.
The guest socket uses the portable classic `Duplex` implementation for pipes
and backpressure. Importing the module grants no capabilities; the default
provider throws `ERR_JCO_TLS_ADAPTER_REQUIRED` when used.

Use `createTlsHost()` from
`@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/node-host/node` for an
opt-in native provider, one instance per component. Supply it directly as the
TLS import, then call `tls.attachCallbacks(instance.tlsCallbacks)` for
standalone TLS socket events. Pass that same object to `createHttpHost` and
`createHttp2Host` when binding HTTPS or secure HTTP/2. Call `tls.dispose()`
when the component is finished. Default CA changes are local to this provider,
including its HTTP configuration handles; they do not change host-process trust.

The [TLS provider contract](https://github.com/bytecodealliance/jco/blob/main/packages/jco-std/src/wasi/0.2.x/node/24.x.x/tls/README.md)
includes a complete instantiation example, the typed `TlsHost` boundary,
WASI delegation, event ordering, resource ownership, and compatibility limits.
Custom providers can extend the deny implementation and replace the operations
they permit. Unsupported operations fail explicitly, including native socket
wrapping, native X509 objects, synchronous PSK/SNI/ALPN callbacks, and server
session/OCSP callbacks. Use certificate records and `Server.addContext` where
applicable.

The documentation echo fixture runs as a StarlingMonkey component and includes
HTTPS client/server coverage. QuickJS remains skipped with `TODO(unskip)`
because componentize-qjs cannot link the shared WASI TLS resource types. For
long-lived socket work, use a synchronous starter export and receive subsequent
events through the callback export; an export cannot await a promise resolved
solely by an independent future host callback.
