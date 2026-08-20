# JS String Builtins with manual instantiation

This example uses Jco's manual instantiation mode to enable the [WebAssembly JS String Builtins proposal][proposal]
for the core Wasm modulesinside a component.

The [component (written in WAT)](./palindrome.component.wat) imports `length` and `charCodeAt`
from `wasm:js-string`, and imports the fields `racecar` and `hello` from `_` as string constants.

The comopnent's exports report whether those constants are palindromes:

```text
racecar is a palindrome: true
hello is a palindrome: false
```

## Quickstart

To run the exampe, you'll need a NodeJS runtime that is recent-enough to implement the proposal,
for example NodeJS 24 or newer.

You can install and run the demo:

```console
pnpm install
pnpm run all
```

## How it works

The build converts [`palindrome.component.wat`](./palindrome.component.wat) into a WebAssembly component
then transpiles it with `--instantiation async`. That mode exports an `instantiate` function and lets
the embedder control how each core module is compiled:

```js
const compileOptions = {
    builtins: ['js-string'],
    importedStringConstants: '_',
};

async function getCoreModule(path) {
    const bytes = await readFile(new URL(path, DIST_DIR));
    return WebAssembly.compile(bytes, compileOptions);
}

const component = await instantiate(getCoreModule, {});
```

> [!NOTE]
> The options belong in `getCoreModule`, not Jco's optional `instantiateCore` hook, because
> the proposal eagerly links builtin functions and string constants while the engine compiles the bytes
> (`instantiateCore` receives a `WebAssembly.Module`, so that would be too late).

The WAT includes a small fallback core module so that the enclosing component
has a valid core-module instantiation graph.

On a supporting engine, compiling with the options above removes the `wasm:js-string`
and `_` imports before instantiation, so the fallbacks are ignored. Their functions
deliberately trap if the proposal options are not applied.

[proposal]: https://github.com/WebAssembly/js-string-builtins/blob/main/proposals/js-string-builtins/Overview.md
[jco-issue]: https://github.com/bytecodealliance/jco/issues/539
