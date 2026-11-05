# Preview 3 output flush and shutdown

The Preview 3 shim provides host helpers for draining stdout and stderr in
Node.js and browser environments. These helpers are useful when a custom host
needs to preserve output before exiting or disposing its component.

## Flush queued destination writes

Await `stdout._flush()` or `stderr._flush()` to wait for writes currently queued
on that output destination. `cli._flush()` waits for both destinations:

```js
import * as cli from '@bytecodealliance/preview3-shim/cli';

await cli._flush();
```

Flushing leaves the component's stream readers open and does not wait for guest
EOF. It covers writes already queued on stdout or stderr; it does not wait
for bytes that have yet to reach those destinations.

## Shut down output after production stops

Once a component has stopped producing output, await `stdout._shutdown()` or
`stderr._shutdown()` to close that output's host-owned readers, finish its active
transfers, and await destination completion. `cli._shutdown()` does this for both
streams. The shared output destinations remain open.

`jco run` calls this helper after a command returns. A custom host can use the
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

## Destination acknowledgements

On Node.js, the helpers wait for the stdout and stderr writables' callbacks. In
the browser, they call the existing output handlers' flush operations. The
default browser handlers write to the console.

For buffered or asynchronous browser destinations, pass an optional drain
callback to `_setStdout(handler, drain)` or `_setStderr(handler, drain)`. The
callback must finish after previously queued writes reach the destination's
acknowledgement boundary, and reject if delivery fails:

```js
import * as cli from '@bytecodealliance/preview3-shim/cli';

function connectBufferedStdout(sink) {
    cli._setStdout({ write: (bytes) => sink.enqueue(bytes.slice()) }, () => sink.drain());
}

// After configuring the sink, await cli.stdout._flush() or cli._shutdown().
```

The copy allows the sink to retain bytes after the synchronous write handler
returns. Existing one-argument setters and stream-write completion behavior are
unchanged. The drain callback is used only by the new lifecycle helpers.

Without a drain callback, browser flushing retains the synchronous handler's
guarantees. The shim cannot infer completion of asynchronous work hidden inside
a handler. A successful flush does not guarantee that the browser rendered the
output, or that a downstream consumer processed it.

## Exiting immediately

WASI `exit` and `exitWithCode` signal exit immediately. Node.js terminates the
process; the browser shim throws its component-exit signal for the host to
handle. Neither path flushes or shuts down output. A custom host can explicitly
shut down output first:

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
