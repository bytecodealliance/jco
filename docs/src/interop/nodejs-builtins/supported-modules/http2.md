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

By default, the provider rejects both `connect()` and server construction with
`ERR_JCO_HTTP2_ADAPTER_REQUIRED`.

`direct` mode models sessions, streams, and servers as typed host-owned WIT
resources, with a passthrough implementation to NodeJS underneath. The WIT
interface used is `jco:node/http2-callbacks@0.1.0`.

> [!NOTE]
> Under WASI p2, Bodies are currently buffered; low-level sockets, priority,
> push, flow-control windows, and operations that cannot cross the boundary
> throw explicit errors.

Servers support response trailers through `Http2ServerResponse.addTrailers()`
and `setTrailer()`, or through `stream.respond(headers, { waitForTrailers: true })`
followed by `stream.sendTrailers()` in the `wantTrailers` event. Both `direct`
and `wasi-sockets` send the trailers after the buffered body. This supports unary
gRPC calls, including `grpc-status` and application metadata.

Request trailers and incremental response streaming remain unsupported. The
[Node gRPC example](https://github.com/bytecodealliance/jco/tree/main/examples/components/node-grpc-server)
runs the same server source in native Node and in a transpiled component.

The `http2-callbacks.outgoing-response` WIT record now includes `trailers`.
Update checked-in `wit/deps/jco-node-0.1.0/http2.wit` copies when rebuilding:
Jco adds missing dependency files but does not overwrite existing ones. Custom
callback providers must return the new list, which may be empty.

The `wasi:sockets` implementation also deliberately omits server push, HTTP/1.1 `Upgrade: h2c`,
Unix-domain sockets, and Node's arbitrary `createConnection`/custom duplex
transport hooks.
