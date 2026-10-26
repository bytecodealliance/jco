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

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
