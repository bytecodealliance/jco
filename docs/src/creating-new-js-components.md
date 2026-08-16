# Creating new JavaScript and TypeScript components

Jco exposes [`componentize-js`][cjs] and [`componentize-qjs`][cqjs] to make it easy to build components
from JavaScript or TypeScript ES module source code.

## Scaffold a project from WIT

The quickest way to start is `jco new`. It copies an existing WIT file or package directory into a regular Node.js
project, generates guest declarations, and creates a compiling implementation skeleton for the selected world:

```console
jco new hello-component --wit path/to/wit
cd hello-component
pnpm install
pnpm check
pnpm test
pnpm build
```

TypeScript and pnpm are the defaults. Select checked JavaScript or another package manager when creating the project:

```console
jco new hello-js --wit path/to/world.wit --language javascript --package-manager npm
```

If the WIT package contains one world, Jco selects it automatically. If it contains multiple worlds, name one with
the long-form option:

```console
jco new hello-component --wit path/to/wit --world example:hello/app
```

By default, the scaffold checks and builds both Node.js and web targets. Select only one target, or repeat `--target`
to be explicit:

```console
jco new hello-node --wit path/to/wit --target nodejs
jco new hello-web --wit path/to/wit --target web
jco new hello-both --wit path/to/wit --target nodejs --target web
```

A dual-target project has a shared `tsconfig.json`, platform-specific `tsconfig.nodejs.json` and `tsconfig.web.json`,
matching Rolldown configurations, and `build:nodejs`/`build:web` scripts. A single-target project instead uses only
`tsconfig.json`, `rolldown.config.mjs`, and `dist/component.wasm`; web-only projects do not install Node types.

The generated `README.md` records the selected world and package-manager commands. Replace TODO bodies in
`src/component.ts` (or `src/component.js`), run `pnpm types` after changing the copied `wit/` package, and use
`pnpm check`, `pnpm test`, and `pnpm build` throughout development. npm and Yarn can run the same standard scripts.

`jco componentize`, described below, remains the lower-level workflow. The former low-level `jco new` command was
renamed to `jco component-new`.

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
