# StarlingMonkey backend

StarlingMonkey is Jco's default backend for `jco componentize`. It uses
[`componentize-js`](https://github.com/bytecodealliance/ComponentizeJS) to embed the
[StarlingMonkey](https://github.com/bytecodealliance/StarlingMonkey) JavaScript
runtime, based on SpiderMonkey, in a WebAssembly component. Your WIT world defines
the component's imports and exports, including custom interfaces.

Select it explicitly with `--backend starlingmonkey` or the alias `--backend sm`.
Omitting `--backend` selects the same backend.

## Installation and version ownership

Jco installs ComponentizeJS as a regular dependency, including its engine build.
You do not need to install ComponentizeJS or build StarlingMonkey separately for
the standard workflow. Updating Jco can update its backend dependencies; commit
your package manager's lockfile to keep builds reproducible.

Start a project with Jco as a development dependency and the Preview 2 shim for
running the transpiled component on Node.js:

```sh
mkdir starlingmonkey-app
cd starlingmonkey-app
npm init -y
npm pkg set type=module
npm install --save-dev @bytecodealliance/jco
npm install @bytecodealliance/preview2-shim
```

## Generate declarations, compile, and run on Node.js

Save a custom world as `hello.wit`:

```wit
package example:hello;

world hello {
    export greet: func(name: string) -> string;
}
```

Implement its export in `hello.ts`:

```ts
export function greet(name: string): string {
    return `Hello, ${name}!`;
}
```

Generate guest declarations, compile with StarlingMonkey, and transpile the
result for JavaScript hosts:

```sh
npx jco guest-types hello.wit --world-name hello -o types
npx jco componentize hello.ts --backend starlingmonkey --wit hello.wit --world-name hello -o hello.wasm
npx jco transpile hello.wasm -o transpiled
```

`guest-types` describes the WIT world in TypeScript declarations. ComponentizeJS
generates the runtime bindings from the WIT supplied to `componentize`.
The TypeScript transform erases types without checking them; run your project's
type checker separately when needed.

Save `run.mjs`:

```js
import { greet } from './transpiled/hello.js';

console.log(greet('components'));
```

Run `node run.mjs`; it prints `Hello, components!`. This synchronous example
does not require experimental Node flags. The generated module uses the Preview 2
shim for WASI imports. See [Transpiling](./transpiling.md) for custom import maps
and manual instantiation.

For a larger project, [scaffold from your WIT](./creating-new-js-components.md#scaffold-a-project-from-wit)
to generate declarations, implementation skeletons, and build scripts together.

## Source modules and runtime APIs

TypeScript entries are bundled automatically. For JavaScript entries with local
or npm dependencies, opt in to Jco's bundler with `--bundle`:

```sh
npx jco componentize app.js --bundle --wit wit -o app.wasm
```

See [Bundling](./creating-new-js-components.md#bundling) for configuration and
TypeScript module resolution. Supported `node:` imports are supplied by Jco's
experimental [Node.js compatibility adapters](./interop/nodejs-builtins.md)
during bundling; the guest is not a Node.js process. StarlingMonkey also supplies
web APIs such as `fetch`, streams, and text encoding, backed by the component's
available capabilities.

ComponentizeJS evaluates top-level module code while preparing the component's
initial snapshot. Put work that must happen on each invocation inside exported
functions, rather than relying on top-level code to run each time a host loads
the component.

## WASI features

The `--disable` and `--enable` options control StarlingMonkey's `clocks`, `http`,
`random`, `stdio`, and `fetch-event` features. Both accept `all`.
For the pure greeting above, build without the engine's optional WASI features:

```sh
npx jco componentize hello.ts --wit hello.wit --disable all -o pure.wasm
```

Only disable capabilities your source and WIT world do not require. Disabling
`stdio` removes guest console/error output; disabling `random` makes its random
values deterministic. Feature switches cannot remove imports explicitly required
by the selected WIT world. Inspect the resulting requirements with `jco wit`.

If Jco warns that it is falling back to ComponentizeJS 0.19.3 for older WASI HTTP
interfaces, follow the [WASI dependency upgrade guidance](./troubleshooting/common-issues.md#componentize-js-0193-fallback).

## Engine, AOT, and debugging options

These options apply only to StarlingMonkey; Jco rejects them for QuickJS and Perry.

| Option | Purpose |
| --- | --- |
| `--engine <path>` | Supply a compatible custom ComponentizeJS engine Wasm build. |
| `--aot` | Enable ComponentizeJS's Weval ahead-of-time compilation. |
| `--aot-min-stack-size-bytes <number>` | Configure the minimum stack size for AOT. |
| `--weval-bin <path>` / `--wizer-bin <path>` | Select custom tool binaries for compilation or initialization. |
| `--preview2-adapter <path>` | Supply a custom Preview 2 adapter. |
| `--debug-starlingmonkey-build` | Use ComponentizeJS's debug engine build. |
| `--debug-bindings` / `--debug-bindings-dir <dir>` | Inspect generated bindings and metadata. |
| `--debug-binary` / `--debug-binary-path <path>` | Inspect the generated core Wasm binary. |
| `--debug-enable-wizer-logging` | Enable Wizer call diagnostics. |

Custom engine and tool builds must match the ComponentizeJS version Jco uses.
See [ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS) for engine
and AOT details, and `jco componentize --help` for the full CLI reference.
