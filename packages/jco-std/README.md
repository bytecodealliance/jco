# `@bytecodealliance/jco-std`

This [`@bytecodealliance/jco`][jco] sub-project contains shared functionality and
reusable libraries that can be used for building WebAssembly Components in Javascript.

[WebAssembly Components][cm-book] are a WebAssembly binaries that use the Component Model,
an evolving architecture for interoperabl WebAssembly libraries, aplications and environments.

WebAssembly components can be used from server side applications *and* in the browser, and
`@bytecodealliance/jco-std` contains shared functionality and helpers for both environments.

> [!WARNING]
> Browser support is considered experimental, and not currently suitable for production applications.

[cm-book]: https://component-model.bytecodealliance.org/
[jco]: https://www.npmjs.com/package/@bytecodealliance/jco

# Quickstart

`@bytecodealliance/jco-std` can be used in varied ways via it's exports, this section
contains some examples of how to get started quickly.

## Hono Adapter

To use `@bytecodealliance/jco-std` to make building [Hono][hono] applications easier with WebAssembly,
use the `@bytecodealliance/jco-std/http/adapters/hono` export:

```ts
import { Hono } from 'hono';

import { fire } from '@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono/server';

const app = new Hono();
app.get('/', () => "Hello World!");

fire(app);

// Although we've called `fire()` with wasi HTTP configured for use above,
// we still need to actually export the `wasi:http/incoming-handler` interface object,
// as componentize-js will be looking for the ES module export.
export { incomingHandler } from '@bytecodealliance/jco-std/http/adapters/hono/server';
```

[hono]: https://hono.dev

# Utilites

Below is a list of utilties provided by `@bytecodealliance/jco-std`:

## HTTP

| Export                  | Description                                                                   |
|-------------------------|-------------------------------------------------------------------------------|
| `http/adapters/hono`    | Enables easier building of [Hono][hono] HTTP servers                          |
| `http/adapters/express` | Provides a simple [Express][express]-like interface for building HTTP servers |

[express]: https://expressjs.com

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
