# `@bytecodealliance/jco-std`

This [`@bytecodealliance/jco`][jco] sub-project contains shared functionality and
reusable libraries that can be used for building WebAssembly Components in Javascript.

[WebAssembly Components][cm-book] are a WebAssembly binaries that use the Component Model,
an evolving architecture for interoperabl WebAssembly libraries, aplications and environments.

WebAssembly components can be used from server side applications _and_ in the browser, and
`@bytecodealliance/jco-std` contains shared functionality and helpers for both environments.

[cm-book]: https://component-model.bytecodealliance.org/
[jco]: https://www.npmjs.com/package/@bytecodealliance/jco

# Utilites

Below is a list of utilties provided by `@bytecodealliance/jco-std`:

## HTTP

| Export                  | Description                                                                   |
|-------------------------|-------------------------------------------------------------------------------|
| `http/adapters/hono`    | Enables easier building of [Hono][hono] HTTP servers                          |
| `http/adapters/express` | Provides a simple [Express][express]-like interface for building HTTP servers |
| `node24.x/assert`       | `node:assert` adapter pinned at Node 24                                       |
| `node24.x/path`         | `node:assert` adapter pinned at Node 24                                       |

[express]: https://expressjs.com

# Quickstart

`@bytecodealliance/jco-std` can be used in varied ways via it's exports, this section
contains some examples of how to get started quickly.

## Hono Adapter

To use `@bytecodealliance/jco-std` to make building [Hono][hono] applications easier with WebAssembly,
use the `@bytecodealliance/jco-std/http/adapters/hono` export:

```ts
import { Hono } from "hono";

import { fire } from "@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/server";

const app = new Hono();
app.get("/", () => "Hello World!");

fire(app);

// Although we've called `fire()` with wasi HTTP configured for use above,
// we still need to actually export the `wasi:http/incoming-handler` interface object,
// as componentize-js will be looking for the ES module export.
export { incomingHandler } from "@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/server";
```

> [!NOTE]
> We use `@bytecodealliance/jco-std/wasi/0.2.x`, but if you'd like to use a specific version, you can
> use an explicitly versioned export like `@bytecodealliance/jco-std/wasi/0.2.12`.
>
> The `0.2.x` path selects the newest WASI 0.2 adapter verified with the ComponentizeJS
> version used by Jco. It may change in any `jco-std` release. Use an explicitly versioned
> path when your component must retain an older WIT world.

[hono]: https://hono.dev

## Node.js compatibility APIs

Jco can bundle the following Node.js APIs into JavaScript WebAssembly components:

- `node:assert` and `node:assert/strict`, implemented by
  `@bytecodealliance/jco-std/node24.x/assert`;
- `node:path`, `node:path/posix`, and `node:path/win32`, implemented by
  `@bytecodealliance/jco-std/node24.x/path`;
- `node:buffer`, with its modern core provided by Jco's audited unenv
  compatibility layer;
- `node:querystring`, provided by Jco's audited unenv compatibility layer.

Jco resolves Node compatibility modules in quality order:

- Custom/Higher-fidelity or WASI-aware Jco implementations
- Explicitly audited `unenv` modules.

Jco does not automatically enable unenv's complete alias list or
treat mocked and unimplemented exports as supported APIs.

The buffer adapter uses unenv's Feross `buffer` implementation for the portable
core API. Deprecated entry points (e.g. `Buffer()`/`new Buffer()` and `SlowBuffer`)
 throw immediately.

Runtime-dependent APIs without a compatible guest implementation
also throw explicit unsupported-API errors.

The current implementation does not support the `base64url` encoding accepted by
Node's Buffer.

> [!NOTE]
> The assert shim targets Node.js 24.19.0 and requires no WIT/WASI capability. It is
> published under the `node24.x` entry point, which should be used explicitly; Node majors
> are not interchangeable, so a future major is added as its own entry point rather than
> replacing this one.

There is no unversioned alias for it -- `node/path` keeps one
only for backwards compatibility (that will be removed in a future breaking-change version
of `jco-std`).

`jco-std`'s node shimcomparison and assertion behavior is adapted from the corresponding
MIT-licensed Node.js sources. Error fields and assertion outcomes are compatibility
targets; some generated diff text and JavaScript engine stack frames can differ
from Node.

Deprecated APIs remain importable but immediately throw a clear unsupported-API
error rather than running their deprecated implementation.

Note that the `node:` specifiers are replaced when Jco bundles source during
componentization. The package export can also be imported directly:

```ts
import assert, { deepStrictEqual } from "@bytecodealliance/jco-std/node24.x/assert";

assert(true);
deepStrictEqual({ ready: true }, { ready: true });
```

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
