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

## Transpiling

To transpile an existing WebAssembly component (path on disk, `Buffer`):

```js
import { transpile } from '@bytecodealliance/jco-transpile';

async function example() {
    await transpile('path/to/component.wasm');
}
```

> [!NOTE]
> `transpile` takes many options -- consult [`transpile.d.ts`](./src/transpile.d.ts) for more detailed type information.

## Generating host types

To generate host types:

```js
import { generateHostTypes } from '@bytecodealliance/jco-transpile';

async function example() {
    await generateHostTypes('path/to/wit/dir-or-file, { outDir: 'path/to/output/dir' });
}
```

Host types are the implementations of WIT interfaces that are used by *post-transpilation* JS code,
i.e. on the "host" (NodeJS + V8 or the browser), to make platform *imports* work.

For a given import in a WIT world, this type generation would enable *implementation* of the interface.

## Generating guest types

To generate guest types:

```js
import { generateGuestTypes } from '@bytecodealliance/jco-transpile';

async function example() {
    await generateGuestTypes('path/to/wit/dir-or-file, { outDir: 'path/to/output/dir' });
}
```

Guest types are the implementations of WIT interfaces that are used by JS components -- i.e. JS code that is
turned into a component (by `jco componentize`/`componentize-js`) and performing useful work.

For a given import in a WIT world, this type generation would enable *calling*/*using* the interface.

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
