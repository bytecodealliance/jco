# `node:inspector`

| Imports | Implementation |
| --- | --- |
| `node:inspector`, `node:inspector/promises` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/inspector` |

`node:inspector` (and `node:inspector/promises`) exposes the V8 inspector: a `Session` speaking the
Chrome DevTools Protocol, the inspector `console`, and the experimental `Network`/`DOMStorage`
broadcast namespaces. The inspector is host machinery -- a WebSocket server and a protocol
dispatcher wired into the running isolate -- so WASI cannot express it. Like `node:child_process`,
it is host-backed and **denied by default**.

Map it to the Node passthrough to grant it:

```console
jco transpile component.wasm \
  --map 'jco:node/inspector@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/inspector/host/node'
```

The guest code is ordinary Node:

```js
import { Session } from 'node:inspector/promises';

const session = new Session();
session.connect();
const { result } = await session.post('Runtime.evaluate', { expression: '6 * 7' });
result.value; // 42, evaluated in the host isolate
```

Argument validation, session state, the `EventEmitter` surface, and error reconstruction all run
guest-side, so `ERR_INSPECTOR_NOT_CONNECTED`, `ERR_INSPECTOR_ALREADY_CONNECTED`,
`ERR_INVALID_ARG_TYPE`, and the protocol's `ERR_INSPECTOR_COMMAND` all match Node exactly. CDP
payloads cross the boundary as JSON; the inspector `console` forwards its arguments as JSON too,
which is best-effort for functions, symbols, and cycles.

## The host calls back into the component

The inspector's two callbacks -- a `post` response and a session notification -- run the other way,
from host to guest. A component cannot implement a resource declared on an _imported_ interface (its
methods would run host-side), so the callbacks are a guest-**exported** interface,
`jco:node/inspector-callbacks@0.1.0`, holding one resource per callback kind: a one-shot
`post-callback` and a long-lived `notification-listener`. When bundled source imports
`node:inspector`, Jco adds both the `import jco:node/inspector@0.1.0;` and the matching
`export jco:node/inspector-callbacks@0.1.0;` to the selected world, and bundles the JS export
alongside the entry -- neither is written by hand.

The embedder wires the exported interface to the host adapter after instantiation:

```js
import * as inspectorHost from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/inspector/host/node';
import * as component from './transpiled/component.js';

inspectorHost.attachCallbacks(component.inspectorCallbacks);
```

Two timing rules follow from the component model, which forbids calling into a component while a
task is already active in it:

- **In-isolate `post` responses are synchronous.** `Runtime.evaluate`, `Debugger.*`, and the other
  in-isolate methods resolve during the post call, so the host returns the response directly and an
  awaited `Session.post` never needs a re-entrant callback. This is the same behavior as Node, which
  also fires those callbacks synchronously.
- **Notifications arrive between guest tasks**, like `node:cluster`'s events: the host queues each
  notification and delivers it once no exported call is in flight, never into a suspended `await`.
