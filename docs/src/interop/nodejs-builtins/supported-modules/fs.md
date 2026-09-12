# `node:fs`

| Imports | Implementation |
| --- | --- |
| `node:fs`, `node:fs/promises` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs` |

`node:fs` and `node:fs/promises` use one `jco:node/fs@0.1.0` host capability.
When either specifier occurs in bundled source, Jco adds a missing import to the
selected world, installs `fs.wit` under `deps/jco-node-0.1.0`, and prints a CLI
warning to alert to the fact that a WIT dependency has been added.

The default filesystem host provider returns a typed denial result, which the
guest reconstructs as `ERR_JCO_FS_ADAPTER_REQUIRED`.
To use the passthrough NodeJS host provider you can map it in:

```console
jco transpile component.wasm \
  --map 'jco:node/fs@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs/host/node'
```

The resulting call path for filesystem function is:

1. guest `node:fs`
2. WIT capability
3. host adapter
4. NodeJS builtins

The Node provider delegates to Node 24's synchronous operations; guest callback APIs
queue their callbacks on a microtask, and promise APIs share the same descriptor
state through promise `FileHandle`s.

Common file and directory operations, metadata, directory entries, scalar and
vector descriptor I/O, and their callback/promise facades are supported.

> [!WARNING]
> APIs whose contract requires long-lived streams or event sources are not yet supported
> -- including `ReadStream`, `WriteStream`, `Utf8Stream`, `watch`, `watchFile`, and
> `openAsBlob`.
>
> These functions currently throw `ERR_JCO_UNSUPPORTED_NODE_API` because the typed WIT
> interface does not model those resources.
