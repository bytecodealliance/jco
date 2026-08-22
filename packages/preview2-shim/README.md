# Preview2 Shim

WASI Preview2 implementations for Node.js & browsers.

Node.js support is fully tested and conformant against the Wasmtime test suite.

Browser support is considered experimental, and not currently suitable for production applications.

The Node.js implementation owns its worker artifact. Direct package use and supported downstream
bundlers should resolve it through the public shim imports; applications do not need to import or
copy files from `dist/io`.

## Browser support matrix

Browser defaults are capability-safe: clocks and secure randomness use Web APIs, stdout and stderr
write to the console, stdin is closed, outbound HTTP uses `fetch`, filesystem preopens must be
configured explicitly, and raw sockets are unavailable unless an embedding supplies an adapter.

| WASI area                     | Browser status                                                              | Default capability                                                |
| ----------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| CLI environment and arguments | Configurable per `WASIShim`; compatibility setters are global               | Empty snapshots unless configured                                 |
| CLI stdin                     | Adapter-backed                                                              | Closed stream                                                     |
| CLI stdout and stderr         | Web API                                                                     | Console-backed, preserving split UTF-8 writes until flush/newline |
| CLI terminals                 | Adapter-backed                                                              | No terminal resource                                              |
| Clocks                        | Web API                                                                     | `performance.now`, `Date.now`, and timer-backed pollables         |
| Random                        | Web API                                                                     | `crypto.getRandomValues`, including requests larger than 64 KiB   |
| I/O streams and poll          | Implemented browser resources                                               | Non-blocking streams depend on their injected handlers            |
| Filesystem                    | Adapter-backed; in-memory compatibility implementation remains experimental | No persistent storage is selected implicitly                      |
| Outbound HTTP                 | Web API                                                                     | Delegates to `fetch`                                              |
| Incoming HTTP                 | Host adapter required                                                       | Browsers cannot listen for arbitrary inbound HTTP                 |
| TCP, UDP, and DNS             | Host adapter required                                                       | Raw sockets are not exposed by standard browsers                  |
| `WASIShim` instantiation      | Implemented                                                                 | Interface namespaces can be overridden per instance               |

An operation is not considered supported merely because its interface shape exists. Adapter-backed
rows require the embedding application to provide that capability; unavailable operations fail with
a WASI-domain error instead of logging or returning a placeholder resource.

Browser applications select storage explicitly. The bundled file-data adapter is ephemeral and must
be opted into:

```js
import { filesystem } from "@bytecodealliance/preview2-shim";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const shim = new WASIShim({
    environment: { MODE: "browser" },
    arguments: ["component"],
    stdout: { write: (bytes) => terminal.write(bytes) },
    browserFilesystem: {
        adapter: new filesystem.InMemoryFilesystemAdapter(),
        preopens: { "/data": { dir: {} } },
    },
    sandbox: { enableNetwork: false },
});
```

The browser shim does not request File System Access permissions or choose IndexedDB/OPFS on an
application's behalf. Applications that need another storage model implement the generated
`wasi:filesystem/types` and `wasi:filesystem/preopens` namespaces and inject them through the
`filesystem` option:

```js
const shim = new WASIShim({
    filesystem: {
        types: applicationFilesystemTypes,
        preopens: applicationFilesystemPreopens,
    },
});
```

This keeps permission prompts, handle acquisition, persistence, and synchronization policy in
application code. Raw TCP, UDP, and DNS are denied by default; outbound HTTP remains a separate
`fetch` capability.

# Features

## WASI Shim object for easy instantiation

An default instantiation object can be used via the `WASIShim` class in `@bytecodealliance/preview2-shim/instantiation`:

```typescript
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import type {
    VersionedWASIImportObject,
    WASIImportObject,
} from "@bytecodealliance/preview2-shim/instantiation";

const shim = new WASIShim();

const unversioned: WASIImportObject = shim.getImportObject();
// console.log('unversioned', unversioned);
unversioned satisfies WASIImportObject;
unversioned satisfies VersionedWASIImportObject<"">;

const versioned: VersionedWASIImportObject<"0.2.3"> = shim.getImportObject({
    asVersion: "0.2.3",
});
//console.log('versioned', versioned);
versioned satisfies VersionedWASIImportObject<"0.2.3">;
```

The import object generated by `getImportObject` can be easily used in `instantiate()` calls
produced by [`jco transpile`][jco] (with `--instantiation=async`):

```js
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

// The code below assumes that you have output your transpiled WebAssembly component to `dist/transpiled`
import { instantiate } from './dist/transpiled/component.js';

const loader = async (path: string) => {
    const buf = await readFile(`./dist/transpiled/${path}`);
    return await WebAssembly.compile(buf.buffer as ArrayBuffer);
};
const component = await instantiate(loader, new WASIShim().getImportObject());

// TODO: Code that uses your component's exports goes here.
```

## Sandboxing

On Node.js, the preview2-shim provides host filesystem, environment, and network access by default,
matching the usual behavior of Node.js libraries. Browser defaults expose no filesystem preopens or
raw sockets. Both platforms can configure which capabilities a guest receives.

### Using WASIShim for sandboxing

The `WASIShim` class accepts a `sandbox` configuration option to control access:

```js
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

// Fully sandboxed - no filesystem, network, or env access
const sandboxedShim = new WASIShim({
    sandbox: {
        preopens: {}, // No filesystem access
        env: {}, // No environment variables
        args: ["arg1"], // Custom arguments
        enableNetwork: false, // Disable network access
    },
});

// Node.js only: map virtual paths to host paths
const limitedShim = new WASIShim({
    sandbox: {
        preopens: {
            "/data": "/tmp/guest-data", // Guest sees /data, maps to /tmp/guest-data
            "/config": "/etc/app", // Guest sees /config, maps to /etc/app
        },
        env: { ENV1: "42" }, // Only expose specific env vars
    },
});

const component = await instantiate(loader, sandboxedShim.getImportObject());
```

### Notes on sandboxing

- By default (when no options are passed), the shim is providing full access to match typical
  Node.js library behavior. In browsers, filesystem preopens remain empty until the application
  explicitly injects filesystem namespaces or selects the ephemeral file-data adapter.
- `sandbox.preopens` maps guest paths to Node.js host paths. Browser applications use the
  `filesystem` or `browserFilesystem` options shown above; host paths are rejected in browsers.
- Each `WASIShim` instance has its own isolated preopens, environment variables, and arguments.
  Multiple instances with different configurations will not affect each other.
- The direct preopen functions (`_setPreopens`, `_clearPreopens`, etc.) modify global state and
  affect all components not using `WASIShim` with explicit configuration. For isolation, prefer
  using `WASIShim` with the `sandbox` option containing `preopens` and `env`.
- When `sandbox.enableNetwork: false`, all socket and HTTP operations will throw "access-denied" errors.

[jco]: https://www.npmjs.com/package/@bytecodealliance/jco

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
