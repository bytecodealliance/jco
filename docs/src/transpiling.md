# Transpiling

Components can be transpiled in two separate modes:

* ESM Integration (default)
* [Instantiation](#instantiation) - async or sync

When using the default direct ESM transpilation mode, the output file is a JavaScript module, which imports the component imports,
and exports the component exports.

[Instantiation mode](#instantiation) allows dynamically providing the imports for the component instantiation, as well as for instantiating a component multiple times.

For the default output, you will likely want to ensure there is a package.json file with a `{ "type": "module" }` set for Node.js ES module support (although this is not needed for browser module loading or JS build tooling).

## Export Conventions

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

## Import Conventions

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

### Interface Implementation Example

For an example of the transpilation conventions and imports, consider a component with the following WIT definition:

example.wit
```wit
package test:pkg;
world myworld {
  import iface;
}
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
```

To see an example of the output without even having a real component we can use the `--stub` feature of transpile:

```
jco transpile example.wit --stub -o output
```

The `output/example.js` file contains the generated bindgen:

```js
import { interfaceFn } from 'test:pkg/interface-b';

// ... bindings ...

const iface = {
  interfaceFn: interfaceFn$1
};
export { iface, iface as 'test:pkg/iface' }
```

To implement the imported interface, the following JavaScript file can be written:

```js
export function interfaceFn (record) {
  return 'string';
}
```

> Top-level results are turned into JS exceptions, all other results are treated as tagged objects `{ tag: 'ok' | 'err', val }`.

## Instantiation

Instantiation output is enabled via `jco transpile component.wasm --instantiation sync|async`.

When using instantiation mode, the output is a JS module with a single `instantiate()` function.

For async instantiation, the instantiate function takes the following signature:

```js
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

```js
export async function getCoreModule(path: string) {
  return await WebAssembly.compile(await readFile(new URL(`./${path}`, import.meta.url)));
}
```

For synchronous instantiation, the instantiate function has the following signature:

```js
export function instantiate(
  getCoreModule: (path: string) => WebAssembly.Module,
  imports: {
    [importName: string]: any
  },
  instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => WebAssembly.Instance
): Promise<{ [exportName: string]: any }>;
```

Where instead of promises, all functions are synchronous.

