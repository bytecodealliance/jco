# QuickJS backend

`jco componentize --backend quickjs` builds components with
[`componentize-qjs`](https://github.com/andreiltd/componentize-qjs), which embeds
the [QuickJS-NG](https://github.com/quickjs-ng/quickjs) JavaScript engine.
The alias `--backend qjs` selects the same backend. Your WIT world defines the
component's imports and exports, including custom interfaces.

## Installation and version ownership

`componentize-qjs` is a regular Jco dependency. Installing Jco includes the backend
and its packaged runtime; you do not need a separate QuickJS CLI installation.
The package selects a native compiler binding for the build machine. See
[componentize-qjs](https://github.com/andreiltd/componentize-qjs) for supported
platforms. Commit your package manager's lockfile to pin the backend alongside Jco.

Start a project with Jco and the Preview 2 shim used by the transpiled component:

```sh
mkdir quickjs-app
cd quickjs-app
npm init -y
npm pkg set type=module
npm install --save-dev @bytecodealliance/jco
npm install @bytecodealliance/preview2-shim
```

## Generate declarations, compile, and run on Node.js

Save `hello.wit`:

```wit
package example:hello;

world hello {
    export greet: func(name: string) -> string;
}
```

Implement the export in `hello.ts`:

```ts
export function greet(name: string): string {
    return `Hello, ${name}!`;
}
```

Generate declarations and build with the synchronous QuickJS runtime for this
synchronous world:

```sh
npx jco guest-types hello.wit --world-name hello -o types
npx jco componentize hello.ts --backend quickjs --backend-qjs-disable-async --wit hello.wit --world-name hello -o hello.wasm
npx jco transpile hello.wasm -o transpiled
```

`guest-types` generates declarations for authoring against the WIT world; the
backend generates its runtime bindings during componentization. TypeScript
entries are bundled and have their type syntax erased automatically, without
semantic type checking. Run your project's type checker separately when needed.

Save `run.mjs`:

```js
import { greet } from './transpiled/hello.js';

console.log(greet('components'));
```

Run `node run.mjs`; it prints `Hello, components!` without experimental Node
flags. [Transpiling](./transpiling.md) describes how WASI imports are mapped to the
Preview 2 shim and how to supply custom host imports.

## Synchronous and async runtimes

QuickJS embeds an async-capable Component Model runtime by default, even when
your WIT exports are synchronous. That output requires a host with the necessary
async support. Pass `--backend-qjs-disable-async` to select the packaged
non-async runtime for synchronous components, as in the Node.js example above.

This is a componentization choice, separate from `jco transpile --async-mode`.
It does not convert async WIT functions to synchronous functions. Keep the
default runtime when your world uses Component Model async features and select
a host and transpilation configuration that support them. See the upstream
[async examples](https://github.com/andreiltd/componentize-qjs#async-exports).

## WASI imports and stubs

The embedded runtime can add WASI imports beyond those written explicitly in
your world. Inspect the finished component with `jco wit hello.wasm` to see its
complete requirements.

For code that does not use WASI, `--backend-qjs-stub-wasi` replaces WASI imports
with trapping stubs. For example, the greeting can be built with:

```sh
npx jco componentize hello.ts --backend qjs --backend-qjs-disable-async --backend-qjs-stub-wasi --wit hello.wit -o pure.wasm
```

Calling a replaced WASI function traps. This option does not emulate filesystem,
console, clock, or other host services; use the normal runtime and supply its
imports when the application needs them. It does not remove custom non-WASI
imports from your world.

StarlingMonkey's `--disable` and `--enable` feature switches, `--engine`, AOT,
and engine-debug options are not supported by this backend. Use QuickJS's
backend-specific switches and `jco componentize --help` for the Jco CLI surface;
the standalone `componentize-qjs` CLI has a different set of options.

## Modules and Node.js compatibility

For JavaScript entries, pass `--bundle` to bundle local modules and npm packages
with Jco. TypeScript entries already take this path:

```sh
npx jco componentize app.js --backend qjs --bundle --wit wit -o app.wasm
```

Bundling also supplies Jco's experimental
[Node.js compatibility adapters](./interop/nodejs-builtins.md) for supported
`node:` imports. These can introduce additional component imports, and their
runtime requirements still apply; selecting QuickJS does not embed Node.js.
QuickJS's host timer adapters require the async runtime and are omitted when
`--backend-qjs-disable-async` is set.

Both backend initialization and module evaluation happen while preparing the
component snapshot. Put work that must happen at runtime in exported functions.
See [Bundling](./creating-new-js-components.md#bundling) for module resolution and
Rolldown configuration, or [scaffold a project](./creating-new-js-components.md#scaffold-a-project-from-wit)
to generate an implementation skeleton from WIT.
