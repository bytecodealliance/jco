# 02 - Running Components in JavaScript (NodeJS & the Browser)

> [!NOTE]
> This guide starts where "Building a component with jco" ended.
>
> Consider referring to that guide if anything here is confusing.

While JavaScript runtimes are available in browsers, they cannot yet execute WebAssembly components,
with most supporting only the [Core WebAssembly Specification][core-wasm].

A WebAssembly component built in any language (Javascript or otherwise) must be transpiled into
a [WebAssembly core module][wasm-core-module] with a JavaScript wrapper which *can* be run by
in-browser Wasm runtimes that support the core WebAssembly specification.

`jco` enables transpilation that supports *both* browser and NodeJS usage for WebAssembly Components.
This means we can WebAssembly components built in Javascript (or other languages) from Javascript-native projects.

## Transpiling a Component

Given an existing WebAssembly component (e.g. `add.wasm`), we can "transpile" the component into runnable Javscript by using `jco transpile`:

```console
jco transpile add.wasm -o out-dir
```

You should see output similar to the following:

```
  Transpiled JS Component Files:

 - out-dir/add.core.wasm                   10.1 MiB
 - out-dir/add.d.ts                         0.1 KiB
 - out-dir/add.js                          1.57 KiB
```

> [!NOTE]
> To follow along, see the [`add` example component][examples-add]
>
> With the project pulled locally, you also run `npm run transpile` which
> outputs to the slightly more standard `dist/transpiled` rather than `out-dir` above.

## Using the component from Javscript (NodeJS)

Thanks to `jco` transpilation, you can import the resulting `out-dir/add.js` file and run it from any JavaScript application
using a runtime that supports the [core WebAssembly specification][core-wasm] as implemented for Javascript.

To use this component from [NodeJS][nodejs], you can write code like the following:

```mjs
import { add } from "./out-dir/add.js";

console.log("1 + 2 = " + add(1, 2));
```

Now that we have NodeJS compatible Javascript that uses the transpiled component, we can execute it directly
with the NodeJS javascript interpreter (`node`), and you should see the following output:

```
1 + 2 = 3
```

[wasm-core-module]: https://webassembly.github.io/spec/core/binary/modules.html
[core-wasm]: https://webassembly.github.io/spec/core/
[examples-add]: https://github.com/bytecodealliance/jco/tree/main/examples/components/add
[nodejs]: https://nodejs.org

### Contribute to this Guide!

The goal for this guide is to leave zero lingering questions. If you had substantial doubts/unaddressed questions
while going through this guide, [open up an issue](https://github.com/bytecodealliance/jco/issues/new) and we'll improve the docs together.
