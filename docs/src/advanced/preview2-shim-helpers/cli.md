# Preview 2 shim CLI helpers

[`@bytecodealliance/preview2-shim`][npm-p2-shim] ships host-side helper functions next to its WASI
implementations. Helpers build only on the shim's public surface and are exported from `helpers/`
subpaths, separate from the underscore-prefixed functions (`_setStdin`, `_setPreopens`, ...) that
exist to configure the shim itself.

Helpers that only exist for one build are exported under that build's prefix. The CLI helper on
this page is browser-only, because it builds on the browser `wasi:io` pollables:

```js
import { bufferedInputStream } from "@bytecodealliance/preview2-shim/browser/helpers/cli";
```

[npm-p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim

## `bufferedInputStream(input)`

Builds an `InputStreamHandler` that serves a fixed buffer to the guest and then reports the stream
as closed. It replaces the bounded handler that hosts otherwise have to hand-roll whenever a
guest's stdin is known up front, such as piping a document into a CLI component.

`input` is a `Uint8Array`, or a string that is encoded as UTF-8. Each `blockingRead(len)` returns
up to `len` bytes from what remains of the buffer. Once the buffer is exhausted, further reads raise
the WASI `closed` stream error, which the guest observes as end of input. `subscribe()` returns an
always-ready pollable, so a guest that polls stdin before reading never blocks.

### Feeding an isolated CLI

`createCli` builds CLI interfaces that do not touch the shim's global streams:

```js
import { cli } from "@bytecodealliance/preview2-shim";
import { bufferedInputStream } from "@bytecodealliance/preview2-shim/browser/helpers/cli";

const isolated = cli.createCli({
    stdin: bufferedInputStream("first line\nsecond line\n"),
});
```

### Feeding a `WASIShim`

`WASIShim` accepts the same handler through its `stdin` option and builds an isolated CLI for the
instance:

```js
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { bufferedInputStream } from "@bytecodealliance/preview2-shim/browser/helpers/cli";

const shim = new WASIShim({
    stdin: bufferedInputStream("input for the guest\n"),
});
const component = await instantiate(undefined, shim.getImportObject());
```

See [Manual Wasm instantiation with WASI overrides](../manual-wasm-instantiation-with-wasi-overrides.md)
for how `instantiate` and `WASIShim` fit together.

### Replacing the global stdin

The compatibility setter installs the handler on the stream shared by every component that does
not configure its own CLI:

```js
import { cli } from "@bytecodealliance/preview2-shim";
import { bufferedInputStream } from "@bytecodealliance/preview2-shim/browser/helpers/cli";

cli._setStdin(bufferedInputStream(new Uint8Array([1, 2, 3])));
```

Prefer `createCli` or `WASIShim` when more than one component runs in the same page, since the
global stream is consumed once and then stays closed.
