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

The manifest covers all 79 WAST paths in upstream `test/` at
[`585526aa1f2c7f76f07557d16e265dede38b3acb`](https://github.com/WebAssembly/component-model/tree/585526aa1f2c7f76f07557d16e265dede38b3acb/test),
including the async tests added by
[#761](https://github.com/WebAssembly/component-model/pull/761) and
[#767](https://github.com/WebAssembly/component-model/pull/767), as well as
binary, linking, resource, validation, and value tests. All fixtures use that
revision except `async/big-interleaving-test.wast`: it retains its earlier pin
so its existing coverage can run until Jco's parser supports `stream.forward`
and `future.forward`.

The [WAST runner](../../p3/ported/component-model/wast.ts) derives its test
list from the manifest. Vendored fixtures that cannot yet run have explicit
skip reasons in `WAST_OVERRIDES`; vendoring a test does not imply conformance.
These exceptions track parser/converter limitations, runtime behavior, and
validation or trap diagnostic differences. The two existing artifact subsets
for cancellation and reentrance remain partial coverage. Tests using Wasm
exceptions or multiple memories enable the corresponding transpiler options.

Run the suite with either runtime implementation:

```sh
pnpm --filter @bytecodealliance/jco-transpile test test/p3/ported/component-model/wast.ts
pnpm --filter @bytecodealliance/jco-transpile test:external-runtime test/p3/ported/component-model/wast.ts
```

Jco-specific WASTs live in `jco/`, outside the synchronized upstream corpus.
