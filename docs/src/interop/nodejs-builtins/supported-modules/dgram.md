# `node:dgram`

| Imports | Implementation |
| --- | --- |
| `node:dgram` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dgram` |

Application code keeps ordinary Node imports:

```js
import { createSocket } from 'node:dgram';

let socket;
export function start() {
    socket = createSocket('udp4');
    socket.on('message', (message, remote) => {
        socket.send(message, remote.port, remote.address);
    });
    return socket.bindSync({ address: '127.0.0.1', port: 0 }).port;
}
export function stop() { socket.close(); }
```

Use a world exporting `start: func() -> u16` and `stop: func()`, then build
with `jco componentize source.js --bundle --backend starlingmonkey -w wit -o app.wasm`.
Jco installs `jco:node/dgram@0.1.0` and the guest-exported
`jco:node/dgram-callbacks@0.1.0` interface. UDP adds no unrelated WASI imports.
The default provider returns a catchable `ERR_JCO_DGRAM_ADAPTER_REQUIRED` error
on capability use; importing, constructing, ref/unref, and closing an unused
socket need no host access.

To grant UDP access, transpile for explicit instantiation:

```console
jco transpile app.wasm -o out --instantiation async \
  --async-mode jspi --async-exports '*' \
  --map 'jco:node/dgram@0.1.0=udp-host'
```

Wire a separate Node provider to each instance:

```js
import { instantiate } from './out/app.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { createDgramHost } from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dgram/host/node';

const imports = new WASIShim().getImportObject();
let instance;
imports['udp-host'] = createDgramHost(() => instance.dgramCallbacks);
instance = await instantiate(undefined, imports);
const port = await instance.start();
// Send datagrams to 127.0.0.1:port, then call await instance.stop().
```

The guest implements Node v24.20.0's socket state, overloads, Buffer messages,
lookup customization, block lists, AbortSignal, events, and disposal. IPv4/IPv6,
bind/connect (including their synchronous forms), sends, address queries,
broadcast, multicast memberships, buffer options, and ref/unref use the typed UDP
provider. Host errors preserve codes, errno, address/port, syscall, and buffer
SystemError details. Native descriptors and shared cluster-handle adoption throw
`ERR_JCO_UNSUPPORTED_NODE_API`. The deprecated `_createSocketHandle`,
`_handle`, `_receiving`, `_bindState`, `_queue`, `_reuseAddr`,
`_healthCheck`, and `_stopReceiving` entries immediately throw
`ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`; legacy `sendto` remains functional.

The Node provider requires native `bindSync` and `connectSync` (available in
Node 24.20.0). It queues datagrams, DNS results, and send completions through the
component's callback exports. Return from exported guest tasks before waiting for
these events on the host; awaiting a future UDP event inside an active guest task
would require component re-entry. Guest-local microtasks replace Node's nextTick
scheduling, and native async-hooks IDs do not cross the boundary. QuickJS currently
traps on host-invoked exported resource methods, so its tests cover the module,
validation, and denial; full UDP component tests use StarlingMonkey. Multicast and
reuse-port availability depend on the host OS.

The implementation adapts MIT-licensed Node
[lib/dgram.js](https://github.com/nodejs/node/blob/71b8b174857e25106d39b61a9e6f30d927da8b01/lib/dgram.js)
and its internal handle/lookup flow at v24.20.0. Provenance and the license remain
in the source and emitted JavaScript. Audited unenv 2.0.0-rc.24 dgram is a mock
with no-op network methods and fixed addresses/buffer sizes, so Jco uses its own
adapter and reuses the already-supported Buffer/EventEmitter cores. Only
`node:dgram` is intercepted; bare `dgram` is unchanged. Direct jco-std
adapters can coexist with bundled Node builtins.
