# Node.js platform capabilities

This example is the integration point for Node.js APIs supported by Jco components. It is intentionally
named for the broader Node.js platform rather than a single builtin: additional `node:*` modules can be
added here as compatibility grows.

For now, `node:path` is the only implemented and tested API. The component imports all supported forms
directly:

- `node:path`
- `node:path/posix`
- `node:path/win32`
- default, named, and namespace exports

No example-local alias, compatibility package, or bundler configuration is needed. Run the complete
component round trip with:

```console
pnpm run all
```

During `jco componentize`, Jco recognizes supported `node:*` imports and generates virtual adapters.
The `node:path` adapter imports the exact `wasi:cli/environment@0.2.x` version selected by the WIT world
and injects `initialCwd` and `getEnvironment` into `@bytecodealliance/jco-std/node/path`.

Pure lexical operations such as `join`, `normalize`, `parse`, and `basename` do not call WASI.
Cwd-dependent operations access `wasi:cli/environment` lazily, and the implementation never accesses
the host filesystem directly.
