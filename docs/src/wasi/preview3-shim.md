# Preview 3 shim

[`@bytecodealliance/preview3-shim`][npm-p3-shim] implements WASI 0.3 (`wasi:cli`, `wasi:clocks`,
`wasi:filesystem`, `wasi:http`, `wasi:random` and `wasi:sockets`) for Node.js and browsers. WASI
0.3 replaces the `wasi:io` streams and pollables of 0.2 with `stream<T>` and `future<T>` values
built into the component model, so there is no `io` subsystem to map.

```console
npm install @bytecodealliance/preview3-shim
```

`jco transpile` maps every supported 0.3.x version of a WASI interface to the current
`preview3-shim` implementation. A component built against an earlier 0.3 release therefore runs
against the newest implementation, which is acceptable because 0.3 releases are not expected to
introduce breaking changes.

As with the Preview 2 shim, each subsystem is a subpath export (`@bytecodealliance/preview3-shim/http`
and so on) with a Node.js build selected by the `node` condition and a browser build otherwise.

## Working with asynchronous values

Preview 3 hosts exchange streams, futures, and async calls with the guest. Two chapters describe
how Jco handles them:

- [Preview 3 streams and backpressure](../advanced/preview3-streams-and-backpressure.md)
- [Preview 3 host value disposal](../advanced/preview3-host-value-disposal.md)

[npm-p3-shim]: https://www.npmjs.com/package/@bytecodealliance/preview3-shim
