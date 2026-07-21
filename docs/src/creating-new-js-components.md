# Creating new JS components

Jco relies on and exposes [`componentize-js`][cjs] to make it easy to build components from Javascript
ES module source code.

Building JS components is as easy as calling `jco componentize`, with a few options:

```
jco componentize -w wit -o dist/component.wasm component.js
```

There are many examples in the [Jco component examples folder][jco-component-examples]

[cjs]: https://github.com/bytecodealliance/componentize-js
[jco-component-examples]: https://github.com/bytecodealliance/jco/tree/main/examples/components

## Bundling (optional)

By default, Jco passes the source module JS code directly to ComponentizeJS, with no intermediate processing.

Use `--bundle` to bundle the entry module and its local or npm package dependencies before componentization.
Package resolution starts from the entry module's project, and `wasi:*` imports remain external so they can
be matched to component capabilities.

> [!NOTE]
> Rolldown automatically treats unresolved imports (e.g. `wasi:http`, which is not a traditional import)
> as external, and prints warnings for imports it deems missing.
> By default we mark `wasi:*` imports as external, but in a future release automatic detection of import/export
> interfaces will mark all expected imports as well.
>

The bundle itself is generated in memory as a single ES module:

```shell
jco componentize app.js --bundle --wit wit -o component.wasm
```

### Customizing bundle configuration

If you need to configure the Rolldown-generated bundle and do some processing on top of the default configuration,
use `--bundle-config <path>` with `--bundle` to merge a [Rolldown configuration module][rolldown-config-docs].

The module can export a configuration object created with Rolldown's `defineConfig` helper:

```js
// rolldown.config.mjs
import { defineConfig } from "rolldown";

export default defineConfig({
    resolve: {
        alias: {
            // For example, if you wanted to hard-code/mock a certain import
            "virtual:config": "./src/config.js",
        },
    },
    transform: {
        define: {
            // For example, if you wanted to specify a build-time transform
            __BUILD_MODE__: JSON.stringify("component"),
        },
    },
});
```

```console
jco componentize app.js --bundle --bundle-config rolldown.config.mjs --wit wit -o component.wasm
```

`jco componentize` will merge the following configurations:

* plugins
* aliases
* external rules
* transforms
* output customization

Other settings will remain fixed/overriden by the built-in configuration to Jco where necessary to
ensure a component is built properly.

Providing configuration functions in your supplemental config files is supported (`{ bundle: true }`
will be provided as an input). Configuration arrays and configuration files that produce multiple outputs
will be rejected.

[rolldown-config-docs]: https://rolldown.rs/apis/cli#configuration-files
