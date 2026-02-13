# Jco tests

This folder contains tests for Jco.

## Dependencies

You'll need the following binaries installed in your path or specificed explicitly:

| Tool               | Description                                                         |
| ------------------ | ------------------------------------------------------------------- |
| [`wasm-tools`][wt] | Used for composing components during tests (in particular P3 tests) |

## Quickstart

To run all tests:

```
npm run test
```

If you find that tests are not taking into account changes you've made to projects like `js-component-bindgen`,
this is likely because the new crate has not been built (thus Jco cannot use it's output).

In this case, build the project _then_ run the test suite:

```
npm run build && npm run test
```

To run a single suite of tests, from `packages/jco` run the following:

```console
npm run build && npm run build:test:components && npm run test p3/async.js
```

If the test in question contains custom components that are specific to this repository (i.e. components
from `crates/test-components`), then ensure you have built them first:

```console
npm run build && npm run build:test:components && npm run test p3/async.js
```

[wt]: https://crates.io/crates/wasm-tools
