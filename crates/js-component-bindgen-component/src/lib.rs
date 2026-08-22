use std::{collections::BTreeMap, path::PathBuf};

use anyhow::{Context as _, Result};

use js_component_bindgen::source::wit_parser::{Resolve, UnresolvedPackageGroup};
use js_component_bindgen::transpile;
use wit_component::{DecodedWasm, WitPrinter};

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

mod bindings {
    //! Generated WIT bindings that govern the accessible functionality
    //! of the js-component-bindgen Wasm component used by Jco

    use super::JsComponentBindgenComponent;
    use wit_bindgen::rt::WitMap as _;
    wit_bindgen::generate!({
        world: "js-component-bindgen"
    });
    export!(JsComponentBindgenComponent);
}
use bindings::{
    AsyncImportsExports, AsyncMode, BindingsMode, EnabledFeatureSet, ExportType, GenerateOptions,
    InstantiationMode, PackageMismatch, Transpiled, TypeGenerationOptions, UnpackError, Wit,
};

/// Implementation of the `js-component-bindgen` world
struct JsComponentBindgenComponent;

impl bindings::Guest for JsComponentBindgenComponent {
    fn generate(component: Vec<u8>, options: GenerateOptions) -> Result<Transpiled, String> {
        let component = wat::parse_bytes(&component).map_err(|e| format!("{e}"))?;
        let opts = js_component_bindgen::TranspileOpts::builder()
            .name(options.name)
            .no_typescript(options.no_typescript.unwrap_or(false))
            .maybe_instantiation_mode(options.instantiation.map(Into::into))
            .maybe_map(options.map.map(|map| map.into_iter().collect()))
            .nodejs_compat_disabled(options.no_nodejs_compat.unwrap_or(false))
            .base64_cutoff(options.base64_cutoff.unwrap_or(5000) as usize)
            .tla_compat(
                options
                    .tla_compat
                    .unwrap_or(options.compat.unwrap_or(false)),
            )
            .valid_lifting_optimization(options.valid_lifting_optimization.unwrap_or(false))
            .tracing(options.tracing.unwrap_or(false))
            .no_component_error_wrapping(options.no_component_error_wrapping.unwrap_or(false))
            .no_namespaced_exports(options.no_namespaced_exports.unwrap_or(false))
            .multi_memory(options.multi_memory.unwrap_or(false))
            .supports_wasm_exnref(options.bindgen_enable_wasm_exnref.unwrap_or(false))
            .maybe_import_bindings(options.import_bindings.map(Into::into))
            .guest(options.guest.unwrap_or(false))
            .maybe_async_mode(options.async_mode.map(Into::into))
            .strict(options.strict.unwrap_or(false))
            .flags_as_bigint(options.flags_as_bigint.unwrap_or(false))
            .variants_inline_cases(options.variants_inline_cases.unwrap_or(false))
            .use_namespace_objects(options.use_namespace_objects.unwrap_or(false))
            .enum_values_screaming_snake_case(
                options.enum_values_screaming_snake_case.unwrap_or(false),
            )
            .asmjs(options.asmjs.unwrap_or(false))
            .build();

        let js_component_bindgen::Transpiled {
            files,
            imports,
            mut exports,
        } = transpile(&component, opts)
            .map_err(|e| format!("{e:?}"))
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
                            js_component_bindgen::ExportKind::LiftedFunction => {
                                ExportType::Function
                            }
                            js_component_bindgen::ExportKind::Instance => ExportType::Instance,
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
                    resolve
                        .push_dir(&path)
                        .with_context(|| format!("reading WIT dir at [{}]", path.display()))
                        .map_err(|e| format!("{e:?}"))?
                        .0
                } else {
                    resolve
                        .push_file(&path)
                        .with_context(|| format!("reading WIT file at [{}]", path.display()))
                        .map_err(|e| format!("{e:?}"))?
                }
            }
            Wit::Binary(binary) => {
                let decoded = wit_component::decode(&binary)
                    .map_err(|e| format!("failed to decode binary WIT: {e:#}"))?;
                let (binary_resolve, package) = match decoded {
                    DecodedWasm::WitPackage(resolve, package) => (resolve, package),
                    DecodedWasm::Component(resolve, world) => {
                        let package = resolve.worlds[world]
                            .package
                            .ok_or_else(|| "component world has no package".to_string())?;
                        (resolve, package)
                    }
                };
                resolve = binary_resolve;
                package
            }
        };

        let world_string = opts.world.map(|world| world.to_string());
        let world = resolve
            .select_world(&[ids], world_string.as_deref())
            .map_err(|e| e.to_string())?;

        let opts = js_component_bindgen::TranspileOpts::builder()
            .name("component".into())
            .no_typescript(false)
            .nodejs_compat_disabled(false)
            .maybe_instantiation_mode(opts.instantiation.map(Into::into))
            .maybe_map(opts.map.map(|map| map.into_iter().collect()))
            .tla_compat(opts.tla_compat.unwrap_or(false))
            .valid_lifting_optimization(false)
            .base64_cutoff(0)
            .tracing(false)
            .no_namespaced_exports(false)
            .multi_memory(false)
            .guest(opts.guest.unwrap_or(false))
            .maybe_async_mode(opts.async_mode.map(Into::into))
            .strict(opts.strict.unwrap_or(false))
            .flags_as_bigint(opts.flags_as_bigint.unwrap_or(false))
            .variants_inline_cases(opts.variants_inline_cases.unwrap_or(false))
            .use_namespace_objects(opts.use_namespace_objects.unwrap_or(false))
            .enum_values_screaming_snake_case(
                opts.enum_values_screaming_snake_case.unwrap_or(false),
            )
            .asmjs(false)
            .build();

        let files = js_component_bindgen::generate_types(&name, resolve, world, opts)
            .with_context(|| format!("generating types for [{}]", name))
            .map_err(|e| format!("{e:?}"))?;

        Ok(files)
    }

    fn unpack_wit(
        expected: Option<String>,
        binary: Vec<u8>,
    ) -> Result<BTreeMap<String, String>, UnpackError> {
        let decoded =
            wit_component::decode(&binary).map_err(|e| UnpackError::InvalidWasm(e.to_string()))?;
        let (resolve, root) = match decoded {
            DecodedWasm::WitPackage(resolve, package) => (resolve, package),
            DecodedWasm::Component(_, _) => return Err(UnpackError::ComponentArtifact),
        };
        let root_name = &resolve.packages[root].name;
        if let Some(expected) = expected {
            let Some(parsed_expected) = parse_package_spec(&expected) else {
                return Err(UnpackError::InvalidPackageSpec(expected));
            };
            if root_name.to_string() != parsed_expected {
                return Err(UnpackError::PackageMismatch(PackageMismatch {
                    found: root_name.to_string(),
                    expected,
                }));
            }
        }

        resolve
            .packages
            .iter()
            .map(|(id, package)| {
                let mut printer = WitPrinter::default();
                printer
                    .print(&resolve, id, &[])
                    .map_err(|e| UnpackError::PrintError(e.to_string()))?;
                let path = if id == root {
                    "package.wit".to_string()
                } else {
                    format!(
                        "deps/{}/package.wit",
                        package.name.to_string().replace([':', '@'], "-")
                    )
                };
                Ok((path, printer.output.to_string()))
            })
            .collect()
    }
}

fn parse_package_spec(spec: &str) -> Option<String> {
    let source = format!("package {spec}; world validate {{}}");
    UnresolvedPackageGroup::parse("package-spec.wit", &source)
        .ok()
        .map(|group| group.main.name.to_string())
}

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
        }
    }
}

#[cfg(test)]
mod tests {
    use super::parse_package_spec;

    #[test]
    fn validates_package_specs_with_the_wit_parser() {
        assert_eq!(
            parse_package_spec("docs:adder@0.1.0").as_deref(),
            Some("docs:adder@0.1.0")
        );
        assert_eq!(parse_package_spec("not-a-package"), None);
    }
}
