# `node:zlib`

Jco supports the Node.js 24.20 `node:zlib` module through an explicit compression
host capability. Application code keeps ordinary Node imports:

```js
import { gzipSync, gunzipSync } from "node:zlib";

export function roundTrip(text) {
  return gunzipSync(gzipSync(text)).toString();
}
```

```sh
jco componentize app.js --bundle --wit wit -o app.wasm
jco transpile app.wasm -o out \
  --map 'jco:node/zlib@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/zlib/host/node'
```

Bundling adds `jco:node/zlib@0.1.0` to the selected WIT world. Without an explicit
provider mapping, compression, decompression, stream construction and CRC32 fail
with `ERR_JCO_ZLIB_ADAPTER_REQUIRED`. Importing the module and reading `constants`
or `codes` require no capability.

## Supported operations

The adapter exposes the Gzip/Gunzip, Deflate/Inflate, DeflateRaw/InflateRaw, Unzip,
BrotliCompress/BrotliDecompress and ZstdCompress/ZstdDecompress constructors,
corresponding `create*` factories, callback and synchronous convenience methods,
`crc32`, `constants` and `codes`. Constructors are callable with or without `new`.
Streams share Jco's portable `node:stream.Transform`, including piping,
backpressure, errors and close events. Flush, reset and zlib parameter changes
operate on persistent native compression state. Dictionaries, parameter maps,
`info: true`, output limits and byte counts cross the typed WIT boundary.

The Node provider delegates compression to the embedding Node runtime. Jco does
not include a compression algorithm. The guest can run in QuickJS or
StarlingMonkey; the Node provider itself requires Node, including native Zstandard
support for Zstd operations. A browser host can supply the same WIT interface.

## Scheduling and lifetime

WIT operations are synchronous and block the importing thread. Guest callbacks
are scheduled after the initiating call returns. QuickJS requires synchronous
WIT exports; returning a Promise from such an export is a backend restriction.
Each live streaming engine uses a Node worker to execute public Node stream operations and collect output; close,
destroy or WIT resource drop releases it. One-shot synchronous methods call Node
directly. Worker requests have a 60-second deadline and fail with
`ERR_JCO_ZLIB_HOST_TIMEOUT` if the worker cannot respond. This scheduling differs
from Node's application-thread/libuv scheduling, and many simultaneous streams
have worker overhead.

## Compatibility target

The contract is pinned to Node v24.20.0, commit
`71b8b174857e25106d39b61a9e6f30d927da8b01`, using `lib/zlib.js`, its API documentation
and matching-major TypeScript declarations. The installed unenv 2.0.0-rc.24
zlib entries are unimplemented and omit Zstandard, so they are not used.

Deprecated `bytesRead` and direct properties such as `zlib.Z_FINISH` throw explicit
deprecation errors; use `bytesWritten` and `zlib.constants.Z_FINISH`. Deprecated
constant aliases are available only as default-object error accessors, not named
ESM exports. The separate, flag-gated `node:zlib/iter` module and ZIP archive APIs from newer Node releases
are outside this adapter. Bare `zlib` imports are not intercepted.

Direct jco-std consumers can use `zlib/core` with an explicit typed provider and
mix the resulting module with native Node builtins. Normal component applications
should use `node:zlib` and the builtin integration shown above.
