# Introduction

`jco` is a fully native tool for working with [WebAssembly Components](https://component-model.bytecodealliance.org/design/components.html) in JavaScript.

## Features

- **Transpiling** Wasm Component binaries into [ECMAScript modules](https://nodejs.org/api/esm.html#modules-ecmascript-modules) that can run in any JavaScript environment.
- WASI Preview2 support in Node.js (undergoing stabilization) & browsers (experimental).
- Component builds of Wasm Tools helpers, available for use as a library or CLI commands for use in native JS environments
- Optimization helper for Components via Binaryen.
- `componentize` command to easily create components written in JavaScript (wrapper of [ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS)).

> Note: This is an experimental project. **No guarantees** are provided for stability, security or support and breaking changes may be made without notice.


## Contributing

To contribute to the codebase of the project, refer to the [Contributor guide](./contributing.md).

To contribute to the documentation, refer to the [Contributor guide](./contributing-docs.md).

If you find a mistake, omission, ambiguity, or other problem, please let us know via [GitHub issues](https://github.com/bytecodealliance/jco/issues).
