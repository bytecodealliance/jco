//! Rust bindings for wit-parser 0.262.

#![allow(
    clippy::duplicate_mod,
    reason = "compile shared generators against each public WIT toolchain"
)]

use ::wasmtime_environ;
use anyhow::{Result, bail};
pub use wit_bindgen_core::wit_parser;
pub(crate) use wit_bindgen_core_063 as wit_bindgen_core;
pub(crate) use wit_component_262 as wit_component;
use wit_parser::Resolve;

#[path = "wit_api.rs"]
mod api;
use api::feature_gate_allowed;
pub(crate) use api::{ResultErrorClass, result_error_class};
pub use api::{dealias, generate_types, generate_types_with_config, get_thrown_type};

#[path = "esm_bindgen.rs"]
pub mod esm_bindgen;
#[path = "function_bindgen.rs"]
pub mod function_bindgen;
#[path = "ts_bindgen.rs"]
pub(crate) mod ts_bindgen;

/// Reject accessor functions until JavaScript property bindings are implemented.
pub(crate) fn ensure_supported_functions(resolve: &Resolve) -> Result<()> {
    use wit_parser::WorldItem;

    let functions = resolve
        .interfaces
        .iter()
        .flat_map(|(_, interface)| interface.functions.values())
        .chain(resolve.worlds.iter().flat_map(|(_, world)| {
            world
                .imports
                .values()
                .chain(world.exports.values())
                .filter_map(|item| match item {
                    WorldItem::Function(function) => Some(function),
                    _ => None,
                })
        }));
    for function in functions {
        if function.kind.accessor().is_some() {
            bail!(
                "WIT accessor functions are not supported: {}",
                function.name
            );
        }
    }
    Ok(())
}

fn version_compat_track(version: &semver::Version) -> String {
    wit_parser::PackageName::version_compat_track_string(version).0
}
