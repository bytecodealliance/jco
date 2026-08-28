# `jco-std`

[`@bytecodealliance/jco-std`][jco-std] is Jco's library of reusable JavaScript and
TypeScript building blocks for WebAssembly components.

The goal of `jco-std` is to provide component authors portable implementations
and ecosystem adapters that are useful across projects but do not belong in
generated WIT bindings or in a particular application.

## Relationship to componentization

`jco-std` is best used with `jco componentize`:

- `jco componentize` builds JS code into a WebAssembly component matching a WIT world.
- `jco-std` supplies guest-side library code that the application can bundle,
  including selected Node.js compatibility implementations and WASI HTTP
  adapters.

Note that the WIT world remains the source of truth for host capabilities. Importing a
helper does not implicitly grant filesystem, network, environment, or other host access.

Generally, helpers will be specific about the version of underlying dependencies (WASI, NodeJS)
in use, and force users to pick a pinned version where appropriate.

## Installing `jco-std`

Install `jco-std` when application source directly uses a package export such as
a WASI HTTP framework adapter:

```console
pnpm add @bytecodealliance/jco-std
```

`jco-std` is ordinary ESM, so Jco bundles those explicit imports with the rest of
the component.

## Use normal imports for Node.js built-ins

Application code should import supported Node.js APIs exactly as it would under
Node.js. Do not rewrite a Node.js built-in import to an internal `jco-std` export:

```ts
import assert from 'node:assert/strict';

assert.equal(1 + 1, 2);
```

### Componentizing JS code

Componentize the source with Jco's Node.js built-in support. TypeScript entry
points are bundled automatically; JavaScript entry points need `--bundle`:

```console
jco componentize app.ts --wit wit -o app.wasm
jco componentize app.js --bundle --wit wit -o app.wasm
```

Jco consumes selected `jco-std` implementations internally and redirects the
supported `node:` specifier while bundling.

The application retains normal Node.js source code and does not need `jco-std`
as a direct dependency solely for built-in compatibility.

> [!NOTE]
> See [Node.js built-in compatibility](./nodejs-builtins.md) for the resolution
> model and current support matrix.

## Using `jco-std` and Node built-ins together

`jco-std` imports and automatic Node built-in compatibility (e.g. `node:path`) are
complementary -- you can use both in the same source graph and bundled into the same
component.

Enabling a supported `node:` import does not disable or replace
`jco-std` adapters, and importing a `jco-std` adapter does not disable Node
compatibility.

### Example

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
  the guest working directory; and
- the synchronous `node:child_process` API, bridged through the explicit
  `jco:node/child-process@0.1.0` host capability. Its default provider denies
  access, while an opt-in Node host provider delegates to the real
  `node:child_process` implementation.

Not every Node compatibility module lives in `jco-std`. Jco can also bundle an
audited upstream implementation directly when that is the better fit. For
example, the current Buffer and querystring cores come from `unenv` and are wrapped
by Jco during bundling -- this allows Jco to use mature upstream work and sprinkle in
WASI support where necessary.

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
