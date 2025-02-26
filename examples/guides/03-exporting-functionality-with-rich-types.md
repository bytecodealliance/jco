# 03 - Exporting funcitonality with rich types

> [!NOTE]
> This guide starts where "Building a Component with jco" ended.
>
> Consider referring to that guide if anything here is confusing.

`export`ing WIT interfaces for other components (or a WebAssembly host) to use is fundamental to developing
WebAssembly programs.

Let's examine the [`string-reverse` example project][examples-string-reverse] that exposes functionality for
reversing a string, using slightly more expressive types and a more advanced WIT interface than the `add` example.

## Writing the WIT

To build a project like `string-reverse` from the ground up, first we'd start with a WIT like the following:

```wit
package example:string-reverse@0.1.0;

@since(version = 0.1.0)
interface reverse {
    reverse-string: func(s: string) -> string;
}

world component {
    export reverse;
}
```

As a slightly deeper crash course on [WIT][wit], here's what the above code describes:

- We've defined a namespace called `example`
- We've defined a package called `string-reverse` inside the `example` namespace
- This WIT file corresponds to version `0.1.0` of `example:string-reverse` package
- We've defined an interface called `reverse` which contains *one* function called `reverse-string`
- We specify that the `reverse` interface has existed *since* the `0.1.0` version
- The `reverse-string` function (AKA. `example:reverse-string/reverse.reverse-string`) takes a string and returns a string
- The `string-reverse` world exports the `reverse` interface (and the `reverse-string` function it contains)

> [!WARNING]
> How do we *know* that `reverse-string` actually reverses a string?
>
> Unfortunately, that problem is not really solvable at this level -- function signatures
> can only tell us so much about a function.
>
> Of course, with WebAssembly, you *could* run checks at pre-deploy or even runtime if
> you're so inclined, *before* you run any given binary with a production workload.

## Writing the Javascript

To implement the `component` world, we'd need code that looks like the following:

```mjs
export const reverse = {
  reverseString(s) {
    return s.split("")
      .reverse()
      .join("");
  }
};
```

> [!WARNING]
> jco only deals with ES modules, so ensure to set `"type": "module"` in your `package.json` if necessary

> [!NOTE]
> To view the full code listing along with instructions, see the [`string-reverse` example folder][examples-string-reverse]

## Building a WebAssembly Component

To use `jco` to compile this component, you can run the following from the `string-reverse` folder:

```console
jco componentize \
    string-reverse.js \
    --wit wit/component.wit \
    --world-name component \
    --out string-reverse.wasm \
    --disable all
```

> [!NOTE]
> Like the previous example, we're not using any of the advanced [WebAssembly System Interface][wasi] features,
> so we `--disable` all of them.
>
> Rather than typing out the `jco componentize` command manually, you can also run
> the build command with `npm run build`.

You should see output like the following:

```
OK Successfully written string-reverse.wasm.
```

## Transpiling the WebAssembly Component

Now that we have a WebAssembly binary, we can *also* use `jco` to run it in a native Javascript
context by *transpiling* the WebAsssembly binary (which could have come from anywhere!) to a Javascript module.

```console
jco transpile string-reverse.wasm -o dist/transpiled
```

You should see the following output:

```
  Transpiled JS Component Files:

 - dist/transpiled/interfaces/example-string-reverse-reverse.d.ts   0.1 KiB
 - dist/transpiled/string-reverse.core.wasm                        10.1 MiB
 - dist/transpiled/string-reverse.d.ts                             0.15 KiB
 - dist/transpiled/string-reverse.js                               2.55 KiB
```

> [!TIP]
> Yes, transpilation *does* produce [Typescript declaration file][ts-decl-file], so you can also use a Typescript-focused workflows.
>
> In the [`string-reverse` example project][examples-string-reverse] you can run this step via `npm run transpile`.

## Running from Javascript (NodeJS)

Now that we have a transpiled module, we can run it from any Javascript context that supports core WebAssembly (whether NodeJS or the browser).


For NodeJS, we can use code like the following:

```mjs
import { reverse } from "./dist/transpiled/string-reverse.js";

const reversed = reverse.reverseString("!dlroW olleH");

console.log(`reverseString('!dlroW olleH') = ${reversed}`);
```

> [!NOTE]
> In the [`string-reverse` example project][examples-string-reverse], you can run `npm run transpiled-js` to execute the code above.

You should see output like the following:

```
reverseString('!dlrow olleh') = hello world!
```

While it's somewhat redundant in this context, what we've done from NodeJS demonstrates the usefulness
of WebAssembly and the `jco` toolchain. With the help of `jco`, we have:

- Compiled Javascript to a WebAssembly module (`jco compile`), adhering to an interface defined via WIT
- Converted the compiled WebAssembly module (which could be from *any* language) to a module
that can be used from any compliant JS runtime (`jco transpile`)
- Run the transpiled WebAssembly component from a Javascript native runtime (NodeJS)

[repo]: https://github.com/bytecodealliance/component-docs
[examples-string-reverse]: https://github.com/bytecodealliance/jco/tree/main/examples/components/string-reverse
[ts-decl-file]: https://www.typescriptlang.org/docs/handbook/declaration-files/deep-dive.html#declaration-file-theory-a-deep-dive
[wasi]: https://wasi.dev/
[wit]: https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md

### Contribute to this Guide!

The goal for this guide is to leave zero lingering questions. If you had substantial doubts/unaddressed questions
while going through this guide, [open up an issue](https://github.com/bytecodealliance/jco/issues/new) and we'll improve the docs together.
