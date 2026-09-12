# `node:vfs`

Jco implements the experimental Node 26.8.2 VFS API. Application code keeps its
ordinary `node:vfs` imports. `create()` uses an isolated `MemoryProvider` by
default; `RealFSProvider` accesses an explicitly supplied filesystem capability.
Only the `node:` specifier is intercepted.

```js
import { create, RealFSProvider } from 'node:vfs';

export function run(root) {
    const fs = create(new RealFSProvider(root));
    fs.mkdirSync('/reports', { recursive: true });
    fs.writeFileSync('/reports/result.txt', 'done');
    return fs.readFileSync('/reports/result.txt', 'utf8');
}
```

Omit the provider to use memory. Memory operations never consult host providers,
preopens, or a storage resolver. `MemoryProvider.setReadOnly()` prevents subsequent
write operations through the provider while preserving existing contents.

## Choosing a filesystem implementation

| Selection | Host capability | Default behavior |
| --- | --- | --- |
| `--with-nodejs-vfs-via direct` | `jco:node/fs@0.1.0` | Filesystem access is denied with `ERR_JCO_FS_ADAPTER_REQUIRED`. |
| `direct` with an explicit Node host mapping | `jco:node/fs@0.1.0` | Node filesystem passthrough under each `RealFSProvider` root. |
| `--with-nodejs-vfs-via wasi-filesystem` | `wasi:filesystem/preopens` and `types` at `0.2.12` | Access is limited to the preopens supplied at instantiation. |

`direct` is the default. It reuses the same filesystem boundary and host provider
as `node:fs`; mapping that capability grants it to both APIs in the component.
Imports and provider construction do not themselves perform filesystem operations.
The selected host is accessed lazily when an operation needs it.

For Node passthrough:

```sh
jco componentize app.js --wit wit --bundle -o app.wasm
jco transpile app.wasm -o out \
  --map 'jco:node/fs@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/vfs/host/node'
```

The `vfs/host/node` export reuses the existing Node filesystem provider. It does
not depend on the host having native `node:vfs` or enabling `--experimental-vfs`.
The VFS façade, virtual descriptors, and memory tree run inside the component.

For WASI filesystem access:

```sh
jco componentize app.js --wit wit --bundle \
  --with-nodejs-vfs-via wasi-filesystem -o app.wasm
jco transpile app.wasm -o out --instantiation async
```

Jco adds the selected interfaces and their WIT dependencies. Configure preopens
when instantiating the result, for example with preview2-shim:

```js
import { instantiate } from './out/app.js';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

const wasi = new WASIShim({
    sandbox: { preopens: { '/data': '/srv/application-data' } },
});
const app = await instantiate(undefined, wasi.getImportObject());
app.run('/data');
```

VFS roots and application paths use POSIX syntax. Real provider roots must be
absolute. Filesystem root directories must already exist. Relative paths are
resolved from the VFS root, not the host process's working directory. Root and
symlink checks are compatibility checks; VFS is not a replacement for host
isolation or correctly scoped WASI capabilities.

## Configuring storage placement

By default, a WASI real provider selects the longest preopen mount containing its
root. For a preopen `/data`, `new RealFSProvider('/data/projects/demo')` stores
contents in `projects/demo` within that preopen. A root with no matching preopen
fails with `EACCES`. An exact mount match uses the preopen's root directory.

Supply a guest JavaScript module exporting `resolveRoot` to select another
preopen or directory:

```js
// vfs-storage.js
export function resolveRoot(rootPath, preopens) {
    const storage = preopens.find(([, name]) => name === '/data');
    if (!storage || rootPath !== '/workspace') {
        throw new Error('No storage configured for this VFS root');
    }
    return { descriptor: storage[0], directory: 'projects/demo' };
}
```

```sh
jco componentize app.js --wit wit --bundle \
  --with-nodejs-vfs-via wasi-filesystem \
  --with-nodejs-vfs-wasi-config ./vfs-storage.js -o app.wasm
```

The module path is resolved from the command's working directory and bundled into
the guest. The callback receives the normalized VFS root and `[descriptor,
guestPath]` preopen pairs. It returns a borrowed descriptor and a directory
relative to it. Absolute directories and `..` paths escaping the preopen are
rejected. The selected directory must already exist. The resolver runs once per
real provider, on first use; separate VFS instances can choose different folders.
Exceptions propagate to the caller. The implementation disposes descriptors it
opens, but never disposes the resolver's borrowed preopen.

Direct adapter users can configure the same callback through
`createWasiVfs({ preopens, resolveRoot })` from
`@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/vfs/impl/wasi-filesystem`.
Direct adapters and native Node builtins can coexist in one host application.
Application components should continue importing `node:vfs`.

## Supported operations and limits

The module exports `create`, `VirtualFileSystem`, `VirtualProvider`,
`MemoryProvider`, and `RealFSProvider`. File contents, directories, copy/rename,
hard links, symbolic links, metadata, directory handles, and scalar virtual
file-descriptor I/O are supported. Callback and promise façades share the same
provider. Custom providers inherit the base class's derived file operations.
VFS `openAsBlob()` returns a snapshot when the component engine supplies `Blob`.
As in the pinned runtime, `vfs.promises.open()` returns a numeric virtual
file descriptor, not a Node `fs.promises.FileHandle`.

Mounting into native `node:fs` or the module loader, filesystem streams, and
watchers throw `ERR_JCO_UNSUPPORTED_NODE_API`. `mounted` stays false and
`mountPoint` stays null. Providers report `supportsWatch: false`. Missing custom
provider primitives throw `ERR_METHOD_NOT_IMPLEMENTED`. The component does not
emit Node's process-wide experimental warning. Memory metadata uses UID/GID zero
rather than consulting the host process.

WASI 0.2.12 has no chmod/chown or access-permission test operation. Those calls
fail explicitly; existence-only `access` works. WASI stat fields absent from the
interface use zero for device, inode, ownership and birth time, and conventional
file/directory mode bits. Actual size, link count and available timestamps come
from WASI. Directory listing order is host-dependent. Resource operations use
WASI's synchronous descriptor methods and preserve 64-bit offsets.

StarlingMonkey component tests cover memory, default denial, Node passthrough,
WASI default placement, and custom placement, including callbacks and promises.
QuickJS runs the synchronous memory suite and default-denial check. Its current
Promise-job and BigInt-to-WIT-`u64` limitations block asynchronous and full
host-backed component tests; those tests have `TODO(unskip)` markers.

## Provenance

The portable VFS algorithms are adapted from Node
[v26.8.2](https://github.com/nodejs/node/tree/f2f2c2f246c36bd74f082cb43ecfe830657d81c9/lib/internal/vfs),
commit `f2f2c2f246c36bd74f082cb43ecfe830657d81c9`, with MIT attribution retained.
The implementation reuses Jco's portable filesystem types, value objects,
validation, error transport, and Node host provider. Audited unenv 2.0.0-rc.24 has
no VFS implementation. Its alias map is not enabled for this module.
