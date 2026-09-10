# `node:http`

| Imports | Implementation |
| --- | --- |
| `node:http` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http` |

The `node:http` adapter implements both client and server NodeJS HTTP APIs,
with outbound `request()` and `get()` calls with Node-style `ClientRequest`
and buffered `IncomingMessage` objects along with `http.Server`. [`node:https`](./https.md)
is the same core driven with the `https:` protocol, port 443, and a TLS-aware
`Agent`, exactly as `lib/https.js` reuses `_http_client` and `_http_server`
upstream; it shares the implementation selection below.

As this API obviously requires access to the outside world of some sort, and
there are actually many ways to achieve that on the host side, you must select
the host implementation during componentization:

```console
jco componentize component.js --wit wit --bundle \
  --with-nodejs-http-via wasi-sockets -o component.wasm
```

| Value              | Component boundary                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `direct` (default) | Typed `jco:node/http@0.1.0`; denied by default, with an opt-in Node `node:http` provider.                  |
| `wasi-sockets`     | Preview 2 DNS lookup, TCP sockets, streams, and pollables; HTTP/1.1 framing and parsing live in the guest. |
| `wasi-http`        | Preview 2 `wasi:http/outgoing-handler` and `wasi:http/types`.                                              |

Jco injects only the selected mode's missing imports into the selected world. In
direct mode it also injects the `jco:node/http-callbacks@0.1.0` export and
re-bundles the component entry with the matching guest callback implementation.
Generated declarations include comments, pinned dependencies are installed under
`wit/deps`, and Jco warns about the visible WIT changes. Existing declarations,
including aliases, are preserved and repeated componentization is idempotent.

The `direct` implementation is asynchronous; Jco configures its typed request,
listen, close, and connection-count imports for JSPI so they appear synchronous
to the Preview 2 guest without a worker. Direct and `wasi-sockets` implement
clients and servers. `wasi-http` implements clients and rejects server
construction immediately because outgoing-handler cannot listen for arbitrary
connections.

For direct servers, instantiate with a provider bound to that component's
callback dispatcher. The provider is asynchronous, so select JSPI and its async
imports explicitly; instantiation output keeps the WIT import names and nothing
selects them for you. For example, after transpiling with:

```sh
jco transpile component.wasm -o out --instantiation async \
  --async-mode jspi --async-exports '*' \
  --async-imports 'jco:node/http@0.1.0#request' \
    'jco:node/http@0.1.0#[method]server.listen' \
    'jco:node/http@0.1.0#[method]server.close' \
    'jco:node/http@0.1.0#[method]server.get-connections'
```

```js
import { instantiate } from './component.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { createHttpHost } from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host/node';

let instance;
const imports = new WASIShim().getImportObject();
imports['jco:node/http'] = createHttpHost(() => instance.httpCallbacks);
instance = await instantiate(undefined, imports);
// Await application exports that create or control servers.
await instance.start();
```

Create a separate provider for each component instance. The server holds a
callback registration ID; handlers stay in the guest and run through the
exported dispatcher. The provider serializes callback entry and drains accepted
callbacks before close completes. Closing releases the guest registration;
listening again registers the same server's handler again. Direct client-only
applications can continue mapping the Node provider module without this factory.

> [!WARNING]
> All modes currently buffer complete request and response bodies.

Connection pooling, upgrades, and CONNECT proxy tunnels are explicit gaps.
Unavailable operations throw `ERR_JCO_UNSUPPORTED_NODE_API` rather than silently
doing nothing.
