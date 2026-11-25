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

## Directory handles

Node.js has no `openat()`, so a directory can only be remembered by its path,
which is resolved again on every use. `Dir` holds an open directory instead and
performs every path operation relative to it, using [`cap-std`][cap-std] as
Wasmtime's WASI implementation does.

```js
import { closeSync, readFileSync } from 'node:fs';
import { Dir } from '@bytecodealliance/jco-node-fs';

const root = Dir.open('/srv/data'); // the only call that takes a host path
const config = root.openAt('config', { directory: true }); // a Dir
const fd = config.openAt('settings.json', { read: true }); // a file descriptor
try {
    console.log(readFileSync(fd, 'utf8'));
} finally {
    closeSync(fd);
    config.close();
    root.close();
}
```

| Method                                   | Result                                                       |
| ---------------------------------------- | ------------------------------------------------------------ |
| `Dir.open(hostPath)`                     | `Dir` for a host directory                                   |
| `openAt(path, options?)`                 | `Dir` for a directory, otherwise a file descriptor           |
| `stat()`, `statAt(path, follow)`         | `{ type, dev, ino, nlink, size, atimeNs, mtimeNs, ctimeNs }` |
| `readDir()`                              | `[{ name, type }]`, without `.` and `..`                     |
| `readlinkAt(path)`                       | the symlink's target, exactly as stored                      |
| `createDirAt(path)`, `removeDirAt(path)` |                                                              |
| `unlinkAt(path)`                         | removes a file, or a symlink rather than its target          |
| `renameAt(oldPath, newDir, newPath)`     |                                                              |
| `linkAt(oldPath, newDir, newPath)`       | links a symlink rather than its target                       |
| `symlinkAt(target, path)`                |                                                              |
| `setTimes(atime, mtime)`                 | sets the directory's own times                               |
| `setTimesAt(path, atime, mtime, follow)` |                                                              |
| `sync()`, `close()`                      |                                                              |

`openAt` options are the booleans `read`, `write`, `create`, `exclusive`,
`truncate`, `directory`, `follow`, `sync` and `dsync`, all false by default.
`follow` says whether a symlink in the final path component is followed.
Sizes, identifiers and times are `bigint`s, and times are nanoseconds since the
Unix epoch. A time to set is such a `bigint`, `'now'`, or `null` to keep it.
Methods are synchronous, and errors include `code` and `syscall`, plus `path`
and `dest` where they apply.

### Security model

Paths are resolved beneath the handle's directory. A path that would leave it,
through `..`, an absolute path, or a symlink at any position, fails with `EPERM`
instead of being followed, while symlinks that stay inside are followed as usual.
A handle refers to the directory itself, not to its path: renaming the directory,
or replacing its path with a symlink, does not change what the handle can reach.
`Dir.open` is the only operation with ambient authority, so what a set of handles
can reach is decided by the directories they were opened on.

### Platform notes

- Linux uses `openat2(RESOLVE_BENEATH)` where the kernel has it. Other hosts
  resolve paths one component at a time without following symlinks implicitly.
- A file descriptor is the host's own on POSIX. On Windows it is a C runtime
  descriptor created through libuv's `uv_open_osfhandle`, which the Node.js
  executable exports. On a runtime that does not export it, opening a file
  fails with `ENOTSUP`; directory operations do not depend on it.
- Windows has no status change time, so `ctimeNs` is the creation time there,
  and creating symlinks requires the privilege that Windows demands for it.
- A `Dir` belongs to the thread that opened it. Worker threads open their own
  handles; file descriptors are process-wide and can be used from any thread.

[cap-std]: https://github.com/bytecodealliance/cap-std
