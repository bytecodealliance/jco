//! Rust bindings for wit-parser 0.259.

#![allow(
    clippy::duplicate_mod,
    reason = "compile shared generators against each public WIT toolchain"
)]

use wasmtime_environ_49 as wasmtime_environ;
pub use wit_bindgen_core::wit_parser;
pub(crate) use wit_bindgen_core_062 as wit_bindgen_core;
pub(crate) use wit_component_259 as wit_component;

#[path = "wit_api.rs"]
mod api;
use api::feature_gate_allowed;
pub(crate) use api::{ResultErrorClass, result_error_class};
pub use api::{dealias, generate_types, generate_types_with_config, get_thrown_type};

#[path = "esm_bindgen.rs"]
pub mod esm_bindgen;
#[allow(
    dead_code,
    reason = "binary translation uses the Wasmtime 50 implementation of these private methods"
)]
#[path = "function_bindgen.rs"]
pub mod function_bindgen;
#[path = "ts_bindgen.rs"]
pub(crate) mod ts_bindgen;

pub(crate) fn ensure_supported_functions(_: &wit_parser::Resolve) -> anyhow::Result<()> {
    // WIT 0.259 cannot represent accessor functions.
    Ok(())
}

fn version_compat_track(version: &semver::Version) -> String {
    wit_parser::PackageName::version_compat_track_string(version)
}
