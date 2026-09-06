# `@bytecodealliance/jco-node-fs`

Native Node.js filesystem helpers used by Jco's WASI shims.

The package intentionally exposes only filesystem operations that the Node.js
standard library cannot provide. It is not a general-purpose filesystem API.

```js
import { open } from 'node:fs/promises';
import { fadvise } from '@bytecodealliance/jco-node-fs';

const file = await open('data.bin', 'r');
try {
    fadvise(file.fd, 0n, 0n, 'sequential');
} finally {
    await file.close();
}
```

`rename(oldPath, newPath)` synchronously renames a host file or directory. It can
atomically replace an existing empty directory on Windows, using Rust's native
rename implementation. Symlinks are moved without moving their targets.

```js
import { rename } from '@bytecodealliance/jco-node-fs';

rename('staging', 'destination');
```

Both paths must be strings. Relative paths use the process's current directory.
Errors include `code`, `syscall`, `path`, and `dest` properties.

This binding supports the directory replacement required by the updated Wasmtime
conformance tests. The Preview 2 shim can adopt it after a helper release includes
the binding; its current dependency continues to use the existing implementation.
