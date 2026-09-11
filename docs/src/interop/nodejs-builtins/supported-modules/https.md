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

TLS crosses the component boundary as a typed `tls-options` record on the
`jco:node/http@0.1.0` request and server options. It carries the serializable
subset of Node's `tls.connect` / `tls.createServer` options: `key`, `cert`,
`pfx`, `passphrase`, `ca`, `crl`, `dhparam`, `ciphers`, `ecdhCurve`, `sigalgs`,
`minVersion`, `maxVersion`, `secureProtocol`, `secureOptions`,
`sessionIdContext`, `honorCipherOrder`, `ALPNProtocols`, `servername`,
`rejectUnauthorized`, and `requestCert`. Material fields stay lists, so a
`key: [rsa, ecdsa]` bundle reaches the host intact. Options with no typed
representation -- `checkServerIdentity`, `SNICallback`, `ALPNCallback`,
`pskCallback`, `secureContext`, `session`, `ticketKeys`, and the OpenSSL engine
options -- throw `ERR_JCO_UNSUPPORTED_NODE_API` naming the option rather than
being dropped.

| Value          | `node:https` behaviour                                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `direct`       | Clients and servers. The opt-in Node provider routes `https` requests to `node:https.request` with the carried TLS options, and a server carrying a `tls` record to `node:https.createServer`, so the host's own TLS stack terminates the connection. |
| `wasi-sockets` | Verified clients over the existing TCP streams. TLS connections implicitly require `wasi:tls`, imported automatically for `node:https`. HTTPS servers are unsupported by the pinned client-only draft.                                                |
| `wasi-http`    | Clients only, with the `HTTPS` scheme. `wasi:http/outgoing-handler` owns certificate validation, so any per-request TLS option is refused; servers are rejected as for `node:http`.                                                                   |

TLS support is part of the `wasi-sockets` implementation, which uses the
`wasi:tls` host capability for TLS connections. Explicitly grant it when transpiling:

```sh
jco transpile component.wasm -o out \
  --map 'wasi:tls/types@0.2.0-draft=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/host/node'
```

Sockets and TLS share `wasi:io@0.2.12` stream resources directly. Without this
opt-in, HTTPS fails before connecting, with no plaintext fallback. Plain HTTP
needs no TLS capability.
The Node provider uses `node:tls` over the supplied TCP streams, system trust,
hostname verification, and HTTP/1.1 ALPN. Hosts needing private trust can map the
TLS interface to a module exporting:

```js
import { createTlsProvider } from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/host/node';
export const { ClientHandshake, ClientConnection, FutureClientStreams, isAvailable } = createTlsProvider({
    ca: [trustedCaPem],
    handshakeTimeoutMs: 10_000,
});
```

Based on upstream [`WebAssembly/wasi-tls` at `6781ae26084100c0628ef72cc44e4517c6c48ae5`](https://github.com/WebAssembly/wasi-tls/tree/6781ae26084100c0628ef72cc44e4517c6c48ae5/wit),
Jco's [local contract](https://github.com/bytecodealliance/jco/tree/main/packages/jco/lib/wit/builtin/wasi-tls-0.2.0-draft)
retains `wasi:tls@0.2.0-draft` but uses `wasi:io@0.2.12`, adds `is-available`, and
omits unstable-feature annotations. It is a provisional interface for Node.js,
web, and other host implementations. It exposes client handshake,
future polling, streams, and output shutdown. It has no server handshake,
certificate configuration, or ALPN controls. Only guest `servername` and
`rejectUnauthorized: true` are supported; other TLS options, including `ca`, are
rejected. TLS support is independent of the componentization backend.

> [!NOTE]
> `componentize-qjs` 0.4.3 currently fails during snapshot initialization when linking
> the TLS interface's shared IO resources, even for an otherwise empty component.
> StarlingMonkey is a workaround for this build-time issue.

The temporarily skipped component tests in `https-wasi-tls.ts` include deterministic
local TLS tests and a separately named public test requiring DNS and TCP/443 to
`example.com` (20-second execution deadline).

An `https.Server` always carries its `tls` record, even when no material was
supplied, so an implementation without a TLS stack refuses it; the `direct`
host then behaves like Node, which constructs the server and fails each
handshake. Because `jco:node/http@0.1.0` gained the record in place, a project
whose `wit/deps/jco-node-0.1.0/http.wit` predates it must delete that file so
the next `jco componentize` reinstalls the current interface: injection never
overwrites an existing dependency file.
