# Preview 3 output flush and shutdown

The Node Preview 3 shim provides host helpers for draining stdout and stderr.
These helpers are useful when a custom host needs to preserve output before
terminating its process.

## Flush queued destination writes

Await `stdout._flush()` or `stderr._flush()` to wait for writes currently queued
on that Node destination. `cli._flush()` waits for both destinations:

```js
import * as cli from '@bytecodealliance/preview3-shim/cli';

await cli._flush();
```

Flushing leaves the component's stream readers open and does not wait for guest
EOF. It covers writes already queued on Node stdout or stderr; it does not wait
for bytes that have yet to reach those destinations.

## Shut down output after production stops

Once a component has stopped producing output, await `stdout._shutdown()` or
`stderr._shutdown()` to close that output's host-owned readers, finish its active
transfers, and wait for queued destination callbacks. `cli._shutdown()` does this
for both streams. The shared Node stdout and stderr writables remain open.

`jco run` calls this helper after a command returns. A custom Node host can use the
same sequence:

```js
import { run } from './command.js';
import * as cli from '@bytecodealliance/preview3-shim/cli';

await run.run();
await cli._shutdown();
```

Producers must stop writing before shutdown begins. New transfers started
afterward are not covered by that shutdown call. Shutdown does not require the
producer to send EOF.

## Exiting immediately

WASI `exit` and `exitWithCode` terminate immediately. They do not flush or shut
down output. A custom host that wants to preserve accepted output before a
nonzero exit can explicitly shut down output first:

```js
import * as cli from '@bytecodealliance/preview3-shim/cli';

// Stop output production before shutting down the host-owned readers.
await cli._shutdown();
cli.exit.exitWithCode(3);
```

A completed component-model stream write acknowledges a copy to the receiving
side, not a flush to the final output destination. These helpers drain data the
host has accepted; they do not guarantee delivery of all guest output on an
abrupt exit or implement a guest stream-completion protocol. See
[Preview 3 streams and backpressure](./preview3-streams-and-backpressure.md) for
more on stream acknowledgements.
