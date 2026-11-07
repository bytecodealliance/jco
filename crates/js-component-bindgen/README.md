<h1 align="center">js-component-bindgen</h1>
<div align="center">
  <strong>
      Transpile WebAssembly components into JavaScript
  </strong>
</div>

<br />

<div align="center">
  <!-- Crates version -->
  <a href="https://crates.io/crates/js-component-bindgen">
    <img src="https://img.shields.io/crates/v/js-component-bindgen.svg?style=flat-square"
    alt="Crates.io version" />
  </a>
  <!-- Downloads -->
  <a href="https://crates.io/crates/js-component-bindgen">
    <img src="https://img.shields.io/crates/d/js-component-bindgen.svg?style=flat-square"
      alt="Download" />
  </a>
  <!-- docs.rs docs -->
  <a href="https://docs.rs/js-component-bindgen">
    <img src="https://img.shields.io/badge/docs-latest-blue.svg?style=flat-square"
      alt="docs.rs docs" />
  </a>
</div>

## Installation
```sh
$ cargo add js-component-bindgen
```

Generated JavaScript includes its runtime intrinsics inline by default. To
select an external runtime, enable the opt-in `external-runtime` Cargo feature,
call `transpile_with_config`, and set `TranspileConfig::cm_runtime_es_module` to
`@bytecodealliance/jco-cm-runtime` or another package/directory base. Generated bindings
import `CM_RUNTIME_API_VERSION` from `<base>/runtime` and `tableGet` from
`<base>/intrinsics/resource`; directory and file/HTTP(S) URL bases append `.js`.
Relative bases resolve from the generated output. `tableGet` receives an explicit
trap context, table and handle; other intrinsics remain inline. Legacy provider
files and `runtime.create` must migrate to the
[named-module contract](../../packages/jco-cm-runtime/docs/runtime.md).

```toml
[dependencies]
js-component-bindgen = { version = "2.17", features = ["external-runtime"] }
```

```rust
use js_component_bindgen::{TranspileConfig, TranspileOpts, transpile_with_config};

let config = TranspileConfig::builder()
    .opts(TranspileOpts::builder().name("component".into()).build())
    .cm_runtime_es_module("@bytecodealliance/jco-cm-runtime".into())
    .build();
let transpiled = transpile_with_config(component, config)?;
```

The existing `transpile(component, opts)` API and `TranspileOpts` struct literals
remain supported. `TranspileConfig` is non-exhaustive so future configuration
fields can be added without breaking callers; construct it with its builder or
`Default`.

The separate opt-in `coop-threads` Cargo feature exposes the thread-named
`Intrinsic` aliases, such as `Intrinsic::GlobalCurrentThreadMeta`. The published
task-named variants remain available for exhaustive matches. This feature is
independent of `external-runtime`; it controls the public Rust names and does
not change the generated JavaScript.

### Embedded runtime

Enable the opt-in `embedded-runtime` Cargo feature and set
`TranspileConfig::builder().bundled_runtime(true)` to embed the built-in runtime
and eliminate unused JavaScript before `transpile_with_config` returns. This
feature enables `external-runtime` and the direct Oxc compiler dependencies.
It cannot be combined with `cm_runtime_es_module`. Intrinsics not yet implemented
by the runtime continue to use their existing inline implementations.

The generated JavaScript requires no runtime package installation. Consumer
imports remain external. The default configuration still generates inline code.
The jco CLI exposes this mode as `--embed-runtime`; the JavaScript API uses
`embedRuntime: true`.

The embedded JavaScript and export mapping are generated from `jco-cm-runtime`.
After changing that package, run `pnpm --filter @bytecodealliance/jco-transpile
build:embedded-runtime`. Use `check:embedded-runtime` to check the committed assets.
Rolldown runs only during asset preparation; transpilation uses Oxc in Rust.

To run existing transpilation and jco component tests through embedding, set
`JCO_TEST_RUNTIME=embedded` when invoking their Vitest suites. Tests that explicitly
select an external provider keep that provider.

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
