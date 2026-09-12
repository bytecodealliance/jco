# `node:wasi`

| Imports | Implementation |
| --- | --- |
| `node:wasi` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/wasi` |

`node:wasi` runs a WASI preview1 module: the caller compiles it with the
`WebAssembly` API, instantiates it against `wasi.getImportObject()`, and hands
the instance to `wasi.start()` or `wasi.initialize()`, whose syscalls then read
and write the instance's linear memory. None of that is possible from inside a
Jco component. Neither guest engine exposes a `WebAssembly` global, so a
component cannot instantiate a nested module, and a linear memory cannot cross
the component boundary, so no host adapter can run the module either. This is
a property of the component model, not a missing shim, and it is why a Node
passthrough for `node:wasi` does not exist.

`node:wasi` therefore resolves so that such source bundles and fails clearly
rather than leaving an unresolved import. The module ports
[Node v24.19.0's `lib/wasi.js`](https://github.com/nodejs/node/blob/v24.19.0/lib/wasi.js):
the `WASI` class, its exact option validation, the 46-entry `wasiImport` table
with Node's names and arities, `getImportObject()`, and the instance checks of
`start()`, `initialize()` and `finalizeBindings()`. When bundled source imports
`node:wasi`, Jco adds `jco:node/wasi@0.1.0` to the selected world and installs
`wasi.wit` and the shared `types.wit` under `deps/jco-node-0.1.0`.

That capability carries the one part of the API a host can honour: the
constructor's `uvwasi_init` step, which opens every preopen and checks the
standard descriptors. It is **denied by default**, so `new WASI()` throws
`ERR_JCO_WASI_ADAPTER_REQUIRED` after validating its options; the message also
explains that running a module is unsupported, so the limitation is visible from
the first call. jco-std ships a provider for Node that runs the real `node:wasi`
constructor and discards the result:

```console
jco transpile component.wasm \
  --map 'jco:node/wasi@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/wasi/host/node'
```

With it, a missing preopen fails with Node's own `UVWASI_ENOENT` (`errno`,
`code` and `syscall: 'uvwasi_init'`), a preopen that is a file with
`UVWASI_ENOTDIR`, and a closed descriptor with `UVWASI_EBADF`, in Node's order
relative to the JavaScript validation (`returnOnExit` is checked after
initialisation, as in Node). Importing the provider emits Node's
`ExperimentalWarning` once in the host process.

```js
import { WASI } from "node:wasi";

export function prepare(sandbox) {
  const wasi = new WASI({ version: "preview1", args: ["app"], preopens: { "/sandbox": sandbox } });
  return Object.keys(wasi.getImportObject()); // ["wasi_snapshot_preview1"]
}
```

## Boundaries

| Surface                                          | Behavior                                                                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `start()`, `initialize()`, `finalizeBindings()` | Validate `instance` and `instance.exports` as Node does, then throw `ERR_JCO_UNSUPPORTED_NODE_API` explaining that a component cannot instantiate a nested module and pointing at composition (`wac`, `wasm-tools compose`) or the host. |
| `instance.exports.memory`                        | Where a `WebAssembly` global exists, a value that is not a `WebAssembly.Memory` still gets Node's `ERR_INVALID_ARG_TYPE`; in a guest there is no such global, so every value is refused with the explanation above.               |
| `wasiImport`                                     | Node's 46 syscalls with Node's bound names and arities. Before `start()`, which never completes, each answers `UVWASI_EINVAL` to a call with the wrong argument count or types and throws `ERR_WASI_NOT_STARTED` otherwise. |
| `proc_exit`                                      | With `returnOnExit` (the default) records the exit code and throws Node's `kExitCode` symbol, as in Node; otherwise behaves like the other syscalls.                                                                            |
| Experimental warning                             | Node warns once on `require('node:wasi')`; the guest module does not, since a component has no warning channel to promise.                                                                                                    |
