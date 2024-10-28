# Importing and reusing components

> [!NOTE]
> This guide starts where "Exporting Functionality with Rich Types" ended.
>
> Consider referring to that guide if anything here is confusing.

Just as `export`ing functionality is core to building useful WebAssembly components,
**`import`ing and reusing functionality is key to using the strengths of WebAssembly.**

Restated, WIT and the Component Model enable WebAssembly to *compose*. This means we can
build on top of functionality that already exists and `export` *new* functionality that depends
on existing functionality.

## Writing the WIT

Let's say in addition to the reversing the string (in the previous example) we want to build
shared functionality that *also* upper cases the text it receives.

We can reuse the reversing functionality *and* export a new interface which enables us to
reverse and upper-case.

Here's the WIT to make that happen:

```wit
package example:string-reverse-upper@0.1.0;

@since(version = 0.1.0)
interface reversed-upper {
    reverse-and-uppercase: func(s: string) -> string;
}

world revup {
    //
    // NOTE, the import below translates to:
    // <namespace>:<package>/<interface>@<package version>
    //
    import example:string-reverse/reverse@0.1.0;

    export reversed-upper;
}
```

This time, the `revup` world that we are building *relies* on the `reverse` interface (by importing) in the
package `string-reverse` from the namespace `example`.

We can make use of *any* WebAssembly component that matches the `reverse` interface, as long as we *compose*
that functionality with the component into the component implementing the `revup` world.

The `revup` world `import`s (and makes use) of `reverse` in order to `export` (provide) the `reversed-upper`
interface, which contains the `reverse-and-uppercase` function (in JS, `reverseAndUppercase`).

> [!NOTE]
> In this example, functionality is imported from `interface`s, *not* `world`s. It is possible to reuse `world`s,
> but the syntax is not showcased here.

## Writing the Javascript

The Javascript to make this work ([`string-reverse-upper.js` in the `string-reverse-upper` example](https://github.com/bytecodealliance/jco/blob/main/examples/components/string-reverse-upper/string-reverse-upper.js)) looks like this:

```mjs
import { reverseString } from 'example:string-reverse/reverse@0.1.0';

export const reversedUpper = {
  reverseAndUppercase() {
    return reverseString(s).toLocaleUpperCase();
  },
};
```

We can build the component with `jco componentize`, from the `string-reverse-upper` folder:

```console
jco componentize \
    string-reverse-upper.js \
    --wit wit/ \
    --world-name revup \
    --out string-reverse-upper.incomplete.wasm \
    --disable all
```

### Confirming the output

While we've successfully built a WebAssembly component, unlike the other examples, ours is *not yet complete*.

We can see that if we print the WIT of the generated component by running `jco wit`:

```console
jco wit string-reverse-upper.incomplete.wasm
```

You should see output like the following:

```
package root:component;

world root {
  import example:string-reverse/reverse@0.1.0;

  export example:string-reverse-upper/reversed-upper@0.1.0;
}
```

This tells us that the component still has *unfulfilled `import`s* -- we *use* the `reverseString` function that's in `reverse` as if it exists, but it's not yet a real part of the WebAssembly component (hence we've named it `.incomplete.wasm`.

## Composing two components together

To compose the two components (`string-reverse-upper/string-reverse-upper.incomplete.wasm` and `string-reverse/string-reverse.wasm` we built earlier), we'll need the [WebAssembly Composition tool (`wac`)][wac]. We can use `wac plug`:

```console
wac plug \
    -o string-reverse-upper.wasm \
    --plug ../string-reverse/string-reverse.wasm \
    string-reverse-upper.incomplete.wasm
```

> [!NOTE]
> You can also run this step with `npm run compose`.

A new component `string-reverse-upper.wasm` should now be present, which is a "complete" component -- we can check the output of `jco wit` to ensure that all the imports are satisfied:

```wit
package root:component;

world root {
  export example:string-reverse-upper/reversed-upper@0.1.0;
}
```

It's as-if we never imported any functionality at all -- the functionality present in `string-reverse.wasm` has been *merged into* `string-reverse-upper.wasm`, and it now simply `export`s the advanced functionality.

## Transpiling the component to run in NodeJS (or the Browser)

We can run this completed component with in any WebAssembly-capable native Javascript environment by using a the transpiled result:

```console
npx jco transpile string-reverse-upper.wasm -o dist/transpiled
```

> [!NOTE]
> In the example project, you can run `npm run transpile` instead.

You should see output like the following:

```
  Transpiled JS Component Files:

 - dist/transpiled/interfaces/example-string-reverse-upper-reversed-upper.d.ts  0.12 KiB
 - dist/transpiled/string-reverse-upper.core.wasm                               10.1 MiB
 - dist/transpiled/string-reverse-upper.core2.wasm                              10.1 MiB
 - dist/transpiled/string-reverse-upper.d.ts                                    0.19 KiB
 - dist/transpiled/string-reverse-upper.js                                      6.13 KiB
```

> [!TIP]
> Notice that there are *two* core WebAssembly files? That's because two core WebAssembly modules were involved
> in creating the ultimate functionality we needed.

To run the transpiled component, we can write code like the following:

```mjs
import { reversedUpper } from "./dist/transpiled/string-reverse-upper.js";

const result = reversedUpper.reverseAndUppercase("!dlroW olleH");

console.log(`reverseAndUppercase('!dlroW olleH') = ${result}`);
```

> [!NOTE]
> In the [`string-reverse-upper` example project][examples-string-reverse-upper], you can run `npm run transpiled-js`

You should see output like the following:

```
reverseAndUppercase('!dlroW olleH') = HELLO WORLD!
```

[wac]: https://github.com/bytecodealliance/wac
[examples-string-reverse-upper]: https://github.com/bytecodealliance/jco/tree/main/examples/components/string-reverse-upper

### Contribute to this Guide!

The goal for this guide is to leave zero lingering questions. If you had substantial doubts/unaddressed questions
while going through this guide, [open up an issue](https://github.com/bytecodealliance/jco/issues/new) and we'll improve the docs together.
