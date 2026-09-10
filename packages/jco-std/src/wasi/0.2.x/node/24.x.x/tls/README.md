# Node TLS capability

Target: Node.js **24.20.0**, commit
`71b8b174857e25106d39b61a9e6f30d927da8b01`. The audit used `lib/tls.js`,
`lib/internal/tls/{wrap,secure-context}.js`, and `doc/api/tls.md`.
The rolling Node documentation may describe a newer major release.
`alpn.ts` adapts Node's MIT-licensed protocol conversion and retains its notice.
Cryptography, certificate parsing, and the TLS protocol remain in the injected
provider. The guest reuses the existing portable classic stream implementation.
The audited unenv 2.0.0-rc.24 TLS module consists largely of stubs.

Applications continue to import `node:tls`. Jco replaces that import and adds
`jco:node/tls@0.1.0` plus the `tls-callbacks` guest export. Importing the module
does not open sockets or read the host's trust store. The default provider denies
operations with `ERR_JCO_TLS_ADAPTER_REQUIRED`.

## One TLS capability

`node:tls`, direct HTTPS, and secure direct HTTP/2 use `jco:node/tls`.
HTTP protocols pass one-use TLS configuration handles to their transport host,
so their WIT interfaces no longer duplicate certificate and cipher options.
Bind those HTTP hosts to the **same TLS provider instance**. The native provider
consumes the handle before starting the HTTP operation; handles from another
provider, or already consumed handles, are rejected.

HTTPS over WASI sockets calls `jco:node/tls.start-tls`. `createWasiTlsBridge`
delegates that operation to a supplied `wasi:tls/types@0.2.0-draft` provider and
reuses its future, connection, and WASI IO resources. The draft only supports
verified client stream upgrades. It cannot supply Node servers, per-connection
trust options, certificate inspection, or cipher controls; the bridge denies
those operations. A native provider can also accept `{ wasiTls }` to provide
both paths. The older `/tls/host` exports remain WASI providers for existing
embedders; they are not the primary Node capability.

HTTPS via `wasi-http` is unsupported: outgoing-handler cannot accept the TLS
provider or its configuration. Select `direct` or `wasi-sockets`. HTTP/2 over
WASI sockets remains h2c-only.

## Binding the native provider

Use one factory per component. With Jco's default import mappings and explicit
instantiation, the import keys are the default provider module names:

```js
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { createTlsHost } from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/node-host/node";
import * as wasiTlsTypes from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/host";
import { createHttpHost } from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host/node";
import { createHttp2Host } from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http2/host/node";
import { instantiate } from "./component.js";

const tls = createTlsHost({ onCallbackError: (error) => console.error(error) });
let instance;
instance = await instantiate(undefined, {
  ...new WASIShim().getImportObject(),
  "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/node-host": tls,
  "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/host": wasiTlsTypes,
  "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host": createHttpHost(
    () => instance.httpCallbacks,
    tls,
  ),
  "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http2/host": createHttp2Host(
    () => instance.http2Callbacks,
    tls,
  ),
});
if (instance.tlsCallbacks) tls.attachCallbacks(instance.tlsCallbacks);
// Call component exports. When the component is finished:
// tls.dispose();
```

Transpile with JSPI and promising exports. For direct HTTP, also select async
imports `jco:node/http@0.1.0#request`, `#[method]server.listen`,
`#[method]server.close`, and `#[method]server.get-connections`. Direct HTTP/2 has
the existing async session/stream selectors. Explicit `--map` selections for
the HTTP providers add those selectors automatically. Supplying import objects
at instantiation does not retroactively change the generated binding mode.

The native provider grants native network listeners/connections and trust-store
queries. `setDefaultCACertificates` changes only that provider's trust policy,
including its subsequent HTTPS and HTTP/2 configurations. It does not change
the embedding process's default CA store. Explicit `SecureContext` objects
retain their original trust settings.

`dispose()` destroys sockets, including incomplete handshakes, closes listeners,
and releases contexts. Guest callback traps dispose the provider and are passed
to `onCallbackError`. Standalone contexts and closed server objects remain
provider-owned until disposal, allowing normal inspection and server reuse.

## Supplying your own implementation

Import `TlsHost` and `TlsCallbacks` from `/tls/core`. Start with the deny provider
and replace only the operations your component needs:

```ts
import denied from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/node-host";
import type { TlsHost } from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/core";

const host: TlsHost = {
  ...denied,
  // Implement permitted operations; every other operation still fails explicitly.
};
```

For a WASI provider, `createWasiTlsBridge(provider)` already supplies such an
object. No alias mapping is necessary when supplying the object directly under
the binding's existing import key. A custom HTTP transport must understand its
TLS provider's configuration handles. `TlsConfigurationProvider.takeContextOptions` is the native HTTP adapters' local
integration contract, not an additional WIT import. It is exported as a type from
`/tls/core`; HTTP hosts only require this method from their TLS provider.

The interface groups operations as follows:

| Operations                             | Responsibility                                                       |
| -------------------------------------- | -------------------------------------------------------------------- |
| `query`, `set-default-ca`              | Cipher/CA/identity queries and provider-local trust changes.         |
| `create-context`, `release-context`    | Validate TLS options and manage opaque configuration handles.        |
| `connect`, `create-server`             | Create a transport for the supplied guest identifier.                |
| `socket-operation`, `server-operation` | Closed enums of inspection and control operations.                   |
| `write`, `end`, `release`              | Stream writes, completion acknowledgements, and socket cleanup.      |
| `is-available`, `start-tls`            | Optional upgrades of owned WASI streams using the WASI TLS contract. |

Dispatch events after the initiating import returns. `target` is the guest
socket/server ID. Accepted sockets use a separate positive 31-bit identifier
range. The guest installs an accepted socket when it receives `secureConnection`.
`write` events carry `{ token, error? }` and complete exactly one pending write or
end callback. Pause native reads after delivering a data chunk; the guest's
`resume` operation signals available buffer capacity. `core.ts` and `host-node.ts`
define the event payloads and closed operation argument lists together.

Options and inspection values use `wire.ts`'s graph JSON format, `{ root, nodes }`.
Primitive values are inline; `{ ref: index }` references `bytes`, `array`, or
`object` nodes. Undefined and non-finite numbers have explicit tagged values.
Object nodes contain key/value pairs and may carry an error name. This preserves
binary fields, error codes, and self-signed certificate issuer cycles. Stream
data itself is `list<u8>`, not JSON. Functions and native handles never cross this
boundary. WIT result errors carry `name`, `message`, and optional `code`.

## Compatibility boundaries and fixtures

The full Node 24.20 module export list is present. Local tests cover mutual TLS,
hostname/trust rejection, custom identity checks, ALPN, certificate graphs,
keying material, early `end()`, and backpressure. The component fixture adapts
the documentation's echo client/server to use PEM arguments and finite input
instead of filesystem reads and `process.stdin`. It also exercises HTTPS in
both directions, and the HTTP/2 component fixture exercises the shared provider.

Explicit unsupported operations include wrapping an arbitrary guest socket with
`new TLSSocket`, native `X509Certificate` return values, PSK/SNI/ALPN/lookup
callbacks, OpenSSL engine options, and server `newSession`, `resumeSession`,
`OCSPRequest`, `keylog`, and raw TCP `connection` events. Use `connect`, `getPeerCertificate`,
`getCertificate`, and `Server.addContext` where applicable. Socket `session`,
`keylog`, and `OCSPResponse` events are delivered. Renegotiation limits are host
policy; changing `CLIENT_RENEG_LIMIT` or `CLIENT_RENEG_WINDOW` throws. The socket
is a portable `Duplex`; it is not an instance of the separate `node:net` shim's
Socket class.

StarlingMonkey runs the component fixture. QuickJS is explicitly skipped with
`TODO(unskip)` because componentize-qjs cannot link the shared WASI TLS resource
types. Export a synchronous starter for long-lived event-driven work: a guest
export cannot await a promise resolved solely by a future independent host
callback. The fixture's starter/status exports demonstrate this engine boundary.
