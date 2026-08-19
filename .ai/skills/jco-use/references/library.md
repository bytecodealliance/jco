# Jco library and bundler reference

Use `@bytecodealliance/jco` for its stable convenience API and CLI package. Use `@bytecodealliance/jco-transpile` for path/byte transpilation, type generation, and lower-level helpers. Both are ESM packages.

```sh
pnpm add @bytecodealliance/jco-transpile
```

## `@bytecodealliance/jco-transpile`

The main export provides:

- `transpile(path, options)` and `transpileBytes(bytes, options)` -> `{ files, imports, exports }`.
- `generateHostTypes(witPath, options)` and `generateGuestTypes(witPath, options)` -> `Record<string, Uint8Array>`.
- `writeFiles(files)` to create parent directories and write generated outputs.
- `componentWitMetadataForWorld(...)` for WIT world metadata.

Common transpilation options mirror the CLI in camelCase: `name`, `outDir`, `map`, `instantiation`, `importBindings`, `asyncMode`, `asyncImports`, `asyncExports`, `asyncWasiImports`, `asyncWasiExports`, `wasiShim`, `emitTypescriptDeclarations`, `tlaCompat`, `nodejsCompat`, `base64Cutoff`, `minify`, `optimize`, `optimizeOptions`, `js`, `tracing`, `namespacedExports`, `multiMemory`, `strict`, `flagsAsBigInt`, and `stub`.

```js
import { transpile, writeFiles } from '@bytecodealliance/jco-transpile';

const result = await transpile('component.wasm', {
  outDir: 'generated',
  instantiation: 'async',
  map: { 'example:host/api': './host.js' },
});
await writeFiles(result.files);
console.log({ imports: result.imports, exports: result.exports });
```

`outDir` prefixes returned file keys; generation is otherwise in-memory until `writeFiles` or caller-owned I/O runs.

### Subpath exports

- `@bytecodealliance/jco-transpile/helpers`: use `getCoreModuleWithBaseDir` or its sync variant as loaders for custom instantiation.
- `@bytecodealliance/jco-transpile/wasm-tools`: use async `print`, `parse`, `componentWit`, `componentNew`, `componentEmbed`, `metadataShow`, `metadataAdd`, and `componentWitMetadataForWorld` on bytes.
- `@bytecodealliance/jco-transpile/component`: use raw bindgen component exports only when the higher-level API is insufficient.

## `@bytecodealliance/jco`

The package root exposes byte-oriented `transpile` and `opt`, path-oriented `types`, Wasm-tools helpers, and `preview1AdapterCommandPath`/`preview1AdapterReactorPath`. `transpile(bytes, options)` returns generated files plus imports/exports; `types(witPath, options)` returns generated declaration files; `opt(bytes, options)` returns the optimized component plus compression information.

The `@bytecodealliance/jco/component` browser-compatible export provides initialized low-level `generate` and `generateTypes` functions (`transpile` remains an alias for compatibility). Prefer `jco-transpile` for ordinary Node automation because its path/byte APIs and option names are easier to use.

## Custom instantiation and shims

Transpile with `instantiation: 'async'` when the host must supply imports:

```js
import { getCoreModuleWithBaseDir } from '@bytecodealliance/jco-transpile/helpers';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { instantiate } from './generated/component.js';

const wasi = new WASIShim({
  sandbox: { preopens: {}, env: {}, args: [], enableNetwork: false },
});
const instance = await instantiate(
  getCoreModuleWithBaseDir({ baseDir: './generated' }),
  wasi.getImportObject(),
);
```

Omit the loader only when the generated loader's `fetch` behavior fits the runtime. Prefer async loading. Custom instantiation turns off automatic WASI mapping, so provide every import or map it during generation.

The default Preview 2 shim mirrors normal Node access; it is not a security boundary without explicit sandbox options. Preview 3 support is experimental.

## Rolldown or Rollup

Install stable Rolldown 1.x (or Rollup 4+) and the plugin:

```sh
pnpm add -D rolldown @bytecodealliance/rolldown-plugin-jco
```

```js
// rolldown.config.mjs
import { defineConfig } from 'rolldown';
import jco from '@bytecodealliance/rolldown-plugin-jco';

export default defineConfig({
  input: 'src/main.js',
  platform: 'node',
  plugins: [jco({ transpile: { minify: true } })],
});
```

Import `./component.wasm` or `./component.wasm?component`. The default export instantiates; import-free components also expose eager named exports. For components with imports, set `transpile.instantiation` to `async` or `sync`, call the default export with a core-module loader and import object, and use the returned instance or live named bindings. Do not destructure a namespace before custom instantiation because that captures initial `undefined` values.

The plugin accepts `include`, `exclude`, forwarded `transpile` options, and a `name(id)` callback. It owns `name` and `outDir`. Enable generic TypeScript `.wasm` declarations with `"types": ["@bytecodealliance/rolldown-plugin-jco/wasm"]`; precise per-component declarations are not yet generated.

## Related packages

- Use `@bytecodealliance/preview2-shim` for WASI 0.2 host implementations and configurable sandboxing.
- Treat `@bytecodealliance/preview3-shim` and browser support as experimental.
- Use `@bytecodealliance/jco-std` for framework helpers such as Hono/Express-style WASI HTTP adapters.
- Do not install the unscoped `jco` package; it is a placeholder directing users to `@bytecodealliance/jco`.
