# `node:path`

| Imports | WASI | Implementation |
| --- | --- | --- |
| `node:path`, `node:path/posix`, `node:path/win32` | P2 | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/path` |
| Same imports | P3 | `@bytecodealliance/jco-std/wasi/0.3.x/node/24.x.x/path` |

Path manipulation is portable, but `path.resolve()` and related operations need a
current working directory.

Jco obtains that value through `wasi:cli/environment`. The selected WIT world
can import one P2 or P3 version, which determines the adapter Jco uses:

```wit
world app {
  import wasi:cli/environment@0.2.6;
  // component imports and exports...
}
```

For P3, declare `wasi:cli/environment@0.3.0` and build with
`jco componentize --bundle --backend qjs`. P3 componentization currently requires
`componentize-qjs`.

Both package paths export the same `createPath` factory and Node 24 types. The
P3 adapter imports `getInitialCwd` as `initialCwd`, matching the existing factory's
provider contract, and normalizes an absent cwd to `undefined`; the path algorithms
remain shared. When using the factory directly, pass
`{ initialCwd: () => getInitialCwd() ?? undefined, getEnvironment }` from the P3
environment interface. This also accepts QuickJS's `null` representation of an
absent WIT option.

When the component's WIT exports use `async func`, implement those JavaScript
exports with `async` functions for QuickJS. The `node:path` methods themselves
remain synchronous.

Importing multiple supported environment versions, including a mix of P2 and
P3, is ambiguous and rejected. If no supported environment import is present,
Jco still adds the existing P2 `wasi:cli/environment@0.2.12` requirement. P3 users
must declare the P3 environment import explicitly for this adapter.

This P3 support covers `node:path`; other built-ins are being reviewed separately.
A component that only uses capability-free built-ins such as assert, Buffer, or
querystring does not need the environment import.
