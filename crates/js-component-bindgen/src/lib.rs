use anyhow::{bail, Context, Result};
use wasmtime_environ::component::Export;
use wasmtime_environ::component::{ComponentTypesBuilder, StaticModuleIndex};
use wasmtime_environ::wasmparser::Validator;
use wasmtime_environ::{PrimaryMap, ScopeVec, Tunables};
use wit_component::DecodedWasm;

mod core;
mod files;

pub mod esm_bindgen;
pub mod function_bindgen;
pub mod intrinsics;
pub mod names;
pub mod source;

mod transpile_bindgen;
use transpile_bindgen::transpile_bindgen;
pub use transpile_bindgen::{BindingsMode, InstantiationMode, TranspileOpts};

mod ts_bindgen;
use ts_bindgen::ts_bindgen;

use wit_bindgen_core::wit_parser::{Resolve, Type, TypeDefKind, TypeId, WorldId};

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

pub fn generate_types(
    name: String,
    resolve: Resolve,
    world_id: WorldId,
    opts: TranspileOpts,
) -> Result<Vec<(String, Vec<u8>)>, anyhow::Error> {
    let mut files = files::Files::default();

    ts_bindgen(&name, &resolve, world_id, &opts, &mut files);

    let mut files_out: Vec<(String, Vec<u8>)> = Vec::new();
    for (name, source) in files.iter() {
        files_out.push((name.to_string(), source.to_vec()));
    }
    Ok(files_out)
}

/// Generate the JS transpilation bindgen for a given Wasm component binary
/// Outputs the file map and import and export metadata for the Transpilation
#[cfg(feature = "transpile-bindgen")]
pub fn transpile(component: &[u8], opts: TranspileOpts) -> Result<Transpiled, anyhow::Error> {
    use wasmtime_environ::component::Translator;

    let name = opts.name.clone();
    let mut files = files::Files::default();

    // Use the `wit-component` crate here to parse `binary` and discover
    // the type-level descriptions and `Resolve` corresponding to the
    // component binary. This will synthesize a `Resolve` which has a top-level
    // package which has a single document and `world` within it which describes
    // the state of the component. This is then further used afterwards for
    // bindings Transpilation as-if a `*.wit` file was input.
    let decoded = wit_component::decode(component)
        .context("failed to extract interface information from component")?;

    let (resolve, world_id) = match decoded {
        DecodedWasm::WitPackages(..) => bail!("unexpected wit package as input"),
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
    let tunables = Tunables::default_u32();
    let mut validator = Validator::default();
    let mut types = ComponentTypesBuilder::new(&validator);

    let (component, modules) = Translator::new(&tunables, &mut validator, &mut types, &scope)
        .translate(component)
        .context("failed to parse the input component")?;

    let modules: PrimaryMap<StaticModuleIndex, core::Translation<'_>> = modules
        .into_iter()
        .map(|(_i, module)| core::Translation::new(module, opts.multi_memory))
        .collect::<Result<_>>()?;

    let types = types.finish(&wasmtime_environ::component::Component::default());

    // Insert all core wasm modules into the generated `Files` which will
    // end up getting used in the `generate_instantiate` method.
    for (i, module) in modules.iter() {
        files.push(&core_file_name(&name, i.as_u32()), module.wasm());
    }

    if !opts.no_typescript {
        ts_bindgen(&name, &resolve, world_id, &opts, &mut files);
    }

    let (imports, exports) = transpile_bindgen(
        &name, &component, &modules, &types.0, &resolve, world_id, opts, &mut files,
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

fn core_file_name(name: &str, idx: u32) -> String {
    let i_str = if idx == 0 {
        String::from("")
    } else {
        (idx + 1).to_string()
    };
    format!("{}.core{i_str}.wasm", name)
}

pub fn dealias(resolve: &Resolve, mut id: TypeId) -> TypeId {
    loop {
        match &resolve.types[id].kind {
            TypeDefKind::Type(Type::Id(that_id)) => id = *that_id,
            _ => break id,
        }
    }
}
