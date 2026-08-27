# `jco-std`

[`@bytecodealliance/jco-std`][jco-std] is Jco's library of reusable JavaScript and
TypeScript building blocks for WebAssembly components. It gives component authors
portable implementations and ecosystem adapters that are useful across projects
but do not belong in generated WIT bindings or in a particular application.

The package complements `jco componentize`:

- `jco componentize` bundles an application and embeds it in a WebAssembly
  component with the interface described by its WIT world.
- `jco-std` supplies guest-side library code that the application can bundle,
  including selected Node.js compatibility implementations and WASI HTTP
  adapters.
- The WIT world remains the source of truth for host capabilities. Importing a
  helper does not implicitly grant filesystem, network, environment, or other
  host access.

## Installing and importing

Install `jco-std` when application source imports one of its package exports
directly:

```console
pnpm add @bytecodealliance/jco-std
```

`jco-std` is ordinary ESM and can be bundled with the rest of the component:

```ts
import assert from '@bytecodealliance/jco-std/node/assert';

assert.equal(1 + 1, 2);
```

Jco also consumes parts of `jco-std` internally. When bundled source imports a
supported specifier such as `node:assert`, Jco automatically redirects it to the
appropriate compatibility implementation. Applications do not need to rewrite
those imports to a `jco-std` package path. See [Node.js built-in
compatibility](./nodejs-builtins.md) for the resolution model and current support
matrix.

## Using `jco-std` and Node built-ins together

Direct `jco-std` imports and automatic Node built-in compatibility are
complementary. They can be used in the same source graph and bundled into the same
component. Enabling a supported `node:` import does not disable or replace
`jco-std` adapters, and importing a `jco-std` adapter does not disable Node
compatibility.

For example, a Hono component can use the jco-std server adapter while ordinary
application modules use Node's assert and Buffer APIs:

```ts
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { Hono } from 'hono';

import { fire, incomingHandler } from '@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/server';

const app = new Hono();
app.get('/', (context) => {
    const body = Buffer.from('Hello from a component');
    assert(body.byteLength > 0);
    return context.body(body);
});

fire(app);

export { incomingHandler };
```

Jco bundles the explicit package import and independently rewrites the supported
`node:` imports. The component's WIT world still needs the WASI HTTP capabilities
used by the Hono adapter; assert and Buffer do not add further capabilities.

## Node.js compatibility implementations

`jco-std` currently owns the implementations for:

- `node:assert` and `node:assert/strict`, adapted from Node.js 24 for portable
  execution without a host capability; and
- `node:path`, `node:path/posix`, and `node:path/win32`, implemented with portable
  path algorithms and a `wasi:cli/environment` provider for operations that need
  the guest working directory.

Not every Node compatibility module lives in `jco-std`. Jco can also bundle an
audited upstream implementation directly when that is the better fit. For
example, the current Buffer and querystring cores come from unenv and are wrapped
by Jco during bundling. Keeping this boundary flexible lets Jco reuse mature
upstream work while retaining WASI-aware or higher-fidelity local implementations
where needed.

## Hono and WASI HTTP

The Hono adapter connects a normal [Hono][hono] application to a
`wasi:http/incoming-handler` component export:

```ts
import { Hono } from 'hono';

import { fire, incomingHandler } from '@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/server';

const app = new Hono();
app.get('/', (context) => context.text('Hello from a component'));

fire(app);

export { incomingHandler };
```

The package also exports Hono middleware adapters for WASI configuration and
environment access. These helpers translate between familiar JavaScript
framework conventions and the corresponding component interfaces; the target WIT
world must still import and export the required WASI interfaces.

### WASI version selection

The `wasi/0.2.x` package path selects the newest WASI 0.2 adapter verified with
the ComponentizeJS version used by Jco. It can advance in a `jco-std` release.

Use a fully versioned export such as `wasi/0.2.12`, `wasi/0.2.6`, or
`wasi/0.2.3` when the component must stay aligned with a particular WIT world.
The package export and the versions imported by that world must agree.

## Design expectations

Code in `jco-std` is intended to be:

- portable across the JavaScript engines supported by Jco;
- explicit about every WASI capability it consumes;
- fully typed at its public boundaries;
- tested from guest code after componentization; and
- clear about code adapted from upstream projects and any intentional behavioral
  differences.

This makes `jco-std` a focused interoperability library rather than an attempt to
recreate every browser, Node.js, or framework API. New adapters belong here when
they can provide a reusable, well-defined bridge between ordinary JavaScript code
and WebAssembly component interfaces.

[hono]: https://hono.dev/
[jco-std]: https://www.npmjs.com/package/@bytecodealliance/jco-std
