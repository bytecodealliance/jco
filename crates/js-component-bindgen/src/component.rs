//! Support to generate bindings for a host for a single component.
//!
//! This is currently used by the JS host generator and is planned to be used
//! for the Python host generator as well. This module is conditionally defined
//! since it depends on a few somewhat-heavyweight dependencies.
//!
//! The main definition here is the `ComponentGenerator` trait as well as the
//! `generate` function.

use crate::bindgen::JsBindgen;
use crate::files::Files;
use anyhow::{bail, Context, Result};
use heck::*;
use wasmtime_environ::component::{ComponentTypesBuilder, Export, Translator};
use wasmtime_environ::wasmparser::{Validator, WasmFeatures};
use wasmtime_environ::{ScopeVec, Tunables};
use wit_component::DecodedWasm;

pub struct ComponentInfo {
    pub imports: Vec<String>,
    pub exports: Vec<(String, wasmtime_environ::component::Export)>,
}

/// Generate bindings to load and instantiate the specific binary component
/// provided.
pub fn generate(
    gen: &mut JsBindgen,
    name: &str,
    binary: &[u8],
    files: &mut Files,
) -> Result<ComponentInfo> {
    // Use the `wit-component` crate here to parse `binary` and discover
    // the type-level descriptions and `Resolve` corresponding to the
    // component binary. This will synthesize a `Resolve` which has a top-level
    // package which has a single document and `world` within it which describes
    // the state of the component. This is then further used afterwards for
    // bindings generation as-if a `*.wit` file was input.
    let decoded = wit_component::decode(name, binary)
        .context("failed to extract interface information from component")?;

    let (resolve, world_id) = match decoded {
        DecodedWasm::WitPackage(..) => bail!("unexpected wit package as input"),
        DecodedWasm::Component(resolve, world_id) => (resolve, world_id),
    };

    // Components are complicated, there's no real way around that. To
    // handle all the work of parsing a component and figuring out how to
    // instantiate core wasm modules and such all the work is offloaded to
    // Wasmtime itself. This crate generator is based on Wasmtime's
    // low-level `wasmtime-environ` crate which is technically not a public
    // dependency but the same author who worked on that in Wasmtime wrote
    // this as well so... "seems fine".
    //
    // Note that we're not pulling in the entire Wasmtime engine here,
    // moreso just the "spine" of validating a component. This enables using
    // Wasmtime's internal `Component` representation as a much easier to
    // process version of a component that has decompiled everything
    // internal to a component to a straight linear list of initializers
    // that need to be executed to instantiate a component.
    let scope = ScopeVec::new();
    let tunables = Tunables::default();
    let mut types = ComponentTypesBuilder::default();
    let mut validator = Validator::new_with_features(WasmFeatures {
        component_model: true,
        ..WasmFeatures::default()
    });

    let (component, modules) = Translator::new(&tunables, &mut validator, &mut types, &scope)
        .translate(binary)
        .context("failed to parse the input component")?;

    // Insert all core wasm modules into the generated `Files` which will
    // end up getting used in the `generate_instantiate` method.
    for (i, module) in modules.iter() {
        files.push(&gen.core_file_name(name, i.as_u32()), module.wasm);
    }

    // With all that prep work delegate to `WorldGenerator::generate` here
    // to generate all the type-level descriptions for this component now
    // that the interfaces in/out are understood.
    gen.generate(&resolve, world_id, files);

    // And finally generate the code necessary to instantiate the given
    // component to this method using the `Component` that
    // `wasmtime-environ` parsed.
    gen.instantiate(&component, &modules, &resolve, world_id);

    gen.finish_component(name, files);

    let world = &resolve.worlds[world_id];
    let imports = world
        .imports
        .iter()
        .map(|impt| impt.0.to_string())
        .map(|impt| {
            if let Some(map) = &gen.opts.map {
                match map.get(&impt) {
                    Some(impt) => impt.to_string(),
                    None => impt.to_string(),
                }
            } else {
                impt.to_string()
            }
        })
        .collect();

    let exports = component
        .exports
        .iter()
        .filter(|expt| {
            matches!(
                expt.1,
                Export::Instance(_) | Export::Module(_) | Export::LiftedFunction { .. }
            )
        })
        .map(|expt| (expt.0.to_lower_camel_case(), expt.1.clone()))
        .collect();

    Ok(ComponentInfo { imports, exports })
}
