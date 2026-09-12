# Worker threads

`node:worker_threads` targets Node 24.20.0. Jco provides a guest adapter and an
opt-in Node host provider for real worker execution. A worker script runs on the
Node host; it is not another JavaScript isolate inside the Wasm component.
File paths and file URLs therefore refer to the host filesystem. `eval: true`
runs CommonJS source; file and data URLs can load ES modules.

## Granting worker execution

Bundle ordinary Node imports:

```js
import { Worker } from 'node:worker_threads';

export function start() {
    const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        parentPort.postMessage(workerData * 2);
    `, { eval: true, workerData: 21 });
    worker.on('message', value => console.log(value));
    worker.on('error', error => console.error(error));
}
```

```sh
jco componentize app.js --wit wit --bundle -o app.wasm
```

Jco adds `jco:node/worker-threads@0.1.0` and its callback export to the world.
The default provider denies worker creation with
`ERR_JCO_WORKER_THREADS_ADAPTER_REQUIRED`. An import alone grants no execution
capability. To allow workers, instantiate with a separate provider for each
component:

```sh
jco transpile app.wasm -o out --instantiation async \
  --async-mode jspi --async-exports '*' \
  --map jco:node/worker-threads@0.1.0=jco:node/worker-threads@0.1.0
```

```js
import { instantiate } from './out/app.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { createWorkerThreadsHost } from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/worker-threads/host/node';

let instance;
const imports = new WASIShim().getImportObject();
imports['jco:node/worker-threads@0.1.0'] = createWorkerThreadsHost(
    () => instance.workerThreadsCallbacks,
);
instance = await instantiate(undefined, imports);
await instance.start();
```

Create workers inside exported functions, after instantiation. The provider
serializes callback entry and resource disposal. It delivers `online`, `message`,
`messageerror`, `error`, and `exit` events. Exports that start workers should return
so the host can deliver events between component calls. `terminate()` resolves
when the exit callback arrives; `ref()`, `unref()`, and asynchronous disposal are
supported. Workers use the same EventEmitter adapter as `node:events`.

StarlingMonkey supports these callbacks. QuickJS can use the module's local APIs
and observe capability denial, but its exported-resource callback limitation
currently prevents the real-worker component test from running.

## Messages and environment data

Messages and `workerData` cross WIT using a structured-value graph. It preserves
plain records, sparse arrays, cycles, shared references, `undefined`, bigints,
special numbers, Map, Set, Date, RegExp, ArrayBuffer and typed-array/DataView
slices. Buffer arrives as Uint8Array, as in native worker messaging.

Functions and symbols cannot be cloned. Accessor properties, custom prototypes,
Error objects, SharedArrayBuffer, native handles and transfer lists are explicitly
unsupported. Rejected values never silently become lossy JSON. An unsupported
message from the host produces `messageerror`. Transferable ownership and shared
memory are not emulated.

`setEnvironmentData()` and `getEnvironmentData()` use a separate Map per component.
Values retain their identity locally; setting `undefined` deletes a key. Each
worker receives a snapshot when constructed. `markAsUncloneable()` is enforced
by this adapter's outgoing message and worker-data serializer, including nested
values. `markAsUntransferable()` and `isMarkedAsUntransferable()` track object
identity. These marks do not change the engine's global `structuredClone()` or
other APIs outside this adapter.

The guest reports its own main-thread context: `isMainThread: true`,
`isInternalThread: false`, `threadId: 0`, empty `threadName` and `resourceLimits`,
and null `parentPort`/`workerData`. Code executed in a native worker observes
Node's actual worker-thread fields instead.

## Explicit limits

The public export names match Node 24.20.0. The following operations throw
`ERR_JCO_UNSUPPORTED_NODE_API` immediately:

- MessageChannel, MessagePort and BroadcastChannel construction and operations;
- `receiveMessageOnPort()`, `moveMessagePortToContext()` and `postMessageToThread()`;
- `locks.request()` and `locks.query()`;
- `SHARE_ENV`, transfer lists and worker stdio redirection;
- Worker stdio accessors, performance telemetry, heap snapshots/statistics and
  CPU/heap profiling.

The provider executes trusted host-side Node code with the host's authority. It
does not automatically bundle worker entry files or reinterpret them as guest
components. The limited unenv worker implementation was rejected because its
workers and ports discard messages and its broadcasts are no-ops. This adapter
reuses Jco's callback, error and event infrastructure and Node's native Worker;
the environment Map operations are adapted from Node's MIT-licensed
`lib/internal/worker.js` at commit `71b8b174857e25106d39b61a9e6f30d927da8b01`.
