# [SvelteKit](https://svelte.dev/docs/kit) Node server ([via Node.js adapter](https://github.com/sveltejs/kit/tree/main/packages/adapter-node))

This example builds a small TODO application with the official SvelteKit Node
adapter, then runs the same generated request handler directly in Node.js and as
a WebAssembly component using jco-std's Node API support. Both launchers accept
an explicit `PORT`, serve SvelteKit's SSR HTML and client assets, and execute the
same form actions. TODO state lives in memory and starts fresh with each server
process.

> [!WARNING]
> Jco's Node.js built-in compatibility for components is experimental and subject
> to change. APIs, behavior, and generated component interfaces may change
> incompatibly without a semver-major release.

## How it works

The standard SvelteKit Node deployment flow starts when Vite builds the
application with `@sveltejs/adapter-node`. The adapter produces
`build/handler.js`, containing SvelteKit's SSR server, form-action routing, and
static asset middleware. Normally, an application imports that handler, passes
it to a `node:http` server, and starts listening.

When Jco builds the same server into a WebAssembly component, the application
code stays the same, but the build output and Node API boundary change:

1. [`src/component.ts`](./src/component.ts) exposes `start(port)` and `stop()`; the
   native launcher in [`src/serve-node.ts`](./src/serve-node.ts) calls them
   directly.
2. Jco componentizes that same server module and exports the lifecycle functions
   through the example's WIT world. Its bundler replaces Node imports with
   jco-std interfaces.
3. Jco transpiles the StarlingMonkey component back to an instantiable ES
   module. [`src/run-transpiled.ts`](./src/run-transpiled.ts) supplies the Node
   API and WASI hosts, starts the component, and listens on the requested port.

JavaScript compiled into a WebAssembly component does not normally have access
to Node.js APIs. This example opts into jco-std's
[Node API built-in support](https://bytecodealliance.github.io/jco/interop/nodejs-builtins.html)
so the component can use these ordinary Node APIs:

| API                                                     | Purpose                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `node:http`                                             | Listen for requests and run the adapter's handler.            |
| `node:fs` and `node:path`                               | Index and serve the generated SvelteKit client assets.        |
| `node:process`                                          | Read the adapter's environment and current working directory. |
| `node:stream`, `node:buffer`, and related portable APIs | Bridge Node request bodies and Web responses.                 |

The runner in [`src/run-transpiled.ts`](./src/run-transpiled.ts) supplies direct
Node HTTP, filesystem, and process providers plus preview2-shim's WASI imports.
The adapter dependency graph also imports `node:tty` through Node's stream
surface; the example provides a non-terminal host because the application
performs no terminal I/O but Node still initializes its standard streams.

The generated WIT world and dependencies are committed under [`wit`](./wit).
`pnpm run generate:types` uses Jco to regenerate the strict TypeScript component
shape under [`generated/types`](./generated/types). `svelte-check` verifies the
Svelte templates, route actions, server lifecycle, launcher, and e2e tests.

## Quickstart

Use Node.js 24 or newer and pnpm. This example uses workspace packages because
it exercises Node compatibility support from this checkout. From this example
directory, install and build the tooling once:

```console
pnpm install
pnpm --filter @bytecodealliance/jco run build
pnpm --filter @bytecodealliance/jco-std run build:ts
pnpm --filter @bytecodealliance/preview2-shim run build
pnpm run setup:browser
```

Then build and test the complete example:

```console
pnpm run all
```

The `all` script generates types, builds the SvelteKit application, performs
strict type checking, creates and transpiles `component.wasm`, and runs the same
HTTP assertions against native Node.js and the component. It then runs a
separate headless Puppeteer test against the component. Together the tests cover
SSR, generated CSS and JavaScript assets, add/toggle/remove actions, validation,
404s, process-local state, automatically allocated ports, and real browser
interaction.

Run the browser test with a visible Chrome window when debugging:

```console
pnpm run test:browser:headful
```

## Run the application

After `pnpm run all`, start the component on the default port:

```console
pnpm run serve
```

Open <http://127.0.0.1:3000>. Select another port with `PORT`:

```console
PORT=4173 pnpm run serve
```

To compare with native Node.js, stop the component server and run the same
adapter output directly:

```console
PORT=4173 pnpm run serve:node
```

## Componentization gotchas

StarlingMonkey does not yet support component-model async guest exports, so the
WIT world keeps `start` and `stop` synchronous. Jco's generated JSPI-aware
TypeScript bindings still let the Node runner await those calls and the async
HTTP callbacks.

jco-std's `AsyncLocalStorage` support is intentionally synchronous, while
SvelteKit uses async request-local storage. The component-only bundle config
selects SvelteKit's existing serialized-request fallback. It also bypasses
`String.prototype.normalize` for generated ASCII asset names because that
method is not currently available in StarlingMonkey.

The Node stream implementation does not yet model `fs.createReadStream` across
the component boundary. [`src/runtime.ts`](./src/runtime.ts) therefore serves
SvelteKit's generated `/_app` assets with `readFileSync` before handing all other
requests to the adapter. The component has access to the host filesystem so it
can read `build/client`; production-grade filesystem confinement,
authentication, and persistent TODO storage are outside this example's scope.

The component launcher uses Node's `--experimental-wasm-jspi` flag for async
component callbacks.

Wizer is the part of the componentization pipeline that runs the JavaScript
module once at build time and snapshots its initialized engine state into the
resulting Wasm. The future runtime's host capabilities are not attached during
that build-time execution.

Loading `node:http` initializes host-backed Node state, and the Node adapter
reads `process.env` and indexes its generated client directory. The wrapper
therefore dynamically imports [`src/runtime.ts`](./src/runtime.ts), which loads
`node:http` and the adapter entry point, inside `start` after the component
embedder has supplied HTTP, process, filesystem, and TTY capabilities.
