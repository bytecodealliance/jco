use anyhow::Result;
mod files;
mod function_bindgen;
mod identifier;
mod intrinsics;
mod ns;
mod source;

mod ts_bindgen;

#[cfg(feature = "componentize-bindgen")]
mod componentize_bindgen;
#[cfg(feature = "transpile-bindgen")]
mod transpile_bindgen;
#[cfg(feature = "transpile-bindgen")]
pub use transpile_bindgen::TranspileOpts;

use anyhow::{bail, Context};
use heck::*;
use wasmtime_environ::component::Export;
use wasmtime_environ::component::{ComponentTypesBuilder, Translator};
use wasmtime_environ::wasmparser::{Validator, WasmFeatures};
use wasmtime_environ::{ScopeVec, Tunables};
use wit_component::DecodedWasm;

use ts_bindgen::ts_bindgen;

/// Calls [`write!`] with the passed arguments and unwraps the result.
///
/// Useful for writing to things with infallible `Write` implementations like
/// `Source` and `String`.
///
/// [`write!`]: std::write
#[macro_export]
macro_rules! uwrite {
    ($dst:expr, $($arg:tt)*) => {
        write!($dst, $($arg)*).unwrap()
    };
}

/// Calls [`writeln!`] with the passed arguments and unwraps the result.
///
/// Useful for writing to things with infallible `Write` implementations like
/// `Source` and `String`.
///
/// [`writeln!`]: std::writeln
#[macro_export]
macro_rules! uwriteln {
    ($dst:expr, $($arg:tt)*) => {
        writeln!($dst, $($arg)*).unwrap()
    };
}

pub struct Transpiled {
    pub files: Vec<(String, Vec<u8>)>,
    pub imports: Vec<String>,
    pub exports: Vec<(String, Export)>,
}

pub struct ComponentInfo {
    pub imports: Vec<String>,
    pub exports: Vec<(String, wasmtime_environ::component::Export)>,
}

/// Generate the JS transpilation bindgen for a given Wasm component binary
/// Outputs the file map and import and export metadata for the generation
#[cfg(feature = "transpile-bindgen")]
pub fn transpile(component: Vec<u8>, opts: TranspileOpts) -> Result<Transpiled, anyhow::Error> {
    let name = opts.name.clone();
    let mut files = files::Files::default();

    // Use the `wit-component` crate here to parse `binary` and discover
    // the type-level descriptions and `Resolve` corresponding to the
    // component binary. This will synthesize a `Resolve` which has a top-level
    // package which has a single document and `world` within it which describes
    // the state of the component. This is then further used afterwards for
    // bindings generation as-if a `*.wit` file was input.
    let decoded = wit_component::decode(&name, &component)
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
        .translate(&component)
        .context("failed to parse the input component")?;

    // Insert all core wasm modules into the generated `Files` which will
    // end up getting used in the `generate_instantiate` method.
    for (i, module) in modules.iter() {
        files.push(&core_file_name(&name, i.as_u32()), module.wasm);
    }

    if !opts.no_typescript {
        ts_bindgen(&name, &resolve, world_id, &opts, &mut files);
    }

    let world = &resolve.worlds[world_id];
    let imports = world
        .imports
        .iter()
        .map(|impt| impt.0.to_string())
        .map(|impt| {
            if let Some(map) = &opts.map {
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

    transpile_bindgen::transpile_bindgen(
        &name, &component, &modules, &resolve, world_id, opts, &mut files,
    );

    let mut files_out: Vec<(String, Vec<u8>)> = Vec::new();
    for (name, source) in files.iter() {
        files_out.push((name.to_string(), source.to_vec()));
    }
    Ok(Transpiled {
        files: files_out,
        imports,
        exports,
    })
}

#[cfg(feature = "componentize-bindgen")]
pub fn componentize(component: Vec<u8>, name: String) -> Result<String, anyhow::Error> {
    let decoded = wit_component::decode(&name, &component)
        .context("failed to extract interface information from component")?;

    let (resolve, world_id) = match decoded {
        DecodedWasm::WitPackage(..) => bail!("unexpected wit package as input"),
        DecodedWasm::Component(resolve, world_id) => (resolve, world_id),
    };

    let scope = ScopeVec::new();
    let tunables = Tunables::default();
    let mut types = ComponentTypesBuilder::default();
    let mut validator = Validator::new_with_features(WasmFeatures {
        component_model: true,
        ..WasmFeatures::default()
    });

    let (component, modules) = Translator::new(&tunables, &mut validator, &mut types, &scope)
        .translate(&component)
        .context("failed to parse the input component")?;

    let bindings =
        componentize_bindgen::componentize_bindgen(&component, &modules, &resolve, world_id);

    Ok(bindings)
}

fn core_file_name(name: &str, idx: u32) -> String {
    let i_str = if idx == 0 {
        String::from("")
    } else {
        (idx + 1).to_string()
    };
    format!("{}.core{i_str}.wasm", name)
}
