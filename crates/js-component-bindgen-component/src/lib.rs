use std::path::PathBuf;

use anyhow::Result;
use js_component_bindgen::{
    generate_types,
    source::wit_parser::{Resolve, UnresolvedPackage},
    transpile,
};

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

wit_bindgen::generate!("js-component-bindgen");

struct JsComponentBindgenComponent;

export_js_component_bindgen!(JsComponentBindgenComponent);

impl JsComponentBindgen for JsComponentBindgenComponent {
    fn generate(component: Vec<u8>, options: GenerateOptions) -> Result<Transpiled, String> {
        let opts = js_component_bindgen::TranspileOpts {
            name: options.name,
            no_typescript: options.no_typescript.unwrap_or(false),
            instantiation: options.instantiation.unwrap_or(false),
            map: match options.map {
                Some(map) => Some(map.into_iter().collect()),
                None => None,
            },
            no_nodejs_compat: options.no_nodejs_compat.unwrap_or(false),
            base64_cutoff: options.base64_cutoff.unwrap_or(5000) as usize,
            tla_compat: options
                .tla_compat
                .unwrap_or(options.compat.unwrap_or(false)),
            valid_lifting_optimization: options.valid_lifting_optimization.unwrap_or(false),
        };

        let js_component_bindgen::Transpiled {
            files,
            imports,
            mut exports,
        } = transpile(component, opts)
            .map_err(|e| format!("{:?}", e))
            .map_err(|e| e.to_string())?;

        Ok(Transpiled {
            files,
            imports,
            exports: exports
                .drain(..)
                .map(|(name, expt)| {
                    (
                        name,
                        match expt {
                            wasmtime_environ::component::Export::LiftedFunction { .. } => {
                                ExportType::Function
                            }
                            wasmtime_environ::component::Export::Instance(_) => {
                                ExportType::Instance
                            }
                            _ => panic!("Unexpected export type"),
                        },
                    )
                })
                .collect(),
        })
    }

    fn generate_types(
        name: String,
        opts: TypeGenerationOptions,
    ) -> Result<Vec<(String, Vec<u8>)>, String> {
        let mut resolve = Resolve::default();
        let pkg = match opts.wit {
            Wit::Source(source) => {
                UnresolvedPackage::parse(&PathBuf::from(format!("{name}.wit")), &source)
                    .map_err(|e| e.to_string())?
            }
            Wit::Path(path) => {
                UnresolvedPackage::parse_file(&PathBuf::from(path)).map_err(|e| e.to_string())?
            }
            Wit::Binary(_) => todo!(),
        };
        let id = resolve.push(pkg).map_err(|e| e.to_string())?;

        let world_string = match &opts.world {
            Some(world) => Some(world.to_string()),
            None => None,
        };
        let world = resolve
            .select_world(id, world_string.as_deref())
            .map_err(|e| e.to_string())?;

        let opts = js_component_bindgen::TranspileOpts {
            name: "component".to_string(),
            no_typescript: false,
            no_nodejs_compat: false,
            instantiation: opts.instantiation.unwrap_or(false),
            map: match opts.map {
                Some(map) => Some(map.into_iter().collect()),
                None => None,
            },
            tla_compat: opts.tla_compat.unwrap_or(false),
            valid_lifting_optimization: false,
            base64_cutoff: 0,
        };

        let files = generate_types(name, resolve, world, opts).map_err(|e| e.to_string())?;

        Ok(files)
    }
}
