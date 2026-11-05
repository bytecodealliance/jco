# Preview3 Shim

[WebAssembly System Interface (WASI) Preview 3][wasi] implementations for NodeJS & browsers.

Similar to the [Preview 2 Shim][p2-shim], the P3 shim makes available WASI
interfaces for [WebAssembly Components][cm-book] that make use of them.

[wasi]: https://github.com/webassembly/wasi
[cm-book]: https://component-model.bytecodealliance.org/
[p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim

### Node output flush and shutdown

Node hosts can await `stdout._flush()` or `stderr._flush()` to wait for writes
currently queued on that Node destination. `cli._flush()` waits for both. These
helpers leave the component's stream readers open and do not wait for guest EOF.

Once a component has stopped producing output, hosts can call
`stdout._shutdown()` or `stderr._shutdown()` to close that output's host-owned
readers, finish its active transfers and wait for queued destination callbacks.
`cli._shutdown()` does this for both streams. The shared Node stdout/stderr
writables remain open. `jco run` calls this helper after a command returns.

WASI `exit` and `exitWithCode` still terminate immediately; they do not flush or
shut down output. A custom host that wants to preserve accepted output before
exiting with a nonzero code can explicitly await `cli._shutdown()` first.

A completed component-model stream write acknowledges a copy to the receiving
side, not a flush to the final output destination. These helpers drain data the
host has accepted; they do not guarantee delivery of all guest output on an
abrupt exit or implement a new guest stream-completion protocol. Producers must
stop writing before shutdown begins; new transfers started afterward are not
covered by that shutdown call.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.
