use std::path::PathBuf;

use anyhow::Result;
use js_component_bindgen::{generate_types, source::wit_parser::Resolve, transpile};

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

wit_bindgen::generate!({
    world: "js-component-bindgen"
});

impl From<InstantiationMode> for js_component_bindgen::InstantiationMode {
    fn from(value: InstantiationMode) -> Self {
        match value {
            InstantiationMode::Async => js_component_bindgen::InstantiationMode::Async,
            InstantiationMode::Sync => js_component_bindgen::InstantiationMode::Sync,
        }
    }
}

impl From<BindingsMode> for js_component_bindgen::BindingsMode {
    fn from(value: BindingsMode) -> Self {
        match value {
            BindingsMode::Js => js_component_bindgen::BindingsMode::Js,
            BindingsMode::DirectOptimized => js_component_bindgen::BindingsMode::DirectOptimized,
            BindingsMode::Optimized => js_component_bindgen::BindingsMode::Optimized,
            BindingsMode::Hybrid => js_component_bindgen::BindingsMode::Hybrid,
        }
    }
}

impl From<AsyncMode> for js_component_bindgen::AsyncMode {
    fn from(value: AsyncMode) -> Self {
        match value {
            AsyncMode::Sync => js_component_bindgen::AsyncMode::Sync,
            AsyncMode::Jspi(AsyncImportsExports { imports, exports }) => {
                js_component_bindgen::AsyncMode::JavaScriptPromiseIntegration { imports, exports }
            }
            AsyncMode::Asyncify(AsyncImportsExports { imports, exports }) => {
                js_component_bindgen::AsyncMode::Asyncify { imports, exports }
            }
        }
    }
}

struct JsComponentBindgenComponent;

export!(JsComponentBindgenComponent);

impl Guest for JsComponentBindgenComponent {
    fn generate(component: Vec<u8>, options: GenerateOptions) -> Result<Transpiled, String> {
        let component = wat::parse_bytes(&component).map_err(|e| format!("{e}"))?;
        let opts = js_component_bindgen::TranspileOpts {
            name: options.name,
            no_typescript: options.no_typescript.unwrap_or(false),
            instantiation: options.instantiation.map(Into::into),
            map: options.map.map(|map| map.into_iter().collect()),
            no_nodejs_compat: options.no_nodejs_compat.unwrap_or(false),
            base64_cutoff: options.base64_cutoff.unwrap_or(5000) as usize,
            tla_compat: options
                .tla_compat
                .unwrap_or(options.compat.unwrap_or(false)),
            valid_lifting_optimization: options.valid_lifting_optimization.unwrap_or(false),
            tracing: options.tracing.unwrap_or(false),
            no_namespaced_exports: options.no_namespaced_exports.unwrap_or(false),
            multi_memory: options.multi_memory.unwrap_or(false),
            import_bindings: options.import_bindings.map(Into::into),
            guest: options.guest.unwrap_or(false),
            async_mode: options.async_mode.map(Into::into),
        };

        let js_component_bindgen::Transpiled {
            files,
            imports,
            mut exports,
        } = transpile(&component, opts)
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
                            wasmtime_environ::component::Export::Instance { .. } => {
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

        // Add features if specified
        match opts.features {
            Some(EnabledFeatureSet::List(ref features)) => {
                for f in features.iter() {
                    resolve.features.insert(f.to_string());
                }
            }
            Some(EnabledFeatureSet::All) => {
                resolve.all_features = true;
            }
            _ => {}
        }

        let ids = match opts.wit {
            Wit::Source(source) => resolve
                .push_str(format!("{name}.wit"), &source)
                .map_err(|e| e.to_string())?,
            Wit::Path(path) => {
                let path = PathBuf::from(path);
                if path.is_dir() {
                    resolve.push_dir(&path).map_err(|e| e.to_string())?.0
                } else {
                    resolve.push_file(&path).map_err(|e| e.to_string())?
                }
            }
            Wit::Binary(_) => todo!(),
        };

        let world_string = opts.world.map(|world| world.to_string());
        let world = resolve
            .select_world(ids, world_string.as_deref())
            .map_err(|e| e.to_string())?;

        let opts = js_component_bindgen::TranspileOpts {
            name: "component".to_string(),
            no_typescript: false,
            no_nodejs_compat: false,
            instantiation: opts.instantiation.map(Into::into),
            map: opts.map.map(|map| map.into_iter().collect()),
            tla_compat: opts.tla_compat.unwrap_or(false),
            valid_lifting_optimization: false,
            base64_cutoff: 0,
            tracing: false,
            no_namespaced_exports: false,
            multi_memory: false,
            import_bindings: None,
            guest: opts.guest.unwrap_or(false),
            async_mode: opts.async_mode.map(Into::into),
        };

        let files = generate_types(name, resolve, world, opts).map_err(|e| e.to_string())?;

        Ok(files)
    }
}
