# Upstream WAST fixtures

The component-model WAST fixtures in this directory are vendored from the
[`WebAssembly/component-model`](https://github.com/WebAssembly/component-model)
repository. Synchronize every tracked fixture with its pinned upstream revision:

```sh
cargo xtask sync-wast-fixtures
```

Use check mode to detect local drift without writing files:

```sh
cargo xtask sync-wast-fixtures --check
```

The source revision for each fixture is recorded in
`upstream-manifest.json`. Revisions are intentionally per fixture: upstream WAT
syntax evolves, while already-enabled fixtures need to remain compatible with
the parser and runtime pinned by this repository. To vendor another upstream
fixture, add its filename and full source commit to the manifest, then run the
synchronization command. The xtask test suite verifies that every vendored
`.wast` file has a manifest entry.
