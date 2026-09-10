# `node:http2`

| Imports | Implementation |
| --- | --- |
| `node:http2` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http2` |

Client and server code uses Node's normal session and stream APIs:

```js
import { connect, createServer } from 'node:http2';

export function requestStatus(authority) {
    const session = connect(authority);
    const stream = session.request({ ':path': '/status' });
    stream.end();
    return session;
}

export const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end(`received ${request.url}`);
});
```

Select its implementation independently:

```console
jco componentize component.js --wit wit --bundle \
  --with-nodejs-http2-via direct -o component.wasm
```

| Value              | Behavior                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `direct` (default) | Typed `jco:node/http2@0.1.0`, denied by default; an opt-in Node host uses real h2c and TLS/ALPN clients and servers.                                         |
| `wasi-sockets`     | Cleartext prior-knowledge HTTP/2 (`h2c`) clients and TCP servers, with guest-side framing, HPACK, settings, ping, reset, and stream/connection flow control. |
| `wasi-http`        | Rejects sessions and servers: outgoing-handler cannot expose observable Node sessions, stream control, or arbitrary inbound listeners.                       |

By default, cleartext operations fail with `ERR_JCO_HTTP2_ADAPTER_REQUIRED`;
secure operations first require `jco:node/tls` and fail with
`ERR_JCO_TLS_ADAPTER_REQUIRED` when it is denied. Direct secure sessions and
servers obtain one-use configuration handles from the TLS provider. Bind it
with `createHttp2Host(() => instance.http2Callbacks, tls)`.

`direct` mode models sessions, streams, and servers as typed host-owned WIT
resources, with a passthrough implementation to NodeJS underneath. The WIT
interface used is `jco:node/http2-callbacks@0.1.0`.

> [!NOTE]
> Under WASI p2, Bodies are currently buffered; low-level sockets, priority,
> push, flow-control windows, and operations that cannot cross the boundary
> throw explicit errors.

The `wasi:sockets` implementation also deliberately omits server push, HTTP/1.1 `Upgrade: h2c`,
Unix-domain sockets, and Node's arbitrary `createConnection`/custom duplex
transport hooks.
