# Creating new JavaScript and TypeScript components

Jco exposes [`componentize-js`][cjs] and [`componentize-qjs`][cqjs] to make it easy to build components
from JavaScript or TypeScript ES module source code.

## Scaffold a project from WIT

The quickest way to start a new component is with `jco scaffold`.

`jco scaffold` uses an existing WIT package file or directory to produce a JS component project that builds for
NodeJS or the Web, including typescript declarations and an implementation skeleton.

To use `jco scaffold`, simply name the folder and point at the WIT directory:

```console
jco scaffold hello-component --wit path/to/wit
```

Jco also bundles official WASI WIT packages for three common starting points:

```console
jco scaffold my-command --wit builtin:wasi-command
jco scaffold my-http-service --wit builtin:wasi-proxy
jco scaffold my-reactor --wit builtin:wasi-reactor
```

Without a version suffix these select WASI 0.3.0. To target the latest bundled WASI 0.2 release instead, use
`@0.2.x` (currently 0.2.12):

```console
jco scaffold my-command --wit builtin:wasi-command@0.2.x
```

The command and reactor aliases select the `wasi:cli/command` and `wasi:cli/imports` worlds. The proxy alias selects
`wasi:http/service` in WASI 0.3 and `wasi:http/proxy` in WASI 0.2. Jco copies the selected snapshot into the generated
project's `wit/` directory, so this workflow does not require a registry client or network access.

After runnig this command you can enter the folder and build the project:

```console
cd hello-component
pnpm install
pnpm check
pnpm test
pnpm build
```

By default Typescript and `pnpm` are used, but you may use JS and other package managers if desired:

```console
jco scaffold hello-js \
    --wit path/to/world.wit \
    --language javascript \
    --package-manager npm
```

If your WIT package contains one world, Jco selects it automatically. If it contains multiple worlds, use the `--world`
option to specify which one you'd like to target:

```console
jco scaffold hello-component \
    --wit path/to/wit \
    --world example:hello/app
```

By default, the scaffold checks and builds both Node.js and web targets. To build for only one target, you can use the
`--target` option. Note that the option can be repeated (this has the same effect as not specifying it):

```console
jco scaffold hello-node --wit path/to/wit --target nodejs
jco scaffold hello-web --wit path/to/wit --target web
jco scaffold hello-both --wit path/to/wit --target nodejs --target web
```

Multi-target projects have some shared files (`tsconfig.json`) but also platform specific files (e.g. `tsconfig.nodejs.json`),
with differing Rolldown configurations and scripts available in `package.json` for building (e.g. `build:nodejs` vs `build:web`).

A `README.md` will be generated which records the selected world and package-manager commands.

To scaffold the other side of the component boundary, use `--host`. This generates a host plugin whose default export
is an imports object ready to pass to the component's `instantiate` function:

```console
jco scaffold hello-host --wit path/to/wit --world example:hello/app --host
```

The regular scaffold implements the world's exports in `src/component.ts`; the host scaffold implements its imports
in `src/plugin.ts`. This makes it possible to generate both sides from the same WIT world.

Replace TODO bodies in generated files (`src/component.{js,ts}`), run `pnpm types` (or `npm run types`) after changing the
copied `wit/` package, and use `pnpm check`, `pnpm test`, and `pnpm build` throughout development.

## Build source directly

Building a JavaScript component is as easy as calling `jco componentize`, with a few options:

```console
jco componentize -w wit -o dist/component.wasm component.js
```

StarlingMonkey is the default backend, but you can use [`componentize-qjs`][qjs] which is powered by [`quickjs-ng`][quickjs-ng] by passing `--backend quickjs` or `--backend qjs`:

```console
jco componentize --backend qjs -w wit -o dist/component.wasm component.js
```

The StarlingMonkey backend also accepts the aliases `starlingmonkey` and `sm`. Note that `--engine <path>`
allows supplying a a custom StarlingMonkey build and cannot be combined with the `componentize-qjs` backend.

TypeScript entry modules are transformed and bundled automatically:

```console
jco componentize -w wit -o dist/component.wasm component.ts
```

Jco uses Rolldown's native TypeScript support to erase type syntax. This does not perform semantic type
checking; run `tsc --noEmit` separately when type checking is part of your build. TypeScript component
projects can import local modules and npm dependencies, and Jco discovers the nearest `tsconfig.json`
from the entry project.

There are many examples in the [Jco component examples folder][jco-component-examples]

[cjs]: https://github.com/bytecodealliance/componentize-js
[cqjs]: https://github.com/andreiltd/componentize-qjs
[quickjs-ng]: https://github.com/quickjs-ng/quickjs
[jco-component-examples]: https://github.com/bytecodealliance/jco/tree/main/examples/components

## Bundling

By default, Jco passes a JavaScript source module directly to the selected componentization backend with no
intermediate processing. TypeScript entry modules are always bundled so the backend receives generated JavaScript.

Use `--bundle` to bundle the entry module and its local or npm package dependencies before componentization.
Package resolution starts from the entry module's project, and `wasi:*` imports remain external so they can
be matched to component capabilities.

Passing `--bundle` for a TypeScript entry is supported but unnecessary.

> [!NOTE]
> Rolldown automatically treats unresolved imports (e.g. `wasi:http`, which is not a traditional import)
> as external, and prints warnings for imports it deems missing.
> By default we mark `wasi:*` imports as external, but in a future release automatic detection of import/export
> interfaces will mark all expected imports as well.

The bundle itself is generated in memory as a single ES module:

```shell
jco componentize app.js --bundle --wit wit -o component.wasm
```

### Customizing bundle configuration

If you need to configure the Rolldown-generated bundle and do some processing on top of the default configuration,
use `--bundle-config <path>` to merge a [Rolldown configuration module][rolldown-config-docs]. JavaScript entries
must also specify `--bundle`; TypeScript entries bundle automatically and do not need the redundant flag.

The module can export a configuration object created with Rolldown's `defineConfig` helper:

```js
// rolldown.config.mjs
import { defineConfig } from 'rolldown';

export default defineConfig({
    resolve: {
        alias: {
            // For example, if you wanted to hard-code/mock a certain import
            'virtual:config': './src/config.js',
        },
    },
    transform: {
        define: {
            // For example, if you wanted to specify a build-time transform
            __BUILD_MODE__: JSON.stringify('component'),
        },
    },
});
```

```console
jco componentize app.js --bundle --bundle-config rolldown.config.mjs --wit wit -o component.wasm
```

`jco componentize` will merge the following configurations:

- plugins
- aliases
- external rules
- transforms
- output customization

Other settings will remain fixed/overriden by the built-in configuration to Jco where necessary to
ensure a component is built properly.

Providing configuration functions in your supplemental config files is supported (`{ bundle: true }`
will be provided as an input). Configuration arrays and configuration files that produce multiple outputs
will be rejected.

Rolldown uses the nearest `tsconfig.json` for TypeScript entries unless the supplemental configuration provides
an explicit `tsconfig` setting. TSX follows the JSX mode and runtime configured by that project. Any JSX runtime
introduced by the transform must be resolvable and compatible with the component environment.

[rolldown-config-docs]: https://rolldown.rs/apis/cli#configuration-files
