# `@bytecodealliance/jco-transpile`

This [`@bytecodealliance/jco`][jco] sub-project enables transpilation of [WebAssembly Components][cm-book] into ES modules
that can be run in Javascript environments like NodeJS and the browser (experimental).

`@bytecodealliance/jco-transpile` is used primarily when only transpilation functionality of `jco` is needed,
and `jco` derives it's use of transpilation from this library.

> [!WARNING]
> Browser support is considered experimental, and not currently suitable for production applications.

[cm-book]: https://component-model.bytecodealliance.org/
[jco]: https://www.npmjs.com/package/@bytecodealliance/jco

# Quickstart

To use `@bytecodealliance/jco-transpile` as a library in your own code, you can use some of the exported functions.

Check out our [examples on GitHub][gh-examples].

[gh-examples]: https://github.com/bytecodealliance/jco/tree/main/examples/transpile

## Transpiling

To transpile an existing WebAssembly component (path on disk, `Buffer`):

```js
import { transpile, writeFiles } from '@bytecodealliance/jco-transpile';

async function example() {
    // Transpile a given WebAssembly component into JS runnabe in NodeJS
    const { files, imports, exports } = await transpile('path/to/component.wasm', { outDir: 'path/to/output/dir' });
    // Write out the files that have been generated to disk
    await writeFiles(files);
}
```

> [!NOTE]
> `transpile` takes many options -- consult [`transpile.d.ts`](./src/transpile.d.ts) for more detailed type information.
>
> `outDir` controls the prefix of generated file paths, so it is specified, despite the fact that no files
> are actually written to disk.

### Transpilation example

If you write a component with the given WIT:

```wit
package docs:adder@0.1.0;

interface add {
    add: func(x: u32, y: u32) -> u32;
}

world adder {
    export add;
}
```

After tranpsilation of that component, you should see output like the following:

```console
dist
└── transpiled
    ├── add.core.wasm
    ├── add.d.ts
    ├── adder.core.wasm
    ├── adder.d.ts
    ├── adder.js
    ├── add.js
    ├── add.mjs
    └── interfaces
        └── docs-adder-add.d.ts

3 directories, 8 files
```

`dist/transpiled/adder.js` is the entrypoint that can be used from "host" code:

```js
import { add } from './dist/transpiled/adder.js';

console.log('1 + 2 = ' + add.add(1, 2));
```

You can try this example for yourself [in GitHub][gh-examples-transpile-adder].

[gh-examples-transpile-adder]: https://github.com/bytecodealliance/jco/tree/main/examples/transpile/adder

## Generating guest (component) types

When writing components, you can generate the Typescript declarations that correspond to your
[WebAssembly Interface Types (WIT)][wit] imports and exports by generating guest tyeps:

```js
import { generateGuestTypes, writeFiles } from '@bytecodealliance/jco-transpile';

async function example() {
    const files = await generateGuestTypes('path/to/wit/dir-or-file, { outDir: 'path/to/output/dir' });

    // NOTE: Files is a serialization of the files produced of the following type:
    // type FileBytes = { [filepath: string]: Uint8Array; };
    //
    // You can use the code below to write out all files to a given directory
    await Promise.all(
        Object.entries(files).map(async ([filePath, bytes]) => {
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, bytes);
        })
    );
}
```

Guest types are the implementations of WIT interfaces that are used by JS components -- i.e. JS code that is
turned into a component (by `jco componentize`/`componentize-js`) and performing useful work.

For a given import in a WIT world, this type generation would enable _calling_/_using_ the interface.

### Guest type generation example

For example, given the following WIT interface:

```wit
package docs:adder@0.1.0;

interface add {
    add: func(x: u32, y: u32) -> u32;
}

world adder {
    export add;
}
```

The Typescript declaration produced is:

```
declare module 'docs:adder/add@0.1.0' {
  export function add(x: number, y: number): number;
}
```

[wit]: https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md

## Generating host types

When building platforms that run transpiled components, you can generate Typescript
declarations that correspond to the [WebAssembly Interface Types (WIT)][wit] imports (that the component requires)
by generating host types:

```js
import { generateHostTypes, writeFiles } from '@bytecodealliance/jco-transpile';

async function example() {
    // Generate types for a host binding (i.e. supplying imports to a transpiled component)
    const files = await generateHostTypes('path/to/wit/dir-or-file, { outDir: 'path/to/output/dir' });
    // Write out the files that have been generated to disk
    await writeFiles(files);
}
```

Host types are the implementations of WIT interfaces that are used by _post-transpilation_ JS code,
i.e. on the "host" (NodeJS + V8 or the browser), to make platform _imports_ work.

For a given import in a WIT world, this type generation would enable _implementation_ of the imported
functionality interface.

### Host type generation example

For example, given the following WIT interface:

```wit
package docs:adder@0.1.0;

interface add {
    add: func(x: u32, y: u32) -> u32;
}

world adder {
    export add;
}
```

The Typescript declaration produced is:

```
/** @module Interface docs:adder/add@0.1.0 **/
export function add(x: number, y: number): number;
```

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
