# 01 - Building a WebAssembly Component with `jco`

> [!NOTE]
> This guide assumes you have dependencies like `jco` installed already.
>
> Consider referring to the "Tooling setup" guide if your environment hasn't been set up yet.

The first step in building a WebAssembly component is creating or downloading the interface that
defines what your component can do. This usually means creating or downloading the
[WebAssembly Interface Types ("WIT")][wit] world you would like to "target" with your component.

## Writing the WIT

The [example `add` component][examples-add] showcases a component that adds two numbers together.

The WIT interface looks like the following:

```wit
package example:adder;

world component {
    export add: func(x: s32, y: s32) -> s32;
}
```

> [!NOTE]
> `export`ing the `add` interface meants that runners of the WebAssembly binary will be able to *call* that function.
>
> To learn more about the WIT syntax, check out the full [WIT specification][wit]

## Writing the Javascript

Along with this WIT interface, we can write a JavaScript module that implements the exported `add` function in the `adder` world:

```js
export function add(x, y) {
  return x + y;
}
```
> [!WARN]
> jco only deals with ES modules, so ensure to set `"type": "module"` in your `package.json` if necessary

> [!NOTE]
> In the code above, the JS module *itself* is the `component` world, and `add` function export is satisfied with the `add` JS function.

## Building a WebAssembly Component

With the WIT and Javascript in place, we can use [`jco`][jco] to create a WebAssembly component from the JS module, using `jco componentize`.

Our component is *so simple* (reminiscent of [Core WebAssembly][wasm-core], which deals primarily in numeric values)
that we're actually *not using* any of the [WebAssembly System Interface][wasi] -- this means that we can `--disable` it when we invoke `jco componentize`.

From the [`examples/components/add`][examples-add] folder, you can run `jco componentize`:

```console
jco componentize \
    add.js \
    --wit path/to/add/world.wit \
    --world-name component \
    --out add.wasm \
    --disable all
```

> [!NOTE]
> You can exclude the `--disable` option and the component will build just fine!

You should see output like the following:

```
OK Successfully written add.wasm.
```

> [!NOTE]
> As the `add` example is a regular [NodeJS][nodejs] project, you can run `npm install && npm run build`
> without having `jco` and `componentize-js` installed globally.

[wit]: https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md
[nodejs]: https://nodejs.org/en
[wasi]: https://wasi.dev/
[wasm-core]: https://webassembly.github.io/spec/core/
[jco]: https://github.com/bytecodealliance/jco
[examples-add]: https://github.com/bytecodealliance/jco/tree/main/examples/components/add

## FAQ

### Is this a Reactor component?

"Reactor" components are WebAssembly components that can be called repeatedly over time. This serves uses cases like building HTTP handlers,
but also for serving as libraries in other components.

Reactor components (and components in general) expose their interfaces via [WebAssembly Interface Types][docs-wit],
hand-in-hand with the [Component Model][docs-component-model] which enables components to use higher level types interchangably.

They're analogous to libraries of functionality rather than an executable (a "command" component). By contrast, command components must export
a `_start` function, and *usually* export the [`wasi:cli/run` interface][github-wasi-cli], so that other

[docs-wit]: ../design/wit.md
[docs-component-model]: ../design/why-component-model.md
[github-wasi-cli]: https://github.com/WebAssembly/wasi-cli

### Contribute to this Guide!

The goal for this guide is to leave zero lingering questions. If you had substantial doubts/unaddressed questions
while going through this guide, [open up an issue](https://github.com/bytecodealliance/jco/issues/new) and we'll improve the docs together.
