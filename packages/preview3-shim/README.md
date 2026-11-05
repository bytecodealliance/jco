# Preview3 Shim

[WebAssembly System Interface (WASI) Preview 3][wasi] implementations for NodeJS & browsers.

Similar to the [Preview 2 Shim][p2-shim], the P3 shim makes available WASI
interfaces for [WebAssembly Components][cm-book] that make use of them.

[wasi]: https://github.com/webassembly/wasi
[cm-book]: https://component-model.bytecodealliance.org/
[p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim

### Output flush and shutdown

Node.js and browser hosts can await `stdout._flush()` or `stderr._flush()` to drain
writes currently queued on that output destination. `cli._flush()` waits for both. These
helpers leave the component's stream readers open and do not wait for guest EOF.

Once a component has stopped producing output, hosts can call
`stdout._shutdown()` or `stderr._shutdown()` to close that output's host-owned
readers, finish its active transfers and await destination completion.
`cli._shutdown()` does this for both streams. The shared destinations remain
open. `jco run` calls this helper after a command returns.

On Node.js, completion waits for the writable's callbacks. In the browser, the
helpers invoke the existing output handler's flush operation. Buffered or
asynchronous browser sinks can optionally provide a drain acknowledgement as a
second argument to `_setStdout(handler, drain)` or `_setStderr(handler, drain)`:

```js
import * as cli from "@bytecodealliance/preview3-shim/cli";

// `sink` is the host's buffered output destination.
cli._setStdout({ write: (bytes) => sink.enqueue(bytes.slice()) }, () => sink.drain());
await cli.stdout._flush();
```

The drain callback must complete after previously queued output is delivered to
the sink, and reject on delivery failure. Existing one-argument setters and
stream-write completion behavior are unchanged. Without a drain callback,
browser flushing has the existing synchronous handler's guarantees; it does not
infer completion of asynchronous work hidden inside a custom handler.

WASI `exit` and `exitWithCode` still signal exit immediately; they do not flush or
shut down output. Node.js terminates the process; the browser shim throws its
component-exit signal. A custom host can explicitly await `cli._shutdown()`
before invoking exit or disposing its component.

A completed component-model stream write acknowledges a copy to the receiving
side, not a flush to the final output destination. These helpers drain data the
host has accepted, up to the destination's acknowledgement boundary. They do not
guarantee browser rendering or delivery of all guest output on an abrupt exit,
or implement a new guest stream-completion protocol. Producers must
stop writing before shutdown begins; new transfers started afterward are not
covered by that shutdown call.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.
