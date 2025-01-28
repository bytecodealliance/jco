# Transpiling

Components can be transpiled in two separate modes:

* ESM Integration (default)
* [Instantiation](#instantiation) - async or sync

When using the default direct ESM transpilation mode, the output file is a JavaScript module, which imports the component imports,
and exports the component exports.

[Instantiation mode](#instantiation) allows dynamically providing the imports for the component instantiation, as well as for instantiating a component multiple times.

For the default output, you will likely want to ensure there is a package.json file with a `{ "type": "module" }` set for Node.js ES module support (although this is not needed for browser module loading or JS build tooling).

## Usage

To transpile a component into JS:

```
jco transpile component.wasm -o out-dir
```

The resultant file can be imported providing the bindings of the component as if it were imported directly:

app.js
```
import { fn } from './out-dir/component.js';

fn();
```

Imports can be remapped using the `--map` flag, or to provide imports as an argument use the `--instantiation` option.

Components relying on WASI bindings will contain external WASI imports, which are automatically updated
to the `@bytecodealliance/preview2-shim` package. This package can be installed from npm separately for
runtime usage. This shim layer supports both Node.js and browsers.

## Options

Options include:

* `--name`: Give a custom name for the component JS file in `out-dir/[name].js`
* `--minify`: Minify the component JS
* `--optimize`: Runs the internal core Wasm files through Binaryen for optimization. Optimization options can be passed with a `-- <binaryen options>` flag separator.
* `--tla-compat`: Instead of relying on top-level-await, requires an `$init` promise to be imported and awaited first.
* `--js`: Converts core Wasm files to JavaScript for environments that don't even support core Wasm.
* `--base64-cutoff=<number>`: Sets the maximum number of bytes for inlining Wasm files into the JS using base64 encoding. Set to zero to disable base64 inlining entirely.
* `--no-wasi-shim`: Disable the WASI shim mapping to `@bytecodealliance/preview2-shim`.
* `--map`: Provide custom mappings for world imports. Supports both wildcard mappings (`*` similarly as in the package.json "exports" field) as well as `#` mappings for targetting exported interfaces. For example, the WASI mappings are internally defined with mappings like `--map wasi:filesystem/*=@bytecodealliance/preview2-shim/filesystem#*` to map `import as * filesystem from 'wasi:filesystem/types'` to `import { types } from '@bytecodealliance/preview2-shim/filesystem`.
* `--no-nodejs-compat`: Disables Node.js compat in the output to load core Wasm with FS methods.
* `--instantiation [mode]`: Instead of a direct ES module, export an `instantiate` function which can take the imports as an argument instead of implicit imports. The `instantiate` function can be async (with `--instantiation` or `--instantiation async`), or sync (with `--instantiation sync`).
* `--valid-lifting-optimization`: Internal validations are removed assuming that core Wasm binaries are valid components, providing a minor output size saving.
* `--tracing`: Emit tracing calls for all function entry and exits.
* `--no-namespaced-exports`: Removes exports of the type `test as "test:flavorful/test"` which are not compatible with typescript

* `--async-mode [mode]`: EXPERIMENTAL: For the component imports and exports, functions and methods on resources can be specified as `async`. The two options are `jspi` (JavaScript Promise Integration) and `asyncify` (Binaryen's `wasm-opt --asyncify`).
* `--async-imports <imports...>`: EXPERIMENTAL: Specify the component imports as `async`. Used with `--async-mode`.
* `--async-exports <exports...>`: EXPERIMENTAL: Specify the component exports as `async`. Used with `--async-mode`.

## Browser Support

Jco itself can be used in the browser, which provides the simpler Jco API that is just exactly the same
as the internal [Jco component](https://github.com/bytecodealliance/jco/blob/main/crates/js-component-bindgen-component/wit/js-component-bindgen.wit) Jco uses to self-host.

To use this browser-supported internal component build, import the `/component` subpath directly:

```js
import { transpile } from '@bytecodealliance/jco/component';
```

Most JS build tools should then correctly work with such code bundled for the browser.

### Experimental WebIDL Imports

Jco has experimental support for zero-runtime and zero-configuration WEbIDL bindings, when using the
`webidl:` interface.

A canonical WebIDL resource is not yet available, but some examples of these IDLs and WITs can be found
in the [IDL fixtures directory](https://github.com/bytecodealliance/jco/tree/main/test/fixtures/idl/).

Whenever the `webidl:` namespace is used, Jco will automatically bind such imports to the global object.

Two top-level conventions are then provided for global access:

1. A top-level `getWindow` function can be used (or for any singleton global name) to obtain the global object.
2. If the imported interface name starts with `global-` such as `global-console`, then the interface is bound
  to that object name on the global object, with dashes replaced with `.` access, ie `globalThis.console`.

Under these conventions, many WebIDL files can be directly supported for components without any additional
runtime configuration needed. A WebIDL to WIT converter is in development at https://github.com/wasi-gfx/webidl2wit.

This work is highly experimental, and contributors and improvements would be welcome to help steer this
feature to stability.

## Transpilation Semantics

### Export Conventions

Components can represent both bundles of modules and individual modules. Compponents export the direct export interface as well as the canonical named interface for the implementation to represent both of these cases.

For example a component that imports an interface will be output as:

```js
export { interface, interface as 'my:pkg/interface@version' }
```

The exact version allows for disambiguation when a component exports multiple interfaces with the same name but different versions.

If not needing this disambiguation feature, and since support for string exports in JS can be limited, this feature can be disabled with the `--no-namespaced-exports` flag to instead output only:

```js
export { interface }
```

### Import Conventions

When using the ESM integration default transpilation output bindings are output directly in the `registry:name/interface` form, but with versions removed.

For example an import to `my:pkg/interface@1.2.3` will become an import to `import { fn } from 'my:pkg/interface';`.

### Map Configuration

To customize the import specifiers used in JS, a `--map` configuration can be provided to the transpilation operation to convert the imports.

For example, `jco transpile component.wasm --map my:pkg/interface@1.2.3=./myinterface.js` will instead output `import { fn } from './myinterface.js'`.

Where the file `myinterface.js` would contain the function that is being imported from the interface:

```js
export function fn () {
  // .. function implementation ..
}
```

Map configuration also supports `#` targets, which means that the interface can be read off of a nested JS object export.

For example with a JS file written:

```js
export const interface = {
  fn () {
    // exported function to be imported from my:pkg/interface
  }
}
```

We can map the interface directly to this object instead of the entire module using the map configuration:

```
jco transpile component.wasm --map my:pkg/interface@1.2.3=./mypkg.js#interface
```

This way a single JS file can define multiple interfaces together.

Furthermore, wildcard mappings are also supported so that using (and quoting for bash compatibility):

```
jco transpile component.wasm --map 'my:pkg/*@1.2.3=./mypkg.js#*'
```

we can map all interfaces into a single JS file reading them off of exported objects for those interfaces.

### WASI Shims

WASI is given special treatment and is automatically mapped to the `@bytecodealliance/preview2-shim` npm package, with interfaces imported off of the relevant subsystem.

Using the above rules, this is effectively provided by the default map configuration which is always automatically provided:

```
jco transpile component.wasm --map wasi:cli/*@0.2.0=@bytecodealliance/preview2-shim/cli#*
```

For all subsystems - `cli`, `clocks`, `filesystem`, `http`, `io`, `random` and `sockets`.

To disable this automatic WASI handling the `--no-wasi-shim` flag can be provided and WASI will be treated like any other import without special handling.

Note that browser support for WASI is currently experimental.

### Interface Implementation Example

Here's an example of implementing a custom WIT interface in JavaScript:

example.wit
```wit
package test:pkg;
interface interface-types {
  type some-type = list<u32>;
  record some-record {
    some-field: some-type
  }
}
interface iface {
  use interface-types.{some-record};
  interface-fn: func(%record: some-record) -> result<string, string>;
}
world myworld {
  import iface;
  export test: func() -> string;
}
```

When transpiling, we can use the map rules as described in the previous section to implement all interfaces from a single JS file.

Given a component compiled for this world, we could transpile it, but given this is only an example, we can use the `--stub` feature of transpile to inspect the bindings:

```
jco transpile example.wit --stub -o output --map 'test:pkg/*=./imports.js#*'
```

The `output/example.js` file contains the generated bindgen:

```js
import { iface } from './imports.js';
const { interfaceFn } = iface;

// ... bindings ...

function test () {
  // ...
}

export { test }
```

Therefore, we can implement this mapping of the world with the following JS file:

imports.js
```js
export const iface = {
  interfaceFn (record) {
    return 'string';
  }
};
```

> Note: Top-level results are turned into JS exceptions, all other results are treated as tagged objects `{ tag: 'ok' | 'err', val }`.

## WASI Proposals

**Jco will always take PRs to support all open WASI proposals.**

These PRs can be implemented by extending the [default map configuration provided by Jco](https://github.com/bytecodealliance/jco/blob/main/src/cmd/transpile.js#L110) to support the new `--map wasi:subsytem/*=shimpkg/subsystem#*` for the WASI subsystem being implemented.

> `shimpkg` in the above refers to a published npm package implementation to install per JS ecosystem conventions. This way, polyfill packages can be published to npm.

Upstreaming into the [@bytecodealliance/preview2-shim](https://github.com/bytecodealliance/jco/tree/main/packages/preview2-shim) package is also possible for WASI proposals that have progressed to Phase 1 in the [WASI proposal stage process](https://github.com/WebAssembly/WASI/blob/main/Proposals.md).

## Instantiation

Instantiation output is enabled via `jco transpile component.wasm --instantiation sync|async`.

When using instantiation mode, the output is a JS module with a single `instantiate()` function.

For async instantiation, the instantiate function takes the following signature:

```ts
export async function instantiate(
  getCoreModule: (path: string) => Promise<WebAssembly.Module>,
  imports: {
    [importName: string]: any
  },
  instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => Promise<WebAssembly.Instance>
): Promise<{ [exportName: string]: any }>;
```

`imports` allows customizing the imports provided for instantiation.

`instantiateCore` defaults to `WebAssembly.instantiate`.

`getCoreModule` can typically be implemented as:

```ts
export async function getCoreModule(path: string) {
  return await WebAssembly.compile(await readFile(new URL(`./${path}`, import.meta.url)));
}
```

For synchronous instantiation, the instantiate function has the following signature:

```ts
export function instantiate(
  getCoreModule: (path: string) => WebAssembly.Module,
  imports: {
    [importName: string]: any
  },
  instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => WebAssembly.Instance
): Promise<{ [exportName: string]: any }>;
```

Where instead of promises, all functions are synchronous.

