# Performance

Jco aims to make transpiled components run at near-native JavaScript speed, with as little host
overhead as possible between a component's exports and the code that calls them. This section
covers the options that trade generality for speed, and how that is measured.

## Options

All of these are off by default, except where noted.

### Sync fast path

Skips the per-call task state for components whose functions are all synchronous.
See [Sync fast path](./sync-fast-path.md).

```sh
jco transpile component.wasm -o out --perf-sync-fast-path
```

```js
const result = await transpile(bytes, { perfSyncFastPath: true });
// Set only when the option could not apply, e.g. "call tracking is enabled"
console.log(result.syncFastPathBlocker);
```

### Multi-memory for composed components

Keeps the adapters between composed components on Wasm multi-memory instead of a JavaScript call
per copied value. Needs engine support.
See [Calls between components](../../transpiling.md#calls-between-components).

```sh
jco transpile composed.wasm -o out --multi-memory
```

### Runtime diagnostics

The bundled runtime drops its diagnostics by default (`checked`). Keep them only while debugging.
See [Debug logging](../../transpiling.md#debug-logging).

```sh
# Default: diagnostics removed
jco transpile component.wasm -o out
# Keep diagnostics, logged when JCO_DEBUG is set
jco transpile component.wasm -o out --runtime-profile debug
```

### WASI 0.2 filesystem on Node.js

Lets `@bytecodealliance/preview2-shim` serve regular files on the main thread, and resolve preopen
paths once. See [Performance options](../../wasi/preview2-shim.md#performance-options).

```js
new WASIShim({
    sandbox: { preopens: { "/data": "/tmp/guest-data" } },
    // Synchronous node:fs calls instead of an I/O worker round trip
    performance: { mainThreadFilesystem: true, cacheDirectoryPaths: true },
});
```

```sh
jco run --perf-main-thread-filesystem --perf-cache-directory-paths component.wasm
```

### Optimized host bindings

See [Optimized Host Bindings](../optimized-host-bindings.md).

## Benchmarks

[Benchmarks](./benchmarks/index.md): reproducible measurements of Jco tooling and runtime paths.
