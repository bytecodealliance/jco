# Preview3 Shim

[WebAssembly System Interface (WASI) Preview 3][wasi] implementations for NodeJS & browsers.

Similar to the [Preview 2 Shim][p2-shim], the P3 shim makes available WASI
interfaces for [WebAssembly Components][cm-book] that make use of them.

[wasi]: https://github.com/webassembly/wasi
[cm-book]: https://component-model.bytecodealliance.org/
[p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim

### Node command shutdown

`jco run` drains Preview 3 output before terminating. Custom command hosts must
also await `cli._flush()` after `run` returns or throws `cli._Exit`, then use the
exception's `code` as the exit status. `_Exit` unwinds the component without
terminating Node while output is still pending.

`_flush()` closes the host-owned output readers and waits for queued writes;
call it only when the command has stopped producing output. The result from
`writeViaStream` still reports stream completion or an I/O error. It alone is
not a shutdown barrier when the guest keeps its writable end open.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.
