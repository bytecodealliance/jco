# `node:net`

| Imports | Implementation |
| --- | --- |
| `node:net` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/net/core` |

`node:net` implements Node 24.19's 18-export module surface over Preview 2
`wasi:sockets`. It includes TCP `Socket` and `Server`, `BoundSocket`,
`SocketAddress`, `BlockList`, IP-family predicates, overload normalization, and
the auto-family defaults. `connect` and `createConnection` are the same function,
and `Socket` and `Stream` are the same constructor, as in Node.

```js
import { connect, createServer } from 'node:net';

createServer((socket) => socket.end('hello')).listen(8080, '127.0.0.1');

connect(8080, '127.0.0.1').setEncoding('utf8').on('data', console.log);
```

Jco injects only the selected world's Preview 2 DNS, TCP, stream, and pollable
interfaces and their standard WIT packages. QuickJS worlds use 0.2.12;
StarlingMonkey worlds can use 0.2.10. There is no Jco-specific network host
interface and no bare `net` alias.

Preview 2 has no Unix-domain sockets, Windows named pipes, OS file descriptors,
libuv handles, TCP reset, IP type-of-service, or custom JavaScript DNS callback.
Those operations throw `ERR_JCO_UNSUPPORTED_NODE_API`. Address attempts are
sequential rather than reproducing Node's exact Happy Eyeballs timing. Socket
objects provide the common readable/writable methods and events but do not yet
inherit from classic `node:stream.Duplex`, because Jco does not have a faithful
classic stream core.

Reads support Node string encodings, buffered `read()`, and async iteration.
Writable operations complete through blocking WASI writes and do not yet provide
classic stream backpressure. `setNoDelay()`, `ref()`, and `unref()` preserve the
callable surface but cannot control the host's TCP_NODELAY or event-loop references.
Nonzero socket timeouts require an engine with JavaScript timers; engines without
them reject `setTimeout()` explicitly. The deprecated `bufferSize` getter throws
the Jco deprecated-API error; use `writableLength` instead.

Half-close depends on the host honoring WASI's directional `shutdown`. The
Preview 2 Node host shim 0.22.0 currently closes both directions; applications
using that host should let the peer finish its response before closing the
socket's writable side.
