# Preview 2 shim filesystem helpers

[`@bytecodealliance/preview2-shim`][npm-p2-shim] ships host-side helper functions next to its WASI
implementations. This page covers the filesystem helpers; see [Preview 2 shim](../../preview2-shim.md)
for the package overview. Helpers build only on the shim's public surface and are exported from `helpers/`
subpaths, separate from the underscore-prefixed functions (`_setPreopens`, `_setFileData`, ...)
that exist to configure the shim itself.

The filesystem helpers move bytes between host JavaScript and a preopened directory without
involving a guest. They are available under both the browser and `node` conditions:

```js
import { readFileAt, writeFileAt } from "@bytecodealliance/preview2-shim/helpers/filesystem";
```

Both helpers use only the public `wasi:filesystem/types` `Descriptor` interface, so they work with
every adapter the shim can be configured with: the Node host filesystem, the browser in-memory
adapter, OPFS, or an application-provided implementation.

[npm-p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim

## Which preopens the helpers see

The helpers resolve `virtualPath` against the shim's **global** preopens, the same set a component
receives when it is instantiated without isolated preopens. Configure them with the build's
compatibility setters before calling a helper:

- Node.js: `filesystem._setPreopens({ "/data": "/host/path" })` or `filesystem._addPreopen(...)`
- Browser: `filesystem._setPreopens({ "/data": { dir: {} } })` or `filesystem._setFileData(...)`

A `WASIShim` created with `sandbox.preopens` or `browserFilesystem` owns an isolated preopen set
that the helpers cannot reach. Use the global preopens, or operate on that instance's descriptors
directly, when a component needs isolation.

## `writeFileAt(virtualPath, path, data, options?)`

Writes `data` (a `Uint8Array`) to `path`, resolved relative to the preopen mounted at
`virtualPath`. Missing intermediate directories are created. The file is truncated first unless
`options.append` is `true`, in which case the bytes are written after the existing contents.

```js
import { filesystem } from "@bytecodealliance/preview2-shim";
import { writeFileAt } from "@bytecodealliance/preview2-shim/helpers/filesystem";

filesystem._setPreopens({ "/data": { dir: {} } }); // browser in-memory adapter

const encoder = new TextEncoder();
writeFileAt("/data", "logs/run.txt", encoder.encode("started\n"));
writeFileAt("/data", "logs/run.txt", encoder.encode("done\n"), { append: true });
```

## `readFileAt(virtualPath, path)`

Reads the whole file at `path` under the preopen mounted at `virtualPath` and returns its contents
as a single `Uint8Array`. Large files are read in chunks and joined, so the result is independent of
the adapter's read granularity.

```js
import { readFileAt } from "@bytecodealliance/preview2-shim/helpers/filesystem";

const bytes = readFileAt("/data", "logs/run.txt");
console.log(new TextDecoder().decode(bytes)); // "started\ndone\n"
```

## Errors

An unknown `virtualPath` throws a JavaScript `Error` whose message names the missing preopen.
Everything else surfaces the adapter's own WASI `error-code` string, for example `"no-entry"` when
`readFileAt` targets a file that does not exist or `"not-permitted"` when the host denies the
operation. This mirrors what a guest would observe for the same call.

## Example: shell-style redirection

A host that runs a CLI component and wants to capture its output file can seed the input before
instantiation and collect the result afterwards:

```js
import { filesystem } from "@bytecodealliance/preview2-shim";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { readFileAt, writeFileAt } from "@bytecodealliance/preview2-shim/helpers/filesystem";
import { instantiate } from "./dist/transpiled/component.js";

filesystem._setPreopens({ "/work": { dir: {} } });
writeFileAt("/work", "input.txt", new TextEncoder().encode("hello\n"));

const shim = new WASIShim({ arguments: ["component", "input.txt", "output.txt"] });
const component = await instantiate(undefined, shim.getImportObject());
component.run.run();

const output = readFileAt("/work", "output.txt");
```

See [Manual Wasm instantiation with WASI overrides](../../../advanced/manual-wasm-instantiation-with-wasi-overrides.md)
for how `instantiate` and `WASIShim` fit together.
