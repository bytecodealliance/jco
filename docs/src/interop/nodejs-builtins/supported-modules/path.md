# `node:path`

| Imports | Implementation |
| --- | --- |
| `node:path`, `node:path/posix`, `node:path/win32` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/path` |

Path manipulation is portable, but `path.resolve()` and related operations need a
current working directory.

Jco obtains that value through `wasi:cli/environment@0.2.x`, so the selected WIT
world must import exactly one compatible version when it uses `node:path`:

```wit
world app {
  import wasi:cli/environment@0.2.6;
  // component imports and exports...
}
```

Jco selects the adapter matching the version in the world. A component that only
uses capability-free built-ins such as assert, Buffer, or querystring does not
need this import.
