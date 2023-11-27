# Introduction

`jco` is a fully native tool for working with [WebAssembly Components](https://component-model.bytecodealliance.org/design/components.html) in JavaScript.

Features include:

- *Transpiling* Wasm Component binaries into [ECMAScript modules](https://nodejs.org/api/esm.html#modules-ecmascript-modules) that can run in any JavaScript environment.
- WASI Preview2 support in Node.js (undergoing stabilization) & browsers (experimental).
- Component builds of Wasm Tools helpers, available for use as a library or CLI commands for use in native JS environments
- Optimization helper for Components via Binaryen.
- `componentize` command to easily create components written in JavaScript (wrapper of ComponentizeJS).

Note: This is an experimental project, no guarantees are provided for stability, security or support and breaking changes may be made without notice.
