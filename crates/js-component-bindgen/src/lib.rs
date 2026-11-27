use std::collections::HashSet;

use anyhow::{Context as _, Result, anyhow, bail, ensure};
use engine::{ensure_supported_functions, ts_bindgen::ts_bindgen, wit_component, wit_parser};
use heck::ToShoutySnakeCase;
use wasmtime_environ::component::{CanonicalOptions, ComponentTypesBuilder, StaticModuleIndex};
use wasmtime_environ::wasmparser::WasmFeatures;
use wasmtime_environ::{PrimaryMap, ScopeVec, Tunables};
use wit_component::DecodedWasm;
use wit_parser::Function;

mod core;
#[cfg(feature = "embedded-cm-runtime")]
mod embedded_runtime;
mod engine;
mod files;
mod transpile_bindgen;
#[cfg(feature = "wit-parser-259")]
pub mod wit_parser_259;
#[cfg(not(feature = "wit-parser-259"))]
mod wit_parser_259;
#[cfg(feature = "wit-parser-262")]
pub mod wit_parser_262;

pub use wit_parser_259::{
    dealias, esm_bindgen, function_bindgen, generate_types, generate_types_with_config,
    get_thrown_type,
};

pub mod config;
pub mod names;
pub mod script;
pub mod source;

pub mod intrinsics;
use intrinsics::Intrinsic;

pub use transpile_bindgen::{
    AsyncMode, BindingsMode, ExportKind, InstantiationMode, TranspileOpts,
};
use transpile_bindgen::{TranspileBindgenResult, transpile_bindgen};

fn enum_case_name(name: &str, screaming_snake_case: bool) -> String {
    if screaming_snake_case {
        name.to_shouty_snake_case()
    } else {
        name.to_string()
    }
}

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
    pub exports: Vec<(String, transpile_bindgen::ExportKind)>,
}

/// Diagnostics collected while transpiling a component.
#[non_exhaustive]
pub struct TranspileDiagnostics {
    /// Why the component was ineligible when [`TranspileConfig::perf_sync_fast_path`] was requested.
    pub sync_fast_path_blocker: Option<String>,
}

pub struct ComponentInfo {
    pub imports: Vec<String>,
    pub exports: Vec<(String, transpile_bindgen::ExportKind)>,
}

/// Controls declaration contracts that embedding tools may need to stabilize independently.
/// All fields default to true; the Jco frontend selects its compatibility defaults explicitly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, bon::Builder)]
#[non_exhaustive]
pub struct TypeGenerationConfig {
    /// Require nominal identities for resources supplied by the bindings.
    #[builder(default = true)]
    pub nominal_resources: bool,
    /// Allow host async imports to return a value without a Promise.
    #[builder(default = true)]
    pub async_imports_may_return_sync: bool,
    /// Export named error classes for named result error payloads.
    #[builder(default = true)]
    pub typed_error_classes: bool,
    /// Generate separate import-side and export-side interface declarations.
    /// Any of the other enabled contracts also requires separate declarations.
    #[builder(default = true)]
    pub separate_interface_types: bool,
}

impl Default for TypeGenerationConfig {
    fn default() -> Self {
        Self::builder().build()
    }
}

impl TypeGenerationConfig {
    /// Direction-specific contracts require distinct declarations when an interface
    /// is both imported and exported.
    pub(crate) fn separate_interfaces(self) -> bool {
        self.separate_interface_types
            || self.nominal_resources
            || self.async_imports_may_return_sync
            || self.typed_error_classes
    }
}

// TODO(breaking): merge TranspileOpts into this non-exhaustive configuration at
// the next major release, so new options no longer need a separate type.
/// Which removable statements of the Component Model runtime generated bindings keep.
///
/// The runtime labels its diagnostic statements `DEBUG`. Assertions, canonical ABI
/// traps and validation of what a guest or host passes are kept by every profile.
///
/// A profile applies where the runtime is bundled into the bindings. Bindings that
/// import a runtime take what that runtime was built with.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum RuntimeProfile {
    /// Remove diagnostics.
    #[default]
    Checked,
    /// Keep diagnostics. They are logged when `JCO_DEBUG` is
    /// set, or when an instance is created with the `debug` option.
    Debug,
}

impl RuntimeProfile {
    /// The statement labels that this profile removes.
    #[cfg(feature = "embedded-cm-runtime")]
    pub(crate) fn dropped_labels(self) -> &'static [&'static str] {
        match self {
            Self::Checked => &["DEBUG"],
            Self::Debug => &[],
        }
    }
}

/// Extensible configuration for `transpile_with_config`.
///
/// `TranspileOpts` keeps its published fields so existing struct literals remain
/// valid. New options belong here, where fields can be added compatibly.
#[derive(Debug, Default, Clone, PartialEq, Eq, bon::Builder)]
#[non_exhaustive]
pub struct TranspileConfig {
    /// Options shared with `transpile` and [`generate_types`].
    #[builder(default)]
    pub opts: TranspileOpts,
    /// Emit optional host invocation tracking, independent of the runtime provider.
    #[builder(default)]
    pub call_tracking: bool,
    /// Declare the `val` of a WIT `result` arm that has no payload as optional
    /// in the generated TypeScript, so that `{ tag: 'ok' }` is a complete
    /// `result<_, E>` value.
    #[builder(default)]
    pub optional_result_payloads: bool,
    /// Controls declaration contracts independently of the embedding tool defaults.
    #[builder(default)]
    pub type_generation: TypeGenerationConfig,
    /// Which diagnostics and assertions the bundled runtime keeps.
    #[builder(default)]
    pub runtime_profile: RuntimeProfile,
    /// Call synchronous exports and imports without creating a task, thread or
    /// subtask for each call, in components where doing so cannot be observed.
    ///
    /// Takes effect only for a component in which nothing can observe that
    /// state: one component instance, with no asynchronous function, lift or
    /// lower, no stream, future or error context, no JSPI import or export, no
    /// built-in other than those of resources, and neither call tracking,
    /// asm.js output nor optimized import bindings. Any other component is
    /// generated as without the option.
    #[builder(default)]
    pub perf_sync_fast_path: bool,
    /// Package or directory base for the experimental Component Model runtime.
    /// Generated bindings import named exports from runtime and intrinsics/* subpaths.
    /// Intrinsics are generated inline when this is `None` (the default),
    /// unless the `embedded-cm-runtime` Cargo feature is enabled: the runtime
    /// shipped with this crate is then bundled into the generated bindings.
    /// Requires the `external-runtime` Cargo feature.
    #[cfg(feature = "external-runtime")]
    pub cm_runtime_es_module: Option<String>,
    /// The external provider supports the checked intrinsics/sync contract.
    /// The standard checked runtime package enables this automatically.
    #[cfg(feature = "external-runtime")]
    pub cm_runtime_sync_imports: Option<bool>,
}

/// Generate the JS transpilation bindgen for a given Wasm component binary
/// Outputs the file map and import and export metadata for the Transpilation
#[cfg(feature = "transpile-bindgen")]
pub fn transpile(component: &[u8], opts: TranspileOpts) -> Result<Transpiled> {
    // TODO(breaking): accept the extensible configuration directly in transpile
    // and remove this compatibility adapter at the next major release.
    transpile_with_config(component, TranspileConfig::builder().opts(opts).build())
}

/// Provider selection follows the same optional trailing slash as emitted module specifiers.
fn is_standard_checked_runtime(base: &str) -> bool {
    base.strip_suffix('/').unwrap_or(base) == "@bytecodealliance/jco-cm-runtime"
}

/// Transpile a component with additional configuration, including an optional
/// external Component Model runtime provider.
#[cfg(feature = "transpile-bindgen")]
pub fn transpile_with_config(component: &[u8], config: TranspileConfig) -> Result<Transpiled> {
    Ok(transpile_with_diagnostics(component, config)?.0)
}

/// Transpile with the same configuration as [`transpile_with_config`] and return
/// the generated output together with diagnostics about code generation.
#[cfg(feature = "transpile-bindgen")]
pub fn transpile_with_diagnostics(
    component: &[u8],
    mut config: TranspileConfig,
) -> Result<(Transpiled, TranspileDiagnostics)> {
    use wasmtime_environ::component::{Component, Translator};

    normalize_transpile_config(&mut config)?;
    let TranspileConfig {
        mut opts,
        call_tracking,
        optional_result_payloads,
        type_generation,
        runtime_profile,
        perf_sync_fast_path,
        #[cfg(feature = "external-runtime")]
        cm_runtime_es_module,
        #[cfg(feature = "external-runtime")]
        cm_runtime_sync_imports,
    } = config;
    // A custom provider may implement only the original API-v1 operations.
    // Request the sync entry point only for the standard checked package or
    // when the caller confirms that its directory or provider supplies it.
    #[cfg(feature = "external-runtime")]
    let provider_supports_sync = cm_runtime_es_module.as_deref().is_some_and(|base| {
        cm_runtime_sync_imports.unwrap_or_else(|| is_standard_checked_runtime(base))
    });
    #[cfg(not(feature = "external-runtime"))]
    let provider_supports_sync = false;
    #[cfg(not(feature = "external-runtime"))]
    let cm_runtime_es_module: Option<String> = None;
    let external_runtime = cm_runtime_es_module.is_some();
    // TODO(breaking): bundle the runtime unconditionally at the next major release,
    // and remove the inline intrinsics that it stands in for here.
    // Without an external provider, bindings are generated against the runtime
    // shipped with this crate, which is then bundled into them.
    #[cfg(feature = "embedded-cm-runtime")]
    let bundle_runtime = cm_runtime_es_module.is_none();
    #[cfg(not(feature = "embedded-cm-runtime"))]
    let bundle_runtime = false;
    #[cfg(feature = "embedded-cm-runtime")]
    let cm_runtime_es_module =
        cm_runtime_es_module.or_else(|| Some(embedded_runtime::PACKAGE.to_string()));
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
        DecodedWasm::WitPackage(_, _) => bail!("unexpected wit package as input"),
        DecodedWasm::Component(resolve, world_id) => (resolve, world_id),
    };

    ensure_supported_functions(&resolve)?;

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

    // The validator that will be used on the component must enable support for all
    // CM features we expect components to use.
    //
    // This does not require the correct execution of the related features post-transpilation,
    // but without the right features specified, components won't load at all.
    let mut features = WasmFeatures::WASM3
        | WasmFeatures::WIDE_ARITHMETIC
        | WasmFeatures::COMPONENT_MODEL
        | WasmFeatures::CM_ASYNC
        | WasmFeatures::CM_MORE_ASYNC_BUILTINS
        | WasmFeatures::CM_ASYNC_STACKFUL
        | WasmFeatures::CM_ERROR_CONTEXT
        | WasmFeatures::CM_FIXED_LENGTH_LISTS
        | WasmFeatures::CM_MAP
        | WasmFeatures::CM_IMPLEMENTS
        | WasmFeatures::CM_THREADING;

    // Unless the target engine is known to support the exception handling
    // proposal, mask exception handling off: with the feature enabled,
    // wasmtime-environ's FACT-generated adapters wrap calls in exception
    // barriers (`try_table`), which only runs behind a flag (e.g.
    // --experimental-wasm-exnref) in today's JS engines.
    if !opts.supports_wasm_exnref {
        features = features.difference(WasmFeatures::EXCEPTIONS);
    }

    let mut validator = wasmtime_environ::wasmparser::Validator::new_with_features(features);

    let mut types = ComponentTypesBuilder::new(&validator);

    let (component, modules) = Translator::new(&tunables, &mut validator, &mut types, &scope)
        .translate(component)
        .map_err(|e| anyhow!(e).context("failed to translate component"))?;

    let modules: PrimaryMap<StaticModuleIndex, core::Translation<'_>> = modules
        .into_iter()
        .map(|(_i, module)| core::Translation::new(module, opts.multi_memory))
        .collect::<Result<_>>()?;

    let num_resource_tables = types.num_resource_tables();
    let wasmtime_component = Component::default();
    let types = types.finish(&wasmtime_component);

    // Insert all core wasm modules into the generated `Files` which will
    // end up getting used in the `generate_instantiate` method.
    for (i, module) in modules.iter() {
        files.push(&core_file_name(&name, i.as_u32()), module.wasm());
    }

    let TranspileBindgenResult {
        imports,
        exports,
        inferred_async_exports,
        sync_fast_path_blocker,
    } = transpile_bindgen(
        &name,
        &component,
        &modules,
        &types.0,
        num_resource_tables,
        &resolve,
        world_id,
        opts.clone(),
        cm_runtime_es_module.as_deref(),
        (bundle_runtime || provider_supports_sync) && runtime_profile == RuntimeProfile::Checked,
        call_tracking,
        type_generation.typed_error_classes,
        perf_sync_fast_path,
        &mut files,
    );

    if !opts.no_typescript {
        if let Some(AsyncMode::JavaScriptPromiseIntegration { exports, .. }) = &mut opts.async_mode
        {
            exports.extend(inferred_async_exports);
        }
        ts_bindgen(
            &name,
            &resolve,
            world_id,
            &opts,
            call_tracking,
            optional_result_payloads,
            type_generation,
            external_runtime,
            &mut files,
        )
        .context("failed to generate Typescript bindings")?;
    }

    let mut files_out: Vec<(String, Vec<u8>)> = Vec::new();
    for (name, source) in files.iter() {
        #[cfg(feature = "embedded-cm-runtime")]
        if bundle_runtime && name.ends_with(".js") {
            let source = std::str::from_utf8(source)
                .with_context(|| format!("generated module {name} is not UTF-8"))?;
            if let Some(linked) =
                embedded_runtime::link(source, opts.instantiation_mode.is_some(), runtime_profile)
                    .with_context(|| format!("failed to bundle the runtime into {name}"))?
            {
                files_out.push((name.to_string(), linked.into_bytes()));
                continue;
            }
        }
        files_out.push((name.to_string(), source.to_vec()));
    }
    Ok((
        Transpiled {
            files: files_out,
            imports,
            exports,
        },
        TranspileDiagnostics {
            sync_fast_path_blocker,
        },
    ))
}

fn normalize_namespace_object_options(opts: &mut TranspileOpts) -> Result<()> {
    ensure!(
        !(opts.use_namespace_objects && opts.variants_inline_cases),
        "useNamespaceObjects cannot be combined with variantsInlineCases"
    );
    if opts.use_namespace_objects {
        opts.flags_as_bigint = true;
    }
    Ok(())
}

fn normalize_transpile_config(config: &mut TranspileConfig) -> Result<()> {
    normalize_namespace_object_options(&mut config.opts)?;
    #[cfg(feature = "external-runtime")]
    if let Some(cm_runtime_es_module) = &config.cm_runtime_es_module {
        intrinsics::ext::module_specifier(cm_runtime_es_module, "runtime")?;
    }
    Ok(())
}

fn core_file_name(name: &str, idx: u32) -> String {
    let i_str = if idx == 0 {
        String::from("")
    } else {
        (idx + 1).to_string()
    };
    format!("{name}.core{i_str}.wasm")
}

/// Check whether a given function is an async fn
///
/// Functions that are designated as guest async represent use of
/// the WASI p3 async feature.
///
/// These functions must be called from transpiled javsacript much differently
/// than they would otherwise be, i.e. in accordance to the Component Model
/// async feature.
pub(crate) fn is_async_fn(func: &Function, canon_opts: &CanonicalOptions) -> bool {
    if canon_opts.async_ {
        return true;
    }
    func.kind.is_async()
}

/// Check whether a function has been marked or async binding generation
///
/// When dealing with imports, functions that are designated to require async porcelain
/// are usually asynchronous host functions -- they will have code generated
/// that enables use of techniques like JSPI for exposing asynchronous host/platform
/// imports to WebAssembly guests.
///
/// When dealing with an export, functions that require async porcelain simply provide
/// an interface in the transpiled codebase that produces a `Promise`, i.e. one that can
/// be called in an *already* asynchronous context (JS `async` function) or resolved with a`.then()`.
///
/// Exports do not indicate a use of JSPI, as JSPI is only for bridging asynchronous *host* behavior
/// to synchronous WebAssembly modules
///
/// This function is *not* for detecting WASI P3 asynchronous behavior -- see [`is_guest_async_lifted_fn`].
pub(crate) fn requires_async_porcelain(
    name: &str,
    id: &str,
    async_funcs: &HashSet<String>,
) -> bool {
    if async_funcs.contains("*") {
        return true;
    }

    let name = name.trim_start_matches("[async]");

    if async_funcs.contains(name) {
        return true;
    }

    let qualified_name = format!("{id}#{name}");
    if async_funcs.contains(&qualified_name) {
        return true;
    }

    if let Some(pos) = id.find('@') {
        let namespace = &id[..pos];
        let namespaced_name = format!("{namespace}#{name}");

        if async_funcs.contains(&namespaced_name) {
            return true;
        }
    }
    false
}

/// Objects that can control the printing/setup of intrinsics (normally in some final codegen output)
trait ManagesIntrinsics {
    /// Add an intrinsic, supplying it's name afterwards
    fn add_intrinsic(&mut self, intrinsic: Intrinsic);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::{generate_types, wit_parser::Resolve};

    #[cfg(feature = "wit-parser-262")]
    #[test]
    fn accessors_report_an_error_before_generating_types() {
        let mut resolve = Resolve::default();
        let package = resolve
            .push_str(
                "accessors.wit",
                r#"
            package test:accessors;
            interface api { value: get() -> u32; }
            world example { export api; }
        "#,
            )
            .unwrap();
        let world = resolve.select_world(&[package], Some("example")).unwrap();
        let error =
            generate_types("example", resolve, world, TranspileOpts::default()).unwrap_err();
        assert!(format!("{error:#}").contains("WIT accessor functions are not supported"));
    }

    const FLAGS_WIT: &str = r#"
        package test:flag-values;

        interface api {
            flags permissions {
                read,
                write,
            }
            roundtrip: func(value: permissions) -> permissions;
        }

        world flag-values {
            export api;
        }
    "#;

    #[cfg(feature = "transpile-bindgen")]
    fn generated_javascript(transpiled: &Transpiled) -> &str {
        transpiled
            .files
            .iter()
            .find_map(|(name, contents)| {
                name.ends_with(".js")
                    .then(|| std::str::from_utf8(contents).unwrap())
            })
            .unwrap()
    }

    #[cfg(feature = "embedded-cm-runtime")]
    #[test]
    fn direct_sync_import_requires_a_checked_leaf_and_capable_runtime() {
        let component = wat::parse_str(
            r#"(component
            (import "host" (func $host (param "v" u32) (result u32)))
            (core func $lower (canon lower (func $host)))
            (core module $m (import "" "host" (func $host (param i32) (result i32)))
                (memory (export "memory") 1) (export "run" (func $host)))
            (core instance $i (instantiate $m (with "" (instance (export "host" (func $lower))))))
            (func (export "run") (param "v" u32) (result u32) (canon lift (core func $i "run") (memory (core memory $i "memory")))))"#,
        )
        .unwrap();
        for (profile, tracking, provider, provider_sync, direct) in [
            (RuntimeProfile::Checked, false, None, None, true),
            (RuntimeProfile::Debug, false, None, None, false),
            (RuntimeProfile::Checked, true, None, None, false),
            (
                RuntimeProfile::Checked,
                false,
                Some("@test/provider"),
                None,
                false,
            ),
            (
                RuntimeProfile::Checked,
                false,
                Some("@bytecodealliance/jco-cm-runtime"),
                None,
                true,
            ),
            (
                RuntimeProfile::Checked,
                false,
                Some("@bytecodealliance/jco-cm-runtime/"),
                None,
                true,
            ),
            (
                RuntimeProfile::Checked,
                false,
                Some("@bytecodealliance/jco-cm-runtime"),
                Some(false),
                false,
            ),
            (
                RuntimeProfile::Checked,
                false,
                Some("./custom-runtime"),
                Some(true),
                true,
            ),
            (
                RuntimeProfile::Checked,
                true,
                Some("./custom-runtime"),
                Some(true),
                false,
            ),
            (
                RuntimeProfile::Debug,
                false,
                Some("./custom-runtime"),
                Some(true),
                false,
            ),
            (
                RuntimeProfile::Checked,
                false,
                Some("@bytecodealliance/jco-cm-runtime/debug"),
                None,
                false,
            ),
        ] {
            let result = transpile_with_config(
                &component,
                TranspileConfig {
                    opts: TranspileOpts::builder().name("sync".into()).build(),
                    call_tracking: tracking,
                    runtime_profile: profile,
                    cm_runtime_es_module: provider.map(String::from),
                    cm_runtime_sync_imports: provider_sync,
                    ..Default::default()
                },
            )
            .unwrap();
            let source = generated_javascript(&result);
            assert_eq!(source.contains("_lowerSyncImport("), direct);
            let standard_leaf = direct && provider.is_none_or(is_standard_checked_runtime);
            assert_eq!(source.contains("CURRENT_TASK_MAY_BLOCK"), !standard_leaf);
            assert_eq!(source.contains("canCreateBorrowHandles:"), standard_leaf);
            for setter in [
                "setCalleeIsAsync",
                "setFuncTypeIsAsync",
                "setReturnResultTypeIdx",
                "setReturnMemoryIdx",
                "setReturnMemory",
                "setLiftMemory",
            ] {
                assert_eq!(
                    source.contains(&format!("task.{setter}(")),
                    !standard_leaf,
                    "{setter} with provider {provider:?} and profile {profile:?}"
                );
            }

            assert_eq!(
                source.contains("/intrinsics/sync"),
                direct && provider.is_some()
            );
            assert_eq!(
                source.contains("/intrinsics/sync-task"),
                direct && provider.is_some_and(is_standard_checked_runtime)
            );
            if direct {
                assert!(!source.contains("_lowerImportBackwardsCompat"));
                assert!(!source.contains("_getGlobalCurrentThreadMeta"));
                assert!(!source.contains("_jcoThreadLookupContext"));
            }
        }
    }

    #[cfg(feature = "external-runtime")]
    #[test]
    fn lowering_a_borrowed_export_argument_keeps_the_scope_registry() {
        let component = wat::parse_str(r#"(component
            (import "api" (instance $api (export "item" (type (sub resource)))))
            (alias export $api "item" (type $item))
            (core module $m (func (export "use") (param i32)))
            (core instance $i (instantiate $m))
            (func (export "use") (param "item" (borrow $item)) (canon lift (core func $i "use"))))"#).unwrap();
        let result = transpile_with_config(
            &component,
            TranspileConfig {
                opts: TranspileOpts::builder().name("borrow".into()).build(),
                cm_runtime_es_module: Some("@bytecodealliance/jco-cm-runtime".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let source = generated_javascript(&result);
        assert!(source.contains("tableCreateBorrow"));
        assert!(!source.contains("canCreateBorrowHandles:"));
    }

    #[cfg(feature = "external-runtime")]
    #[test]
    fn retaining_an_imported_handle_does_not_select_a_removal_operation() {
        let component = wat::parse_str(
            r#"(component
              (import "api" (instance $api (export "item" (type (sub resource)))))
              (alias export $api "item" (type $item))
              (import "get" (func $get (result (own $item))))
              (core func $lower (canon lower (func $get)))
              (core module $m
                (import "" "get" (func $get (result i32)))
                (global $saved (mut i32) (i32.const 0))
                (func (export "save") (global.set $saved (call $get))))
              (core instance $i (instantiate $m (with "" (instance (export "get" (func $lower))))))
              (func (export "save") (canon lift (core func $i "save"))))"#,
        )
        .unwrap();
        for sync in [false, true] {
            let result = transpile_with_config(
                &component,
                TranspileConfig {
                    opts: TranspileOpts {
                        name: "retain".into(),
                        ..Default::default()
                    },
                    cm_runtime_es_module: Some("@test/provider".into()),
                    cm_runtime_sync_imports: Some(sync),
                    ..Default::default()
                },
            )
            .unwrap();
            let source = generated_javascript(&result);
            assert!(source.contains("rscTableCreateOwn"));
            assert!(!source.contains("rscTableRemove"));
            assert!(!source.contains("_jcoResourceRemoveContext"));
        }
    }

    #[cfg(feature = "embedded-cm-runtime")]
    #[test]
    fn isolated_numeric_exports_require_the_standard_unobserved_runtime() {
        let component = wat::parse_str(
            r#"(component
            (core module $m (func (export "f") (param i32) (result i32) local.get 0))
            (core instance $i (instantiate $m))
            (func (export "f") (param "n" u32) (result u32) (canon lift (core func $i "f"))))"#,
        )
        .unwrap();
        for (provider, profile, tracking, tracing, specialized) in [
            (None, RuntimeProfile::Checked, false, false, true),
            (
                Some("@bytecodealliance/jco-cm-runtime"),
                RuntimeProfile::Checked,
                false,
                false,
                true,
            ),
            (
                Some("@bytecodealliance/jco-cm-runtime/"),
                RuntimeProfile::Checked,
                false,
                false,
                true,
            ),
            (
                Some("./custom"),
                RuntimeProfile::Checked,
                false,
                false,
                false,
            ),
            (None, RuntimeProfile::Debug, false, false, false),
            (None, RuntimeProfile::Checked, true, false, false),
            (None, RuntimeProfile::Checked, false, true, false),
        ] {
            let result = transpile_with_config(
                &component,
                TranspileConfig {
                    opts: TranspileOpts {
                        name: "numeric".into(),
                        instantiation_mode: Some(InstantiationMode::Async),
                        tracing,
                        ..Default::default()
                    },
                    cm_runtime_es_module: provider.map(String::from),
                    cm_runtime_sync_imports: Some(true),
                    runtime_profile: profile,
                    call_tracking: tracking,
                    ..Default::default()
                },
            )
            .unwrap();
            assert_eq!(
                generated_javascript(&result).contains("nativeNumericExports"),
                specialized
            );
        }
    }

    #[cfg(feature = "embedded-cm-runtime")]
    #[test]
    fn numeric_exports_keep_tasks_for_host_calls_and_post_return() {
        for component in [
            r#"(component
                (import "host" (func $host (result u32)))
                (core func $lower (canon lower (func $host)))
                (core module $m (import "" "host" (func $f (result i32))) (export "f" (func $f)))
                (core instance $i (instantiate $m (with "" (instance (export "host" (func $lower))))))
                (func (export "f") (result u32) (canon lift (core func $i "f"))))"#,
            r#"(component
                (core module $m (func (export "f") (result i32) i32.const 0) (func (export "cleanup") (param i32)))
                (core instance $i (instantiate $m))
                (func (export "f") (result u32) (canon lift (core func $i "f") (post-return (core func $i "cleanup")))))"#,
        ] {
            let result = transpile(
                &wat::parse_str(component).unwrap(),
                TranspileOpts {
                    name: "numeric".into(),
                    instantiation_mode: Some(InstantiationMode::Async),
                    ..Default::default()
                },
            )
            .unwrap();
            assert!(!generated_javascript(&result).contains("nativeNumericExports"));
        }
    }

    #[cfg(feature = "embedded-cm-runtime")]
    #[test]
    fn sync_leaf_initializers_only_install_observable_wrappers() {
        let component = wat::parse_str(r#"(component
            (import "length" (func $length (param "n" u32) (result u32)))
            (core func $lower (canon lower (func $length)))
            (core module $core
                (import "" "length" (func $length (param i32) (result i32)))
                (memory (export "mem") 1)
                (func (export "alloc") (param i32 i32 i32 i32) (result i32) i32.const 64)
                (func (export "post") (param i32))
                (func (export "run") (param i32 i32) (result i32) local.get 1 call $length))
            (core instance $guest (instantiate $core (with "" (instance (export "length" (func $lower))))))
            (func (export "run") (param "text" string) (result u32)
                (canon lift (core func $guest "run") (memory (core memory $guest "mem"))
                    (realloc (core func $guest "alloc")) (post-return (core func $guest "post")))))"#).unwrap();
        for (profile, instantiation, wrappers, markers) in [
            (RuntimeProfile::Checked, None, false, false),
            (
                RuntimeProfile::Checked,
                Some(InstantiationMode::Async),
                false,
                true,
            ),
            (RuntimeProfile::Debug, None, true, true),
        ] {
            let result = transpile_with_config(
                &component,
                TranspileConfig {
                    opts: TranspileOpts::builder()
                        .name("sync".into())
                        .maybe_instantiation_mode(instantiation)
                        .build(),
                    runtime_profile: profile,
                    ..Default::default()
                },
            )
            .unwrap();
            let source = generated_javascript(&result);
            assert_eq!(
                source.contains("WebAssembly.promising(exports0.alloc)"),
                wrappers
            );
            assert_eq!(
                source.contains("WebAssembly.promising(exports0.post)"),
                wrappers
            );
            assert_eq!(source.contains("_jcoMaySuspend:"), markers);
            assert_eq!(source.contains("initializeAsyncSubtaskClass"), wrappers);
            assert_eq!(source.contains("initializeFutureValueClass"), wrappers);
            assert_eq!(source.contains("initializeFutures"), wrappers);
            assert_eq!(source.contains("initializeStreams"), wrappers);
            assert_eq!(source.contains("initializeWaitableClass"), wrappers);
        }
    }

    #[cfg(feature = "transpile-bindgen")]
    #[test]
    fn debug_logger_is_initialized_once_for_a_module_or_an_instance() {
        // Getting and setting a context value logs through the runtime.
        let component = wat::parse_str(
            r#"
                (component
                    (core module $helper
                        (import "" "context.set" (func $set (param i32)))
                        (import "" "context.get" (func $get (result i32)))
                        (func (export "push") (param i32) (result i32)
                            (call $set (local.get 0))
                            (local.get 0))
                        (func (export "pull") (result i32) (call $get))
                    )
                    (canon context.set i32 0 (core func $set))
                    (canon context.get i32 0 (core func $get))
                    (core instance $instance (instantiate $helper
                        (with "" (instance
                            (export "context.set" (func $set))
                            (export "context.get" (func $get))))))
                    (func (export "push") (param "value" u32) (result u32)
                        (canon lift (core func $instance "push")))
                    (func (export "pull") (result u32)
                        (canon lift (core func $instance "pull")))
                )
            "#,
        )
        .unwrap();
        let logger_source = |instantiation_mode: Option<InstantiationMode>| {
            let transpiled = crate::transpile_with_config(
                &component,
                crate::TranspileConfig {
                    opts: TranspileOpts::builder()
                        .name("context".into())
                        .maybe_instantiation_mode(instantiation_mode)
                        .build(),
                    runtime_profile: crate::RuntimeProfile::Debug,
                    ..Default::default()
                },
            )
            .unwrap();
            generated_javascript(&transpiled).to_string()
        };
        let logger = |instantiation_mode: Option<InstantiationMode>| {
            let source = logger_source(instantiation_mode);
            assert_eq!(source.matches("JCO_DEBUG").count(), 1);
            let instantiate = source.find("export function instantiate(");
            let logger = source.find("JCO_DEBUG").unwrap();
            let initializer = source[..logger].rfind('\n').map_or(0, |start| start + 1);
            let line = source[initializer..].lines().next().unwrap().trim();
            (line.to_string(), instantiate.map(|start| start < logger))
        };

        // A module reads the environment once, as it loads.
        let (per_module, _) = logger(None);
        assert!(per_module.contains("globalThis?.process?.env?.JCO_DEBUG"));
        assert!(per_module.contains("console.debug(message, ...args) : () => {}"));
        assert!(!per_module.contains("??"));

        // An instance prefers its own choice, and otherwise reads the environment
        // once as it is instantiated.
        let (per_instance, inside_instantiate) = logger(Some(InstantiationMode::Sync));
        assert!(per_instance.contains("?? ") && per_instance.contains("JCO_DEBUG"));
        #[cfg(not(feature = "embedded-cm-runtime"))]
        {
            // Inline intrinsics are defined in `instantiate`, where `options` is.
            assert!(per_instance.contains("console.debug(message, ...args) : () => {}"));
            assert!(
                per_instance
                    .contains("(options?.debug ?? !!globalThis?.process?.env?.JCO_DEBUG) ?")
            );
            assert_eq!(inside_instantiate, Some(true));
        }
        // The bundled runtime of an instance is found outside `instantiate`, which
        // passes its choice in. Instances that choose alike share a runtime, whose
        // logger follows the choice already resolved against the environment.
        #[cfg(feature = "embedded-cm-runtime")]
        {
            assert_eq!(inside_instantiate, Some(false));
            let source = logger_source(Some(InstantiationMode::Sync));
            assert!(source.contains("$runtime(options?.debug);"));
            assert!(source.contains(
                "$debug ? (message, ...args) => console.debug(message, ...args) : () => {}"
            ));
        }

        // Neither calls a global that a local name of the bindings could capture.
        assert!(!per_module.contains("Boolean(") && !per_instance.contains("Boolean("));
    }

    #[cfg(feature = "transpile-bindgen")]
    #[test]
    fn async_export_returns_imported_resource_without_imported_functions() {
        let component = wat::parse_str(
            r#"
                (component
                    (import "test:data/blob" (instance $data
                        (export "blob" (type (sub resource)))
                    ))
                    (alias export $data "blob" (type $blob))
                    (core func $task_return (canon task.return (result (own $blob))))
                    (core module $m
                        (import "" "task.return" (func $ret (param i32)))
                        (func (export "pass") (param i32) (result i32)
                            local.get 0 call $ret i32.const 0)
                        (func (export "cb") (param i32 i32 i32) (result i32)
                            i32.const 0)
                    )
                    (core instance $i (instantiate $m
                        (with "" (instance (export "task.return" (func $task_return))))))
                    (type $ft (func async (param "b" (own $blob)) (result (own $blob))))
                    (func (export "pass") (type $ft)
                        (canon lift (core func $i "pass") async (callback (core func $i "cb"))))
                )
            "#,
        )
        .unwrap();
        for instantiation_mode in [
            None,
            Some(InstantiationMode::Async),
            Some(InstantiationMode::Sync),
        ] {
            transpile(
                &component,
                TranspileOpts::builder()
                    .name("async-pass-imported-resource".into())
                    .maybe_instantiation_mode(instantiation_mode)
                    .build(),
            )
            .unwrap();
        }
    }

    fn flags_interface(flags_as_bigint: bool) -> String {
        let mut resolve = Resolve::default();
        let package = resolve.push_str("flags.wit", FLAGS_WIT).unwrap();
        let world = resolve
            .select_world(&[package], Some("flag-values"))
            .unwrap();
        let files = generate_types(
            "flags",
            resolve,
            world,
            TranspileOpts::builder()
                .name("flags".into())
                .flags_as_bigint(flags_as_bigint)
                .build(),
        )
        .unwrap();
        let (_, contents) = files
            .into_iter()
            .find(|(name, _)| name.ends_with("api.d.ts"))
            .unwrap();
        String::from_utf8(contents).unwrap()
    }

    #[test]
    fn flags_types_are_objects_by_default() {
        let source = flags_interface(false);
        assert!(source.contains("export interface Permissions"));
        assert!(!source.contains("export const Permissions"));
    }

    #[test]
    fn flags_types_can_be_bigints_with_constants() {
        let source = flags_interface(true);
        assert!(source.contains("export type Permissions = bigint;"));
        assert!(source.contains("export const Permissions: {"));
        assert!(source.contains("readonly Read: bigint"));
        assert!(source.contains("readonly Write: bigint"));
    }

    #[test]
    fn wildcard_marks_every_function_async() {
        let async_funcs = HashSet::from(["*".to_string()]);
        assert!(requires_async_porcelain(
            "query",
            "jco:node/dns@0.1.0",
            &async_funcs,
        ));
        assert!(requires_async_porcelain(
            "run",
            "example:component/run@1.0.0",
            &async_funcs,
        ));
    }

    #[cfg(feature = "external-runtime")]
    #[test]
    fn validates_cm_runtime_es_module_specifiers() {
        let mut default = TranspileConfig::default();
        normalize_transpile_config(&mut default).unwrap();
        assert!(default.cm_runtime_es_module.is_none());

        let mut custom = TranspileConfig::builder()
            .cm_runtime_es_module("./runtime".into())
            .build();
        normalize_transpile_config(&mut custom).unwrap();
        assert_eq!(custom.cm_runtime_es_module.as_deref(), Some("./runtime"));

        for invalid in ["", "runtime\nmodule"] {
            let mut config = TranspileConfig::builder()
                .cm_runtime_es_module(invalid.into())
                .build();
            assert!(normalize_transpile_config(&mut config).is_err());
        }
    }

    #[cfg(all(feature = "transpile-bindgen", feature = "external-runtime"))]
    #[test]
    fn resource_rep_uses_named_runtime_exports() {
        let component = wat::parse_str(
            r#"
                (component
                    (core module $module
                        (type $rep-type (func (param i32) (result i32)))
                        (import "intrinsics" "rep" (func $rep (type $rep-type)))
                        (func (export "run") (param i32) (result i32)
                            local.get 0
                            call $rep
                        )
                    )
                    (type $resource (resource (rep i32)))
                    (core func $rep (canon resource.rep $resource))
                    (core instance $intrinsics
                        (export "rep" (func $rep))
                    )
                    (core instance (instantiate $module
                        (with "intrinsics" (instance $intrinsics))
                    ))
                )
            "#,
        )
        .unwrap();
        let direct = transpile(
            &component,
            TranspileOpts::builder()
                .name("resource-runtime-direct".into())
                .build(),
        )
        .unwrap();
        let direct_source = generated_javascript(&direct);
        // Without a selected provider the intrinsics are self-contained: bundled from
        // the shipped runtime when that feature is enabled, and rendered inline otherwise.
        #[cfg(feature = "embedded-cm-runtime")]
        {
            assert!(direct_source.contains("$cm$tableGet"));
            assert!(!direct_source.contains(crate::embedded_runtime::PACKAGE));
            assert!(!direct_source.contains("\nimport "));
        }
        #[cfg(not(feature = "embedded-cm-runtime"))]
        assert!(direct_source.contains("function rscTableGet(table, handle)"));
        assert!(!direct_source.contains("_jcoRuntimeProvider"));

        let transpiled = transpile_with_config(
            &component,
            TranspileConfig::builder()
                .opts(
                    TranspileOpts::builder()
                        .name("resource-runtime".into())
                        .instantiation_mode(InstantiationMode::Sync)
                        .build(),
                )
                .cm_runtime_es_module("./custom-runtime".into())
                .build(),
        )
        .unwrap();
        let source = generated_javascript(&transpiled);

        let import_position = source.find("tableGet as rscTableGet").unwrap();
        let instantiate_position = source.find("export function instantiate(").unwrap();
        let realm_position = source.find("const WebAssembly = options?").unwrap();
        let context_position = source
            .find("const _jcoResourceTableGetContext = { RuntimeError: WebAssembly.RuntimeError };")
            .unwrap();
        assert!(import_position < instantiate_position);
        assert!(instantiate_position < realm_position);
        assert!(realm_position < context_position);
        assert!(
            source.contains("rscTableGet(_jcoResourceTableGetContext, handleTable0, handle).rep")
        );
        assert!(!source.contains("function rscTableGet(table, handle)"));
        assert!(!source.contains("_jcoRuntimeProvider"));
        assert!(!source.contains(".bind(receiver)"));
        assert_eq!(source.matches("tableGet as rscTableGet").count(), 1);
        assert_eq!(
            source.matches("const _jcoResourceTableGetContext").count(),
            1
        );
        assert!(source.contains("from \"./custom-runtime/runtime.js\""));
        assert!(!transpiled.imports.contains(&"./custom-runtime".to_string()));
    }

    #[cfg(all(feature = "transpile-bindgen", feature = "external-runtime"))]
    #[test]
    fn unrelated_component_does_not_import_external_runtime() {
        let component = wat::parse_str("(component)").unwrap();
        let transpiled = transpile_with_config(
            &component,
            TranspileConfig::builder()
                .opts(TranspileOpts::builder().name("adder".into()).build())
                .cm_runtime_es_module("unused-runtime".into())
                .build(),
        )
        .unwrap();
        let source = generated_javascript(&transpiled);

        assert!(!source.contains("_jcoRuntimeProvider"));
        assert!(!source.contains("unused-runtime"));
        assert!(!source.contains("_jcoResourceTableGetContext"));
    }

    /// A caller that passes a `list<u32>` to a callee with a memory of its own,
    /// and returns the list that comes back.
    #[cfg(feature = "transpile-bindgen")]
    const TWO_MEMORIES: &str = r#"
        (component
            (component $callee
                (core module $m
                    (memory (export "memory") 1)
                    (func (export "realloc") (param i32 i32 i32 i32) (result i32)
                        i32.const 1024)
                    (func (export "echo") (param i32 i32) (result i32)
                        (i32.store (i32.const 8) (local.get 0))
                        (i32.store (i32.const 12) (local.get 1))
                        (i32.const 8)))
                (core instance $i (instantiate $m))
                (func (export "echo") (param "values" (list u32)) (result (list u32))
                    (canon lift (core func $i "echo")
                        (memory (core memory $i "memory"))
                        (realloc (core func $i "realloc")))))
            (component $caller
                (import "echo" (func $echo (param "values" (list u32)) (result (list u32))))
                (core module $libc
                    (memory (export "memory") 1)
                    (func (export "realloc") (param i32 i32 i32 i32) (result i32)
                        i32.const 1024))
                (core instance $libc (instantiate $libc))
                (core func $echo_lowered
                    (canon lower (func $echo)
                        (memory (core memory $libc "memory"))
                        (realloc (core func $libc "realloc"))))
                (core module $m
                    (import "host" "echo" (func $echo (param i32 i32 i32)))
                    (func (export "run") (param i32 i32) (result i32)
                        (call $echo (local.get 0) (local.get 1) (i32.const 16))
                        (i32.const 16)))
                (core instance $i (instantiate $m
                    (with "host" (instance (export "echo" (func $echo_lowered))))))
                (func (export "run") (param "values" (list u32)) (result (list u32))
                    (canon lift (core func $i "run")
                        (memory (core memory $libc "memory"))
                        (realloc (core func $libc "realloc")))))
            (instance $callee_instance (instantiate $callee))
            (instance $caller_instance (instantiate $caller
                (with "echo" (func $callee_instance "echo"))))
            (export "run" (func $caller_instance "run")))
    "#;

    #[cfg(feature = "transpile-bindgen")]
    #[test]
    fn typed_list_is_lifted_by_slicing_a_view_of_memory() {
        let component = wat::parse_str(TWO_MEMORIES).unwrap();
        let transpiled = transpile(
            &component,
            TranspileOpts::builder().name("lists".into()).build(),
        )
        .unwrap();
        let source = generated_javascript(&transpiled);

        // The view spans the list alone, and its copy does not alias guest memory.
        let lift = source.find("new Uint32Array(memory0.buffer, ptr").unwrap();
        let statement = source[lift..].lines().next().unwrap();
        assert!(statement.trim_end().ends_with(").slice();"), "{statement}");
        assert!(!source.contains("new Uint32Array(memory0.buffer.slice("));
    }

    #[cfg(feature = "transpile-bindgen")]
    #[test]
    fn memory_accesses_of_an_adapter_reuse_a_view_unless_memories_are_native() {
        let component = wat::parse_str(TWO_MEMORIES).unwrap();
        let source = |multi_memory: bool| {
            let transpiled = transpile(
                &component,
                TranspileOpts::builder()
                    .name("lists".into())
                    .multi_memory(multi_memory)
                    .build(),
            )
            .unwrap();
            generated_javascript(&transpiled).to_string()
        };

        // Without multi-memory, the adapter imports each access to the second memory.
        // The accesses share one view, which is replaced once the memory has another buffer.
        let polyfilled = source(false);
        let view = polyfilled.find("memoryView").unwrap();
        let view = &polyfilled[view..];
        let view = &view[..view.find("})();").unwrap()];
        assert!(view.contains("view.buffer === memory.buffer ? view : "));
        assert_eq!(view.matches("new DataView(memory.buffer)").count(), 2);
        // (the spacing of the declaration depends on how the runtime is linked)
        let name: String = view
            .chars()
            .take_while(|char| char.is_ascii_alphanumeric() || *char == '_')
            .collect();
        let declarations = [format!("{name} = "), format!("{name}= ")]
            .iter()
            .map(|declaration| polyfilled.matches(declaration.as_str()).count())
            .sum::<usize>();
        assert_eq!(declarations, 1);
        for op in ["I32Load", "I32Store"] {
            let import = polyfilled.find(&format!("\"mem1 {op}\"")).unwrap();
            let body = polyfilled[import..].lines().next().unwrap();
            assert!(body.contains(&format!("=> {name}().")), "{body}");
            assert!(!body.contains("new DataView("), "{body}");
        }

        // With multi-memory, the adapter reaches both memories itself.
        assert!(!source(true).contains("\"mem1 "));
    }
}
