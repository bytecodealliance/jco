## Transpile examples

This folder contains examples of how to use `@bytecodealliance/jco-transpile` directly,
converting a WebAssembly component into a Javascript ES module that can be run from JS
runtimes like [NodeJS][nodejs] and the browser.

Most (if not all) individual example projects are standard Javascript projects, and since we are focused on
transpiling existing components, they may contain a pre-built WebAssembly binary that is transpiled.

| Example                                      | Component Description                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| [`adder`](./adder)                           | Transpile and use a pre-built adder component                          |
| [`js-string-builtins`](./js-string-builtins) | Enable JS String Builtins through Jco's manual instantiation mode      |
| [`p3-stream-chat`](./p3-stream-chat)         | Host an LLM-like P3 component with bidirectional streams and callbacks |

[nodejs]: https://nodejs.org
