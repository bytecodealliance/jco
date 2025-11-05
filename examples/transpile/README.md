## Transpile examples

This folder contains examples of how to use `@bytecodealliance/jco-transpile` directly,
converting a WebAssembly component into a Javascript ES module that can be run from JS
runtimes like [NodeJS][nodejs] and the browser.

> [!WARNING]
> Browser support is still experimental

Most (if not all) individual example projects are standard Javascript projects, and since we are focused on
transpiling existing components, they may contain a pre-built WebAssembly binary that is transpiled.

| Example            | Component Description                             |
|--------------------|---------------------------------------------------|
| [`adder`](./adder) | Transpile and use the a pre-built adder component |

[nodejs]: https://nodejs.org
