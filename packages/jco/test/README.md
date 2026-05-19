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
pnpm run test
```

> [!NOTE]
> We recommend `pnpm` due to it's security-focused and space-saving features.


If you find that tests are not taking into account changes you've made to projects like `js-component-bindgen`,
this is likely because the new crate has not been built (thus Jco cannot use it's output).

In this case, build the project _then_ run the test suite:

```
pnpm run build && pnpm run test
```

To run a single suite of tests, from `packages/jco` run the following:

```console
pnpm run build && pnpm run build:test:components && pnpm run test p3/async.js
```

If the test in question contains custom components that are specific to this repository (i.e. components
from `crates/test-components`), then ensure you have built them first:

```console
pnpm run build && pnpm run build:test:components && pnpm run test p3/async.js
```

[wt]: https://crates.io/crates/wasm-tools
