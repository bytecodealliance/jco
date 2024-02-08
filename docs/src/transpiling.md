# Transpiling

Components can be transpiled in two separate modes:

* ESM Integration (default)
* [Instantiation](#instantiation) - async or sync

When using the default direct ESM transpilation mode, the output file is a JavaScript module, which imports the component imports,
and exports the component exports.

[Instantiation mode](#instantiation) allows dynamically providing the imports for the component instantiation, as well as for instantiating a component multiple times.

For the default output, you will likely want to ensure there is a package.json file with a `{ "type": "module" }` set for Node.js ES module support (although this is not needed for browser module loading or JS build tooling).

## Import Conventions

When using the ESM integration default transpilation output bindings are output directly in the `registry:name/interface` form, but with versions removed.

For example an import to `my:package/interface@1.2.3` will become an import to `import { fn } from 'my:package/interface';`.

### Map Configuration

To customize the import specifiers used in JS, a `--map` configuration can be provided to the transpilation operation to convert the imports.

For example, `jco transpile component.wasm --map my:package/interface@1.2.3=./myinterface.js` will instead output `import { fn } from './myinterface.js'`.

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
    // exported function to be imported from my:package/interface
  }
}
```

We can map the interface directly to this object instead of the entire module using the map configuration:

```
jco transpile component.wasm --map my:package/interface@1.2.3=./mypackage.js#interface
```

This way a single JS file can define multiple interfaces together.

Furthermore, wildcard mappings are also supported so that using (and quoting for bash compatibility):

```
jco transpile component.wasm --map 'my:package/*@1.2.3=./mypackage.js#*'
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

