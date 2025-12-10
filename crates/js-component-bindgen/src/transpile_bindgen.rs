use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fmt::Write;
use std::mem;

use base64::Engine as _;
use base64::engine::general_purpose;
use heck::{ToKebabCase, ToLowerCamelCase, ToUpperCamelCase};
use wasmtime_environ::component::{
    CanonicalOptions, CanonicalOptionsDataModel, Component, ComponentTranslation, ComponentTypes,
    CoreDef, CoreExport, Export, ExportItem, FixedEncoding, GlobalInitializer, InstantiateModule,
    InterfaceType, LinearMemoryOptions, LoweredIndex, ResourceIndex, RuntimeComponentInstanceIndex,
    RuntimeImportIndex, RuntimeInstanceIndex, StaticModuleIndex, Trampoline, TrampolineIndex,
    TypeDef, TypeFuncIndex, TypeResourceTableIndex,
};
use wasmtime_environ::component::{
    ExportIndex, ExtractCallback, NameMap, NameMapNoIntern, Transcode,
    TypeComponentLocalErrorContextTableIndex,
};
use wasmtime_environ::{EntityIndex, PrimaryMap};
use wit_bindgen_core::abi::{self, LiftLower};
use wit_component::StringEncoding;
use wit_parser::abi::AbiVariant;
use wit_parser::{
    Function, FunctionKind, Handle, Resolve, Result_, SizeAlign, Type, TypeDefKind, TypeId,
    WorldId, WorldItem, WorldKey,
};

use crate::esm_bindgen::EsmBindgen;
use crate::files::Files;
use crate::function_bindgen::{
    ErrHandling, FunctionBindgen, RemoteResourceMap, ResourceData, ResourceMap, ResourceTable,
};
use crate::intrinsics::component::ComponentIntrinsic;
use crate::intrinsics::lift::LiftIntrinsic;
use crate::intrinsics::p3::async_future::AsyncFutureIntrinsic;
use crate::intrinsics::p3::async_stream::AsyncStreamIntrinsic;
use crate::intrinsics::p3::async_task::AsyncTaskIntrinsic;
use crate::intrinsics::p3::error_context::ErrCtxIntrinsic;
use crate::intrinsics::p3::host::HostIntrinsic;
use crate::intrinsics::p3::waitable::WaitableIntrinsic;
use crate::intrinsics::resource::ResourceIntrinsic;
use crate::intrinsics::string::StringIntrinsic;
use crate::intrinsics::webidl::WebIdlIntrinsic;
use crate::intrinsics::{
    AsyncDeterminismProfile, Intrinsic, RenderIntrinsicsArgs, render_intrinsics,
};
use crate::names::{LocalNames, is_js_reserved_word, maybe_quote_id, maybe_quote_member};
use crate::{
    FunctionIdentifier, ManagesIntrinsics, core, get_thrown_type, is_async_fn,
    requires_async_porcelain, source, uwrite, uwriteln,
};

/// Number of flat parameters allowed before spilling over to memory
/// for an async function
///
/// See [`wit-bindgen-core`] and the Component Model spec
const MAX_ASYNC_FLAT_PARAMS: usize = 4;

#[derive(Debug, Default, Clone)]
pub struct TranspileOpts {
    pub name: String,
    /// Disables generation of `*.d.ts` files and instead only generates `*.js`
    /// source files.
    pub no_typescript: bool,
    /// Provide a custom JS instantiation API for the component instead
    /// of the direct importable native ESM output.
    pub instantiation: Option<InstantiationMode>,
    /// Configure how import bindings are provided, as high-level JS bindings,
    /// or as hybrid optimized bindings.
    pub import_bindings: Option<BindingsMode>,
    /// Comma-separated list of "from-specifier=./to-specifier.js" mappings of
    /// component import specifiers to JS import specifiers.
    pub map: Option<HashMap<String, String>>,
    /// Disables compatibility in Node.js without a fetch global.
    pub no_nodejs_compat: bool,
    /// Set the cutoff byte size for base64 inlining core Wasm in instantiation mode
    /// (set to 0 to disable all base64 inlining)
    pub base64_cutoff: usize,
    /// Enables compatibility for JS environments without top-level await support
    /// via an async $init promise export to wait for instead.
    pub tla_compat: bool,
    /// Disable verification of component Wasm data structures when
    /// lifting as a production optimization
    pub valid_lifting_optimization: bool,
    /// Whether or not to emit `tracing` calls on function entry/exit.
    pub tracing: bool,
    /// Whether to generate namespaced exports like `foo as "local:package/foo"`.
    /// These exports can break typescript builds.
    pub no_namespaced_exports: bool,
    /// Whether to output core Wasm utilizing multi-memory or to polyfill
    /// this handling.
    pub multi_memory: bool,
    /// Whether to generate types for a guest module using module declarations.
    pub guest: bool,
    /// Configure whether to use `async` imports or exports with
    /// JavaScript Promise Integration (JSPI).
    pub async_mode: Option<AsyncMode>,
}

#[derive(Default, Clone, Debug)]
pub enum AsyncMode {
    #[default]
    Sync,
    JavaScriptPromiseIntegration {
        imports: Vec<String>,
        exports: Vec<String>,
    },
}

#[derive(Default, Clone, Debug)]
pub enum InstantiationMode {
    #[default]
    Async,
    Sync,
}

/// Internal Bindgen calling convention
enum CallType {
    /// Standard calls - inner function is called directly with parameters
    Standard,
    /// Standard calls that are async (p3)
    AsyncStandard,
    /// Exported resource method calls - this is passed as the first argument
    FirstArgIsThis,
    /// Exported resource method calls that are async (p3)
    AsyncFirstArgIsThis,
    /// Imported resource method calls - callee is a member of the parameter
    CalleeResourceDispatch,
    /// Imported resource method calls that are async (p3)
    AsyncCalleeResourceDispatch,
}

#[derive(Default, Clone, Debug)]
pub enum BindingsMode {
    Hybrid,
    #[default]
    Js,
    Optimized,
    DirectOptimized,
}

struct JsBindgen<'a> {
    local_names: LocalNames,

    esm_bindgen: EsmBindgen,

    /// The source code for the "main" file that's going to be created for the
    /// component we're generating bindings for. This is incrementally added to
    /// over time and primarily contains the main `instantiate` function as well
    /// as a type-description of the input/output interfaces.
    src: Source,

    /// Core module count
    core_module_cnt: usize,

    /// Various options for code generation.
    opts: &'a TranspileOpts,

    /// List of all intrinsics emitted to `src` so far.
    all_intrinsics: BTreeSet<Intrinsic>,

    /// List of all core Wasm exported functions (and if is async) referenced in
    /// `src` so far.
    ///
    /// The second boolean is true when async procelain is required *or* if the
    /// export itself is async.
    all_core_exported_funcs: Vec<(String, bool)>,
}

/// Arguments provided to `JSBindgen::bindgen`, normally called to perform bindgen on a given function
struct JsFunctionBindgenArgs<'a> {
    /// Number of params that the function expects
    nparams: usize,
    /// Internal convention for function calls (ex. whether the first argument is known to be 'this')
    call_type: CallType,
    /// Interface name (if inside an interface)
    iface_name: Option<&'a str>,
    /// Callee of the function
    callee: &'a str,
    /// Canon opts provided for the functions
    opts: &'a CanonicalOptions,
    /// Parsed function metadata
    func: &'a Function,
    resource_map: &'a ResourceMap,
    remote_resource_map: &'a RemoteResourceMap,
    /// ABI variant of the function
    abi: AbiVariant,
    /// Whether the function in question is a host async function (i.e. JSPI)
    requires_async_porcelain: bool,
    /// Whether the function in question is a guest async function (i.e. WASI P3)
    is_async: bool,
}

impl<'a> ManagesIntrinsics for JsBindgen<'a> {
    fn add_intrinsic(&mut self, intrinsic: Intrinsic) {
        self.intrinsic(intrinsic);
    }
}

#[allow(clippy::too_many_arguments)]
pub fn transpile_bindgen(
    name: &str,
    component: &ComponentTranslation,
    modules: &PrimaryMap<StaticModuleIndex, core::Translation<'_>>,
    types: &ComponentTypes,
    resolve: &Resolve,
    id: WorldId,
    opts: TranspileOpts,
    files: &mut Files,
) -> (Vec<String>, Vec<(String, Export)>) {
    let (async_imports, async_exports) = match opts.async_mode.clone() {
        None | Some(AsyncMode::Sync) => (Default::default(), Default::default()),
        Some(AsyncMode::JavaScriptPromiseIntegration { imports, exports }) => {
            (imports.into_iter().collect(), exports.into_iter().collect())
        }
    };

    let mut bindgen = JsBindgen {
        local_names: LocalNames::default(),
        src: Source::default(),
        esm_bindgen: EsmBindgen::default(),
        core_module_cnt: 0,
        opts: &opts,
        all_intrinsics: BTreeSet::new(),
        all_core_exported_funcs: Vec::new(),
    };
    bindgen.local_names.exclude_globals(
        &Intrinsic::get_global_names()
            .into_iter()
            .collect::<Vec<_>>(),
    );
    bindgen.core_module_cnt = modules.len();

    // Bindings are generated when the `instantiate` method is called on the
    // Instantiator structure created below
    let mut instantiator = Instantiator {
        src: Source::default(),
        sizes: SizeAlign::default(),
        bindgen: &mut bindgen,
        modules,
        instances: Default::default(),
        error_context_component_initialized: (0..component
            .component
            .num_runtime_component_instances)
            .map(|_| false)
            .collect(),
        error_context_component_table_initialized: (0..component
            .component
            .num_error_context_tables)
            .map(|_| false)
            .collect(),
        resolve,
        world: id,
        translation: component,
        component: &component.component,
        types,
        async_imports,
        async_exports,
        imports: Default::default(),
        exports: Default::default(),
        lowering_options: Default::default(),
        used_instance_flags: Default::default(),
        defined_resource_classes: Default::default(),
        imports_resource_types: Default::default(),
        exports_resource_types: Default::default(),
        resources_initialized: BTreeMap::new(),
        resource_tables_initialized: BTreeMap::new(),
    };
    instantiator.sizes.fill(resolve);
    instantiator.initialize();
    instantiator.instantiate();

    let mut intrinsic_definitions = source::Source::default();

    instantiator.resource_definitions(&mut intrinsic_definitions);
    instantiator.instance_flags();

    instantiator.bindgen.src.js(&instantiator.src.js);
    instantiator.bindgen.src.js_init(&instantiator.src.js_init);

    instantiator
        .bindgen
        .finish_component(name, files, &opts, intrinsic_definitions);

    let exports = instantiator
        .bindgen
        .esm_bindgen
        .exports()
        .iter()
        .map(|(export_name, canon_export_name)| {
            let expected_export_name =
                if canon_export_name.contains(':') || canon_export_name.starts_with("[async]") {
                    canon_export_name.to_string()
                } else {
                    canon_export_name.to_kebab_case()
                };
            let export = instantiator
                .component
                .exports
                .get(&expected_export_name, &NameMapNoIntern)
                .unwrap_or_else(|| panic!("failed to find component export [{expected_export_name}] (original '{canon_export_name}')"));
            (
                export_name.to_string(),
                instantiator.component.export_items[*export].clone(),
            )
        })
        .collect();

    (bindgen.esm_bindgen.import_specifiers(), exports)
}

impl JsBindgen<'_> {
    fn finish_component(
        &mut self,
        name: &str,
        files: &mut Files,
        opts: &TranspileOpts,
        intrinsic_definitions: source::Source,
    ) {
        let mut output = source::Source::default();
        let mut compilation_promises = source::Source::default();
        let mut core_exported_funcs = source::Source::default();

        for (core_export_fn, is_async) in self.all_core_exported_funcs.iter() {
            let local_name = self.local_names.get(core_export_fn);
            if *is_async {
                uwriteln!(
                    core_exported_funcs,
                    "{local_name} = WebAssembly.promising({core_export_fn});",
                );
            } else {
                uwriteln!(core_exported_funcs, "{local_name} = {core_export_fn};",);
            }
        }

        // adds a default implementation of `getCoreModule`
        if matches!(self.opts.instantiation, Some(InstantiationMode::Async)) {
            uwriteln!(
                compilation_promises,
                "if (!getCoreModule) getCoreModule = (name) => {}(new URL(`./${{name}}`, import.meta.url));",
                self.intrinsic(Intrinsic::FetchCompile)
            );
        }

        // Setup the compilation data and compilation promises
        let mut removed = BTreeSet::new();
        for i in 0..self.core_module_cnt {
            let local_name = format!("module{i}");
            let mut name_idx = core_file_name(name, i as u32);
            if self.opts.instantiation.is_some() {
                uwriteln!(
                    compilation_promises,
                    "const {local_name} = getCoreModule('{name_idx}');"
                );
            } else if files.get_size(&name_idx).unwrap() < self.opts.base64_cutoff {
                assert!(removed.insert(i));
                let data = files.remove(&name_idx).unwrap();
                uwriteln!(
                    compilation_promises,
                    "const {local_name} = {}('{}');",
                    self.intrinsic(Intrinsic::Base64Compile),
                    general_purpose::STANDARD_NO_PAD.encode(&data),
                );
            } else {
                // Maintain numerical file orderings when a previous file was
                // inlined
                if let Some(&replacement) = removed.iter().next() {
                    assert!(removed.remove(&replacement) && removed.insert(i));
                    let data = files.remove(&name_idx).unwrap();
                    name_idx = core_file_name(name, replacement as u32);
                    files.push(&name_idx, &data);
                }
                uwriteln!(
                    compilation_promises,
                    "const {local_name} = {}(new URL('./{name_idx}', import.meta.url));",
                    self.intrinsic(Intrinsic::FetchCompile)
                );
            }
        }

        let js_intrinsics = render_intrinsics(RenderIntrinsicsArgs {
            intrinsics: &mut self.all_intrinsics,
            no_nodejs_compat: self.opts.no_nodejs_compat,
            instantiation: self.opts.instantiation.is_some(),
            determinism: AsyncDeterminismProfile::default(),
        });

        if let Some(instantiation) = &self.opts.instantiation {
            uwrite!(
                output,
                "\
                    export function instantiate(getCoreModule, imports, instantiateCore = {}) {{
                        {}
                        {}
                        {}
                ",
                match instantiation {
                    InstantiationMode::Async => "WebAssembly.instantiate",
                    InstantiationMode::Sync =>
                        "(module, importObject) => new WebAssembly.Instance(module, importObject)",
                },
                &js_intrinsics as &str,
                &intrinsic_definitions as &str,
                &compilation_promises as &str,
            );
        }

        // Render all imports
        let imports_object = if self.opts.instantiation.is_some() {
            Some("imports")
        } else {
            None
        };
        self.esm_bindgen
            .render_imports(&mut output, imports_object, &mut self.local_names);

        // Create instantiation code
        if self.opts.instantiation.is_some() {
            uwrite!(&mut self.src.js, "{}", &core_exported_funcs as &str);
            self.esm_bindgen.render_exports(
                &mut self.src.js,
                self.opts.instantiation.is_some(),
                &mut self.local_names,
                opts,
            );
            uwrite!(
                output,
                "\
                        let gen = (function* _initGenerator () {{
                            {}\
                            {};
                        }})();
                        let promise, resolve, reject;
                        function runNext (value) {{
                            try {{
                                let done;
                                do {{
                                    ({{ value, done }} = gen.next(value));
                                }} while (!(value instanceof Promise) && !done);
                                if (done) {{
                                    if (resolve) return resolve(value);
                                    else return value;
                                }}
                                if (!promise) promise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));
                                value.then(nextVal => done ? resolve() : runNext(nextVal), reject);
                            }}
                            catch (e) {{
                                if (reject) reject(e);
                                else throw e;
                            }}
                        }}
                        const maybeSyncReturn = runNext(null);
                        return promise || maybeSyncReturn;
                    }}
                ",
                &self.src.js_init as &str,
                &self.src.js as &str,
            );
        } else {
            let (maybe_init_export, maybe_init) =
                if self.opts.tla_compat && opts.instantiation.is_none() {
                    uwriteln!(self.src.js_init, "_initialized = true;");
                    (
                        "\
                        let _initialized = false;
                        export ",
                        "",
                    )
                } else {
                    (
                        "",
                        "
                        await $init;
                    ",
                    )
                };

            uwrite!(
                output,
                "\
                    {}
                    {}
                    {}
                    {maybe_init_export}const $init = (() => {{
                        let gen = (function* _initGenerator () {{
                            {}\
                            {}\
                            {}\
                        }})();
                        let promise, resolve, reject;
                        function runNext (value) {{
                            try {{
                                let done;
                                do {{
                                    ({{ value, done }} = gen.next(value));
                                }} while (!(value instanceof Promise) && !done);
                                if (done) {{
                                    if (resolve) resolve(value);
                                    else return value;
                                }}
                                if (!promise) promise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));
                                value.then(runNext, reject);
                            }}
                            catch (e) {{
                                if (reject) reject(e);
                                else throw e;
                            }}
                        }}
                        const maybeSyncReturn = runNext(null);
                        return promise || maybeSyncReturn;
                    }})();
                    {maybe_init}\
                ",
                &js_intrinsics as &str,
                &intrinsic_definitions as &str,
                &self.src.js as &str,
                &compilation_promises as &str,
                &self.src.js_init as &str,
                &core_exported_funcs as &str,
            );

            self.esm_bindgen.render_exports(
                &mut output,
                self.opts.instantiation.is_some(),
                &mut self.local_names,
                opts,
            );
        }

        let mut bytes = output.as_bytes();
        // strip leading newline
        if bytes[0] == b'\n' {
            bytes = &bytes[1..];
        }
        files.push(&format!("{name}.js"), bytes);
    }

    fn intrinsic(&mut self, intrinsic: Intrinsic) -> String {
        self.all_intrinsics.insert(intrinsic);
        intrinsic.name().to_string()
    }
}

/// Helper structure used to generate the `instantiate` method of a component.
///
/// This is the main structure for parsing the output of Wasmtime.
struct Instantiator<'a, 'b> {
    src: Source,
    bindgen: &'a mut JsBindgen<'b>,
    modules: &'a PrimaryMap<StaticModuleIndex, core::Translation<'a>>,
    instances: PrimaryMap<RuntimeInstanceIndex, StaticModuleIndex>,
    types: &'a ComponentTypes,
    resolve: &'a Resolve,
    world: WorldId,
    sizes: SizeAlign,
    component: &'a Component,

    /// Map of error contexts tables for a given component & error context index pair
    /// that have been initialized
    error_context_component_initialized: PrimaryMap<RuntimeComponentInstanceIndex, bool>,
    error_context_component_table_initialized:
        PrimaryMap<TypeComponentLocalErrorContextTableIndex, bool>,

    /// Component-level translation information, including trampolines
    translation: &'a ComponentTranslation,

    exports_resource_types: BTreeMap<TypeId, ResourceIndex>,
    imports_resource_types: BTreeMap<TypeId, ResourceIndex>,
    resources_initialized: BTreeMap<ResourceIndex, bool>,
    resource_tables_initialized: BTreeMap<TypeResourceTableIndex, bool>,

    exports: BTreeMap<String, WorldKey>,
    imports: BTreeMap<String, WorldKey>,
    /// Instance flags which references have been emitted externally at least once.
    used_instance_flags: RefCell<BTreeSet<RuntimeComponentInstanceIndex>>,
    defined_resource_classes: BTreeSet<String>,
    async_imports: HashSet<String>,
    async_exports: HashSet<String>,
    lowering_options:
        PrimaryMap<LoweredIndex, (&'a CanonicalOptions, TrampolineIndex, TypeFuncIndex)>,
}

impl<'a> ManagesIntrinsics for Instantiator<'a, '_> {
    fn add_intrinsic(&mut self, intrinsic: Intrinsic) {
        self.bindgen.intrinsic(intrinsic);
    }
}

impl<'a> Instantiator<'a, '_> {
    fn initialize(&mut self) {
        // Populate reverse map from import and export names to world items
        for (key, _) in &self.resolve.worlds[self.world].imports {
            let name = &self.resolve.name_world_key(key);
            self.imports.insert(name.to_string(), key.clone());
        }
        for (key, _) in &self.resolve.worlds[self.world].exports {
            let name = &self.resolve.name_world_key(key);
            self.exports.insert(name.to_string(), key.clone());
        }

        // Populate reverse map from TypeId to ResourceIndex
        // Populate the resource type to resource index map
        for (key, item) in &self.resolve.worlds[self.world].imports {
            let name = &self.resolve.name_world_key(key);
            let Some((_, (_, import))) = self
                .component
                .import_types
                .iter()
                .find(|(_, (impt_name, _))| impt_name == name)
            else {
                match item {
                    WorldItem::Interface { .. } => {
                        unreachable!("unexpected interface in import types during initialization")
                    }
                    WorldItem::Function(_) => {
                        unreachable!("unexpected function in import types during initialization")
                    }
                    WorldItem::Type(ty) => {
                        assert!(!matches!(
                            self.resolve.types[*ty].kind,
                            TypeDefKind::Resource
                        ))
                    }
                }
                continue;
            };
            match item {
                WorldItem::Interface { id, stability: _ } => {
                    let TypeDef::ComponentInstance(instance) = import else {
                        unreachable!("unexpectedly non-component instance import in interface")
                    };
                    let import_ty = &self.types[*instance];
                    let iface = &self.resolve.interfaces[*id];
                    for (ty_name, ty) in &iface.types {
                        match &import_ty.exports.get(ty_name) {
                            Some(TypeDef::Resource(resource)) => {
                                let ty = crate::dealias(self.resolve, *ty);
                                let resource_idx = self.types[*resource].ty;
                                self.imports_resource_types.insert(ty, resource_idx);
                            }
                            Some(TypeDef::Interface(_)) | None => {}
                            Some(_) => unreachable!("unexpected type in interface"),
                        }
                    }
                }
                WorldItem::Function(_) => {}
                WorldItem::Type(ty) => match import {
                    TypeDef::Resource(resource) => {
                        let ty = crate::dealias(self.resolve, *ty);
                        let resource_idx = self.types[*resource].ty;
                        self.imports_resource_types.insert(ty, resource_idx);
                    }
                    TypeDef::Interface(_) => {}
                    _ => unreachable!("unexpected type in import world item"),
                },
            }
        }
        self.exports_resource_types = self.imports_resource_types.clone();

        for (key, item) in &self.resolve.worlds[self.world].exports {
            let name = &self.resolve.name_world_key(key);
            let (_, export_idx) = self
                .component
                .exports
                .raw_iter()
                .find(|(expt_name, _)| *expt_name == name)
                .unwrap();
            let export = &self.component.export_items[*export_idx];
            match item {
                WorldItem::Interface { id, stability: _ } => {
                    let iface = &self.resolve.interfaces[*id];
                    let Export::Instance { exports, .. } = &export else {
                        unreachable!("unexpectedly non export instance item")
                    };
                    for (ty_name, ty) in &iface.types {
                        match self.component.export_items
                            [*exports.get(ty_name, &NameMapNoIntern).unwrap()]
                        {
                            Export::Type(TypeDef::Resource(resource)) => {
                                let ty = crate::dealias(self.resolve, *ty);
                                let resource_idx = self.types[resource].ty;
                                self.exports_resource_types.insert(ty, resource_idx);
                            }
                            Export::Type(_) => {}
                            _ => unreachable!(
                                "unexpected type in component export items on iface [{iface_name}]",
                                iface_name = iface.name.as_deref().unwrap_or("<unknown>"),
                            ),
                        }
                    }
                }
                WorldItem::Function(_) => {}
                WorldItem::Type(_) => unreachable!("unexpected exported world item type"),
            }
        }
    }

    fn instantiate(&mut self) {
        // Handle all built in trampolines
        for (i, trampoline) in self.translation.trampolines.iter() {
            let Trampoline::LowerImport {
                index,
                lower_ty,
                options,
            } = trampoline
            else {
                continue;
            };

            let options = self
                .component
                .options
                .get(*options)
                .expect("failed to find canon options");

            let i = self.lowering_options.push((options, i, *lower_ty));
            assert_eq!(i, *index);
        }

        if let Some(InstantiationMode::Async) = self.bindgen.opts.instantiation {
            // To avoid uncaught promise rejection errors, we attach an intermediate
            // Promise.all with a rejection handler, if there are multiple promises.
            if self.modules.len() > 1 {
                self.src.js_init.push_str("Promise.all([");
                for i in 0..self.modules.len() {
                    if i > 0 {
                        self.src.js_init.push_str(", ");
                    }
                    self.src.js_init.push_str(&format!("module{i}"));
                }
                uwriteln!(self.src.js_init, "]).catch(() => {{}});");
            }
        }

        // We push lower import initializers down to right before instantiate, so that the
        // memory, realloc and postReturn functions are available to the import lowerings
        // for optimized bindgen
        let mut lower_import_initializers = Vec::new();
        for init in self.component.initializers.iter() {
            match init {
                GlobalInitializer::InstantiateModule(_) => {
                    for init in lower_import_initializers.drain(..) {
                        self.instantiation_global_initializer(init);
                    }
                }
                GlobalInitializer::LowerImport { .. } => {
                    lower_import_initializers.push(init);
                    continue;
                }
                _ => {}
            }
            self.instantiation_global_initializer(init);
        }

        for init in lower_import_initializers.drain(..) {
            self.instantiation_global_initializer(init);
        }

        // Some trampolines that correspond to host-provided imports need to be defined before the
        // instantiation bits since they are referred to.
        for (i, trampoline) in self
            .translation
            .trampolines
            .iter()
            .filter(|(_, t)| Instantiator::is_early_trampoline(t))
        {
            self.trampoline(i, trampoline);
        }

        if self.bindgen.opts.instantiation.is_some() {
            let js_init = mem::take(&mut self.src.js_init);
            self.src.js.push_str(&js_init);
        }

        self.exports(&self.component.exports);

        // Trampolines here so we have static module indices, and resource maps populated
        // (both imports and exports may still be populting resource map)
        for (i, trampoline) in self
            .translation
            .trampolines
            .iter()
            .filter(|(_, t)| !Instantiator::is_early_trampoline(t))
        {
            self.trampoline(i, trampoline);
        }
    }

    fn ensure_local_resource_class(&mut self, local_name: String) {
        if !self.defined_resource_classes.contains(&local_name) {
            uwriteln!(
                self.src.js,
                "\nclass {local_name} {{
                constructor () {{
                    throw new Error('\"{local_name}\" resource does not define a constructor');
                }}
            }}"
            );
            self.defined_resource_classes.insert(local_name.to_string());
        }
    }

    fn resource_definitions(&mut self, definitions: &mut source::Source) {
        // It is theoretically possible for locally defined resources used in no functions
        // to still be exported
        for resource in 0..self.component.num_resources {
            let resource = ResourceIndex::from_u32(resource);
            let is_imported = self.component.defined_resource_index(resource).is_none();
            if is_imported {
                continue;
            }
            if let Some(local_name) = self.bindgen.local_names.try_get(resource) {
                self.ensure_local_resource_class(local_name.to_string());
            }
        }

        // Write out the defined resource table indices for the runtime
        if self.bindgen.all_intrinsics.contains(&Intrinsic::Resource(
            ResourceIntrinsic::ResourceTransferBorrow,
        )) || self.bindgen.all_intrinsics.contains(&Intrinsic::Resource(
            ResourceIntrinsic::ResourceTransferBorrowValidLifting,
        )) {
            let defined_resource_tables = Intrinsic::DefinedResourceTables.name();
            uwrite!(definitions, "const {defined_resource_tables} = [");
            // Table per-resource
            for tidx in 0..self.component.num_resources {
                let tid = TypeResourceTableIndex::from_u32(tidx);
                let rid = self.types[tid].ty;
                if let Some(defined_index) = self.component.defined_resource_index(rid) {
                    if self.types[tid].instance
                        == self.component.defined_resource_instances[defined_index]
                    {
                        uwrite!(definitions, "true,");
                    }
                } else {
                    uwrite!(definitions, ",");
                };
            }
            uwrite!(definitions, "];\n");
        }
    }

    /// Ensure a component-local `error-context` table has been created
    ///
    /// # Arguments
    ///
    /// * `component_idx` - component index
    /// * `err_ctx_tbl_idx` - The component-local error-context table index
    ///
    fn ensure_error_context_local_table(
        &mut self,
        component_idx: RuntimeComponentInstanceIndex,
        err_ctx_tbl_idx: TypeComponentLocalErrorContextTableIndex,
    ) {
        if self.error_context_component_initialized[component_idx]
            && self.error_context_component_table_initialized[err_ctx_tbl_idx]
        {
            return;
        }
        let err_ctx_local_tables = self
            .bindgen
            .intrinsic(Intrinsic::ErrCtx(ErrCtxIntrinsic::ComponentLocalTable));
        let c = component_idx.as_u32();
        if !self.error_context_component_initialized[component_idx] {
            uwriteln!(self.src.js, "{err_ctx_local_tables}.set({c}, new Map());");
            self.error_context_component_initialized[component_idx] = true;
        }
        if !self.error_context_component_table_initialized[err_ctx_tbl_idx] {
            let t = err_ctx_tbl_idx.as_u32();
            uwriteln!(
                self.src.js,
                "{err_ctx_local_tables}.get({c}).set({t}, new Map());"
            );
            self.error_context_component_table_initialized[err_ctx_tbl_idx] = true;
        }
    }

    /// Ensure that a resource table has been initialized
    ///
    /// For the relevant resource table, this function will generate initialization
    /// blocks, exactly once.
    ///
    /// This is not done for *all* resources, but instead for those that are explicitly used.
    fn ensure_resource_table(&mut self, id: TypeResourceTableIndex) {
        if self.resource_tables_initialized.contains_key(&id) {
            return;
        }

        let resource = self.types[id].ty;

        let (is_imported, maybe_dtor) =
            if let Some(resource_idx) = self.component.defined_resource_index(resource) {
                let resource_def = self
                    .component
                    .initializers
                    .iter()
                    .find_map(|i| match i {
                        GlobalInitializer::Resource(r) if r.index == resource_idx => Some(r),
                        _ => None,
                    })
                    .unwrap();

                if let Some(dtor) = &resource_def.dtor {
                    (false, format!("\n{}(rep);", self.core_def(dtor)))
                } else {
                    (false, "".into())
                }
            } else {
                (true, "".into())
            };

        let handle_tables = self.bindgen.intrinsic(Intrinsic::HandleTables);
        let rsc_table_flag = self
            .bindgen
            .intrinsic(Intrinsic::Resource(ResourceIntrinsic::ResourceTableFlag));
        let rsc_table_remove = self
            .bindgen
            .intrinsic(Intrinsic::Resource(ResourceIntrinsic::ResourceTableRemove));

        let rtid = id.as_u32();
        if is_imported {
            uwriteln!(
                self.src.js,
                "const handleTable{rtid} = [{rsc_table_flag}, 0];",
            );
            if !self.resources_initialized.contains_key(&resource) {
                let ridx = resource.as_u32();
                uwriteln!(
                    self.src.js,
                    "const captureTable{ridx} = new Map();
                    let captureCnt{ridx} = 0;"
                );
                self.resources_initialized.insert(resource, true);
            }
        } else {
            let finalization_registry_create = self
                .bindgen
                .intrinsic(Intrinsic::FinalizationRegistryCreate);
            uwriteln!(
                self.src.js,
                "const handleTable{rtid} = [{rsc_table_flag}, 0];
                const finalizationRegistry{rtid} = {finalization_registry_create}((handle) => {{
                    const {{ rep }} = {rsc_table_remove}(handleTable{rtid}, handle);{maybe_dtor}
                }});
                ",
            );
        }
        uwriteln!(self.src.js, "{handle_tables}[{rtid}] = handleTable{rtid};");
        self.resource_tables_initialized.insert(id, true);
    }

    fn instance_flags(&mut self) {
        // SAFETY: short-lived borrow, and the refcell isn't mutably borrowed in the loop's body.
        let mut instance_flag_defs = String::new();
        for used in self.used_instance_flags.borrow().iter() {
            let i = used.as_u32();
            uwriteln!(
                &mut instance_flag_defs,
                "const instanceFlags{i} = new WebAssembly.Global({{ value: \"i32\", mutable: true }}, {});",
                wasmtime_environ::component::FLAG_MAY_LEAVE
                    | wasmtime_environ::component::FLAG_MAY_ENTER
            );
        }
        self.src.js_init.prepend_str(&instance_flag_defs);
    }

    // Trampolines defined in trampoline() below that use:
    //   const trampoline{} = ...
    // require early initialization since their bindings aren't auto-hoisted
    // like JS functions are in the JS runtime.
    fn is_early_trampoline(trampoline: &Trampoline) -> bool {
        matches!(
            trampoline,
            Trampoline::AsyncStartCall { .. }
                | Trampoline::BackpressureSet { .. }
                | Trampoline::ContextGet(_)
                | Trampoline::ContextSet(_)
                | Trampoline::ErrorContextDebugMessage { .. }
                | Trampoline::ErrorContextDrop { .. }
                | Trampoline::ErrorContextNew { .. }
                | Trampoline::ErrorContextTransfer
                | Trampoline::LowerImport { .. }
                | Trampoline::PrepareCall { .. }
                | Trampoline::ResourceDrop(_)
                | Trampoline::ResourceNew(_)
                | Trampoline::ResourceRep(_)
                | Trampoline::ResourceTransferBorrow
                | Trampoline::ResourceTransferOwn
                | Trampoline::StreamNew { .. }
                | Trampoline::SubtaskCancel { .. }
                | Trampoline::SubtaskDrop { .. }
                | Trampoline::SyncStartCall { .. }
                | Trampoline::TaskCancel { .. }
                | Trampoline::TaskReturn { .. }
                | Trampoline::WaitableJoin { .. }
                | Trampoline::WaitableSetDrop { .. }
                | Trampoline::WaitableSetNew { .. }
        )
    }

    fn trampoline(&mut self, i: TrampolineIndex, trampoline: &'a Trampoline) {
        let i = i.as_u32();
        match trampoline {
            Trampoline::TaskCancel { instance } => {
                let task_cancel_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::TaskCancel));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {task_cancel_fn}.bind(null, {instance_idx});\n",
                    instance_idx = instance.as_u32(),
                );
            }

            Trampoline::SubtaskCancel { instance, async_ } => {
                let task_cancel_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::SubtaskCancel));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {task_cancel_fn}.bind(null, {instance_idx}, {async_});\n",
                    instance_idx = instance.as_u32(),
                );
            }

            Trampoline::SubtaskDrop { instance } => {
                let component_idx = instance.as_u32();
                let subtask_drop_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::SubtaskDrop));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {subtask_drop_fn}.bind(
                         null,
                         {component_idx},
                     );"
                );
            }

            Trampoline::BackpressureSet { instance } => {
                let backpressure_set_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Component(ComponentIntrinsic::BackpressureSet));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {backpressure_set_fn}.bind(null, {});\n",
                    instance.as_u32(),
                );
            }

            Trampoline::WaitableSetNew { instance } => {
                let waitable_set_new_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Waitable(WaitableIntrinsic::WaitableSetNew));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {waitable_set_new_fn}.bind(null, {});\n",
                    instance.as_u32(),
                );
            }

            Trampoline::WaitableSetWait { options } => {
                let CanonicalOptions {
                    instance,
                    async_,
                    data_model:
                        CanonicalOptionsDataModel::LinearMemory(LinearMemoryOptions { memory, .. }),
                    ..
                } = self
                    .component
                    .options
                    .get(*options)
                    .expect("failed to find options")
                else {
                    panic!("unexpected/missing memory data model during waitable-set.wait");
                };

                let waitable_set_wait_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Waitable(WaitableIntrinsic::WaitableSetWait));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {waitable_set_wait_fn}.bind(null, {instance_idx}, {async_}, memory{memory_idx});\n",
                    instance_idx = instance.as_u32(),
                    memory_idx = memory
                        .expect("missing memory idx for waitable-set.wait")
                        .as_u32(),
                );
            }

            Trampoline::WaitableSetPoll { options } => {
                let CanonicalOptions {
                    instance,
                    async_,
                    data_model:
                        CanonicalOptionsDataModel::LinearMemory(LinearMemoryOptions { memory, .. }),
                    ..
                } = self
                    .component
                    .options
                    .get(*options)
                    .expect("failed to find options")
                else {
                    panic!("unexpected memory data model during waitable-set.poll");
                };

                let waitable_set_poll_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Waitable(WaitableIntrinsic::WaitableSetPoll));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {waitable_set_poll_fn}.bind(null, {instance_idx}, {async_}, memory{memory_idx});\n",
                    instance_idx = instance.as_u32(),
                    memory_idx = memory
                        .expect("missing memory idx for waitable-set.poll")
                        .as_u32(),
                );
            }

            Trampoline::WaitableSetDrop { instance } => {
                let waitable_set_drop_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Waitable(WaitableIntrinsic::WaitableSetDrop));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {waitable_set_drop_fn}.bind(null, {instance_idx});\n",
                    instance_idx = instance.as_u32(),
                );
            }

            Trampoline::WaitableJoin { instance } => {
                let waitable_join_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Waitable(WaitableIntrinsic::WaitableJoin));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {waitable_join_fn}.bind(null, {instance_idx});\n",
                    instance_idx = instance.as_u32(),
                );
            }

            // TODO: build a lookup of types that could be used in streams for a given component?
            // Need to have a way to look up/serialize the type indices per component into
            // a lookup of lifting functions? Or just use the cabiLower?
            //
            // TODO: Do we need the component idx
            Trampoline::StreamNew { ty } => {
                let stream_new_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamNew));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {stream_new_fn}.bind(null, {{ streamTypeRep: {} }});\n",
                    ty.as_u32(),
                );
            }

            Trampoline::StreamRead { ty, options } => {
                let options = self
                    .component
                    .options
                    .get(*options)
                    .expect("failed to find options");

                let stream_idx = ty.as_u32();
                let CanonicalOptions {
                    instance,
                    string_encoding,
                    async_,
                    data_model:
                        CanonicalOptionsDataModel::LinearMemory(LinearMemoryOptions { memory, realloc }),
                    ..
                } = options
                else {
                    unreachable!("missing/invalid data model for options during stream.read")
                };
                let component_instance_id = instance.as_u32();
                let memory_idx = memory.expect("missing memory idx for stream.read").as_u32();
                let realloc_idx = realloc
                    .map(|v| v.as_u32().to_string())
                    .unwrap_or_else(|| "null".into());
                let string_encoding = string_encoding_js_literal(string_encoding);

                let stream_read_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamRead));
                uwriteln!(
                    self.src.js,
                    r#"const trampoline{i} = {stream_read_fn}.bind(
                         null,
                         {component_instance_id},
                         {memory_idx},
                         {realloc_idx},
                         {string_encoding},
                         {async_},
                         {stream_idx},
                     );
                    "#,
                );
            }

            Trampoline::StreamWrite { ty, options } => {
                let options = self
                    .component
                    .options
                    .get(*options)
                    .expect("failed to find options");

                let stream_idx = ty.as_u32();
                let CanonicalOptions {
                    instance,
                    string_encoding,
                    async_,
                    data_model:
                        CanonicalOptionsDataModel::LinearMemory(LinearMemoryOptions { memory, realloc }),
                    ..
                } = options
                else {
                    unreachable!("unexpected memory data model during stream.write");
                };
                let component_instance_id = instance.as_u32();
                let memory_idx = memory
                    .expect("missing memory idx for stream.write")
                    .as_u32();
                let realloc_idx = realloc
                    .map(|v| v.as_u32().to_string())
                    .unwrap_or_else(|| "null".into());
                let string_encoding = string_encoding_js_literal(string_encoding);

                let stream_write_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamWrite));
                uwriteln!(
                    self.src.js,
                    r#"const trampoline{i} = {stream_write_fn}.bind(
                         null,
                         {component_instance_id},
                         {memory_idx},
                         {realloc_idx},
                         {string_encoding},
                         {async_},
                         {stream_idx},
                     );
                    "#,
                );
            }

            Trampoline::StreamCancelRead { ty, async_ } => {
                let stream_cancel_read_fn = self.bindgen.intrinsic(Intrinsic::AsyncStream(
                    AsyncStreamIntrinsic::StreamCancelRead,
                ));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {stream_cancel_read_fn}.bind(null, {stream_idx}, {async_});\n",
                    stream_idx = ty.as_u32(),
                );
            }

            Trampoline::StreamCancelWrite { ty, async_ } => {
                let stream_cancel_write_fn = self.bindgen.intrinsic(Intrinsic::AsyncStream(
                    AsyncStreamIntrinsic::StreamCancelWrite,
                ));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {stream_cancel_write_fn}.bind(null, {stream_idx}, {async_});\n",
                    stream_idx = ty.as_u32(),
                );
            }

            Trampoline::StreamDropReadable { ty } => {
                let stream_drop_readable_fn = self.bindgen.intrinsic(Intrinsic::AsyncStream(
                    AsyncStreamIntrinsic::StreamDropReadable,
                ));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {stream_drop_readable_fn}.bind(null, {stream_idx});\n",
                    stream_idx = ty.as_u32(),
                );
            }

            Trampoline::StreamDropWritable { ty } => {
                let stream_drop_writable_fn = self.bindgen.intrinsic(Intrinsic::AsyncStream(
                    AsyncStreamIntrinsic::StreamDropWritable,
                ));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {stream_drop_writable_fn}.bind(null, {stream_idx});\n",
                    stream_idx = ty.as_u32(),
                );
            }

            Trampoline::StreamTransfer => todo!("Trampoline::StreamTransfer"),

            Trampoline::FutureNew { ty } => {
                let future_new_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureNew));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {future_new_fn}.bind(null, {});\n",
                    ty.as_u32(),
                );
            }

            Trampoline::FutureRead { ty, options } => {
                let options = self
                    .component
                    .options
                    .get(*options)
                    .expect("failed to find options");

                let future_idx = ty.as_u32();

                let CanonicalOptions {
                    instance,
                    string_encoding,
                    callback,
                    post_return,
                    async_,
                    data_model:
                        CanonicalOptionsDataModel::LinearMemory(LinearMemoryOptions { memory, realloc }),
                    ..
                } = options
                else {
                    unreachable!("unexpected memory data model during future.read");
                };
                let component_instance_id = instance.as_u32();
                let memory_idx = memory.expect("missing memory idx for future.read").as_u32();
                let realloc_idx = realloc
                    .map(|v| v.as_u32().to_string())
                    .unwrap_or_else(|| "null".into());
                let string_encoding = string_encoding_js_literal(string_encoding);

                assert!(
                    callback.is_none(),
                    "callback should not be present for future read"
                );
                assert!(
                    post_return.is_none(),
                    "post_return should not be present for future read"
                );

                let future_read_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureRead));
                uwriteln!(
                    self.src.js,
                    r#"const trampoline{i} = {future_read_fn}.bind(
                         null,
                         {component_instance_id},
                         {memory_idx},
                         {realloc_idx},
                         {string_encoding},
                         {async_},
                         {future_idx},
                     );
                    "#,
                );
            }

            Trampoline::FutureWrite { ty, options } => {
                let options = self
                    .component
                    .options
                    .get(*options)
                    .expect("failed to find options");

                let future_idx = ty.as_u32();
                let CanonicalOptions {
                    instance,
                    string_encoding,
                    async_,
                    data_model:
                        CanonicalOptionsDataModel::LinearMemory(LinearMemoryOptions { memory, realloc }),
                    ..
                } = options
                else {
                    unreachable!("unexpected memory data model during future.write");
                };
                let component_instance_id = instance.as_u32();
                let memory_idx = memory
                    .expect("missing memory idx for future.write")
                    .as_u32();
                let realloc_idx = realloc
                    .map(|v| v.as_u32().to_string())
                    .unwrap_or_else(|| "null".into());
                let string_encoding = string_encoding_js_literal(string_encoding);

                let future_write_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureWrite));
                uwriteln!(
                    self.src.js,
                    r#"const trampoline{i} = {future_write_fn}.bind(
                         null,
                         {component_instance_id},
                         {memory_idx},
                         {realloc_idx},
                         {string_encoding},
                         {async_},
                         {future_idx},
                     );
                    "#,
                );
            }

            Trampoline::FutureCancelRead { ty, async_ } => {
                let future_cancel_read_fn = self.bindgen.intrinsic(Intrinsic::AsyncFuture(
                    AsyncFutureIntrinsic::FutureCancelRead,
                ));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {future_cancel_read_fn}.bind(null, {future_idx}, {async_});\n",
                    future_idx = ty.as_u32(),
                );
            }

            Trampoline::FutureCancelWrite { ty, async_ } => {
                let future_cancel_write_fn = self.bindgen.intrinsic(Intrinsic::AsyncFuture(
                    AsyncFutureIntrinsic::FutureCancelWrite,
                ));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {future_cancel_write_fn}.bind(null, {future_idx}, {async_});\n",
                    future_idx = ty.as_u32(),
                );
            }

            Trampoline::FutureDropReadable { ty } => {
                let future_drop_readable_fn = self.bindgen.intrinsic(Intrinsic::AsyncFuture(
                    AsyncFutureIntrinsic::FutureDropReadable,
                ));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {future_drop_readable_fn}.bind(null, {future_idx});\n",
                    future_idx = ty.as_u32(),
                );
            }

            Trampoline::FutureDropWritable { ty } => {
                let future_drop_writable_fn = self.bindgen.intrinsic(Intrinsic::AsyncFuture(
                    AsyncFutureIntrinsic::FutureDropWritable,
                ));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {future_drop_writable_fn}.bind(null, {future_idx});\n",
                    future_idx = ty.as_u32(),
                );
            }

            Trampoline::FutureTransfer => todo!("Trampoline::FutureTransfer"),

            Trampoline::ErrorContextNew { ty, options } => {
                let CanonicalOptions {
                    instance,
                    string_encoding,
                    data_model:
                        CanonicalOptionsDataModel::LinearMemory(LinearMemoryOptions { memory, .. }),
                    ..
                } = self
                    .component
                    .options
                    .get(*options)
                    .expect("failed to find options")
                else {
                    panic!("unexpected memory data model during error-context.new");
                };

                self.ensure_error_context_local_table(*instance, *ty);

                let local_err_tbl_idx = ty.as_u32();
                let component_idx = instance.as_u32();

                let memory_idx = memory
                    .expect("missing realloc fn idx for error-context.debug-message")
                    .as_u32();

                // Generate a string decoding function to match this trampoline that does appropriate encoding
                let decoder = match string_encoding {
                    wasmtime_environ::component::StringEncoding::Utf8 => self
                        .bindgen
                        .intrinsic(Intrinsic::String(StringIntrinsic::Utf8Decoder)),
                    wasmtime_environ::component::StringEncoding::Utf16 => self
                        .bindgen
                        .intrinsic(Intrinsic::String(StringIntrinsic::Utf16Decoder)),
                    enc => panic!(
                        "unsupported string encoding [{enc:?}] for error-context.debug-message"
                    ),
                };
                uwriteln!(
                    self.src.js,
                    "function trampoline{i}InputStr(ptr, len) {{
                         return {decoder}.decode(new DataView(memory{memory_idx}.buffer, ptr, len));
                    }}"
                );

                let err_ctx_new_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::ErrCtx(ErrCtxIntrinsic::New));
                // Store the options associated with this new error context for later use in the global array
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {err_ctx_new_fn}.bind(
                         null,
                         {component_idx},
                         {local_err_tbl_idx},
                         trampoline{i}InputStr,
                     );
                    "
                );
            }

            Trampoline::ErrorContextDebugMessage { ty, options } => {
                let CanonicalOptions {
                    instance,
                    async_,
                    callback,
                    post_return,
                    string_encoding,
                    data_model:
                        CanonicalOptionsDataModel::LinearMemory(LinearMemoryOptions { memory, realloc }),
                    ..
                } = self
                    .component
                    .options
                    .get(*options)
                    .expect("failed to find options")
                else {
                    panic!("unexpected memory data model during error-context.debug-message");
                };

                let debug_message_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::ErrCtx(ErrCtxIntrinsic::DebugMessage));

                let realloc_fn_idx = realloc
                    .expect("missing realloc fn idx for error-context.debug-message")
                    .as_u32();
                let memory_idx = memory
                    .expect("missing realloc fn idx for error-context.debug-message")
                    .as_u32();

                // Generate a string encoding function to match this trampoline that does appropriate encoding
                match string_encoding {
                    wasmtime_environ::component::StringEncoding::Utf8 => {
                        let encode_fn = self
                            .bindgen
                            .intrinsic(Intrinsic::String(StringIntrinsic::Utf8Encode));
                        let encode_len_var =
                            Intrinsic::String(StringIntrinsic::Utf8EncodedLen).name();
                        uwriteln!(
                            self.src.js,
                            "function trampoline{i}OutputStr(s, outputPtr) {{
                                 const memory = memory{memory_idx};
                                 const reallocFn = realloc{realloc_fn_idx};
                                 let ptr = {encode_fn}(s, reallocFn, memory);
                                 let len = {encode_len_var};
                                 new DataView(memory.buffer).setUint32(outputPtr, ptr, true)
                                 new DataView(memory.buffer).setUint32(outputPtr + 4, len, true)
                             }}"
                        );
                    }
                    wasmtime_environ::component::StringEncoding::Utf16 => {
                        let encode_fn = self
                            .bindgen
                            .intrinsic(Intrinsic::String(StringIntrinsic::Utf16Encode));
                        uwriteln!(
                            self.src.js,
                            "function trampoline{i}OutputStr(s, outputPtr) {{
                                 const memory = memory{memory_idx};
                                 const reallocFn = realloc{realloc_fn_idx};
                                 let ptr = {encode_fn}(s, reallocFn, memory);
                                 let len = s.length;
                                 new DataView(memory.buffer).setUint32(outputPtr, ptr, true)
                                 new DataView(memory.buffer).setUint32(outputPtr + 4, len, true)
                             }}"
                        );
                    }
                    enc => panic!(
                        "unsupported string encoding [{enc:?}] for error-context.debug-message"
                    ),
                };

                let options_obj = format!(
                    "{{callback:{callback}, postReturn: {post_return}, async: {async_}}}",
                    callback = callback
                        .map(|v| v.as_u32().to_string())
                        .unwrap_or_else(|| "null".into()),
                    post_return = post_return
                        .map(|v| v.as_u32().to_string())
                        .unwrap_or_else(|| "null".into()),
                );

                let component_idx = instance.as_u32();
                let local_err_tbl_idx = ty.as_u32();
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {debug_message_fn}.bind(
                         null,
                         {component_idx},
                         {local_err_tbl_idx},
                         {options_obj},
                         trampoline{i}OutputStr,
                      );"
                );
            }

            Trampoline::ErrorContextDrop { ty } => {
                let drop_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::ErrCtx(ErrCtxIntrinsic::Drop));
                let local_err_tbl_idx = ty.as_u32();
                let component_idx = self.types[*ty].instance.as_u32();
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {drop_fn}.bind(null, {component_idx}, {local_err_tbl_idx});"
                );
            }

            Trampoline::ErrorContextTransfer => {
                let transfer_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::ErrCtx(ErrCtxIntrinsic::Transfer));
                uwriteln!(self.src.js, "const trampoline{i} = {transfer_fn};");
            }

            // This sets up a subtask (sets parent, etc)
            Trampoline::PrepareCall { memory } => {
                let prepare_call_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Host(HostIntrinsic::PrepareCall));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {prepare_call_fn}.bind(null, {memory});",
                    memory = memory
                        .map(|v| v.as_u32().to_string())
                        .unwrap_or_else(|| "null".into()),
                )
            }

            Trampoline::SyncStartCall { callback } => {
                let sync_start_call_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Host(HostIntrinsic::SyncStartCall));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {sync_start_call_fn}.bind(null, {});",
                    callback
                        .map(|v| v.as_u32().to_string())
                        .unwrap_or_else(|| "null".into()),
                );
            }

            // This actually starts a Task (whose parent is a subtask generated during PrepareCall)
            // for a from-component async import call
            Trampoline::AsyncStartCall {
                callback,
                post_return,
            } => {
                let async_start_call_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Host(HostIntrinsic::AsyncStartCall));
                let (callback_idx, callback_fn) = callback
                    .map(|v| (v.as_u32().to_string(), format!("callback_{}", v.as_u32())))
                    .unwrap_or_else(|| ("null".into(), "null".into()));
                let (post_return_idx, post_return_fn) = post_return
                    .map(|v| (v.as_u32().to_string(), format!("postReturn{}", v.as_u32())))
                    .unwrap_or_else(|| ("null".into(), "null".into()));

                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {async_start_call_fn}.bind(
                         null,
                         {{
                             postReturnIdx: {post_return_idx},
                             getPostReturnFn: () => {post_return_fn},
                             callbackIdx: {callback_idx},
                             getCallbackFn: () => {callback_fn},
                             getCallee: () => {callback_fn},
                         }},
                     );",
                );
            }

            // NOTE: lower import trampoline is called, and can generate a function,
            // but that is *not currently used* by the generated code.
            //
            // The approach that probably works here is to WRAP the actual function (which is called `trampoline<lowered index>`)
            // and do the relevant functionality that is inherent to canon_lower
            Trampoline::LowerImport {
                index,
                lower_ty,
                options,
            } => {
                let canon_opts = self
                    .component
                    .options
                    .get(*options)
                    .expect("failed to find options");

                let fn_idx = index.as_u32();

                let lower_import_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Component(ComponentIntrinsic::LowerImport));

                let _ = (lower_ty, canon_opts);

                // TODO: this trampoline (trampoline{i}) is is *already present*?
                // current lower input globalizer code already handles it??
                //
                // Maybe we need a special function name for this? OR does the other trampoline
                // get called all the time as well? It can't be, because it *creates* the function
                // that gets called?
                //
                // Maybe that is actually the lower that gets called all the time and should create the
                // subtask!

                // TODO: the original trampoline (trampoline{i}) MAY point to a function that is
                // lowered for use inside another component.
                //
                // In the post-return test we know that #17 is the async sleep millis and it IS
                // fed into an instantiated component.
                //
                // ```
                // const trampolineXX = WebAssembly.suspending(...)
                // ```

                // TODO: prepare call & start call are called BEFORE the wasm call that IS a subtask starts.
                // this is our only way to distinguish between a regular host call and a host call from inside
                // a component.
                //
                // This means one of them has to create the subtask that the rust side is going to be looking for.

                // NOTE: this means that start_call is a guest->guest *only* thing previously prepared
                // In our case the only valid thign is going to
                //
                // The functionidx is useless it seems, trampoline idx *does* match though

                uwriteln!(
                    self.src.js,
                    "const trampoline_lower_import_fn_{fn_idx} = {lower_import_fn}.bind(
                         null,
                         {{
                             functionIdx: {fn_idx},
                         }},
                     );",
                );
            }

            Trampoline::AlwaysTrap => {
                uwrite!(
                    self.src.js,
                    "function trampoline{i}(rep) {{
                        throw new TypeError('AlwaysTrap');
                    }}
                "
                );
            }

            Trampoline::Transcoder {
                op,
                from,
                from64,
                to,
                to64,
            } => {
                if *from64 || *to64 {
                    unimplemented!("memory 64 transcoder");
                }
                let from = from.as_u32();
                let to = to.as_u32();
                match op {
                    Transcode::Copy(FixedEncoding::Utf8) => {
                        uwriteln!(
                                            self.src.js,
                                            "function trampoline{i} (from_ptr, len, to_ptr) {{
                                new Uint8Array(memory{to}.buffer, to_ptr, len).set(new Uint8Array(memory{from}.buffer, from_ptr, len));
                            }}
                            "
                                        );
                    }
                    Transcode::Copy(FixedEncoding::Utf16) => unimplemented!("utf16 copier"),
                    Transcode::Copy(FixedEncoding::Latin1) => unimplemented!("latin1 copier"),
                    Transcode::Latin1ToUtf16 => unimplemented!("latin to utf16 transcoder"),
                    Transcode::Latin1ToUtf8 => unimplemented!("latin to utf8 transcoder"),
                    Transcode::Utf16ToCompactProbablyUtf16 => {
                        unimplemented!("utf16 to compact wtf16 transcoder")
                    }
                    Transcode::Utf16ToCompactUtf16 => {
                        unimplemented!("utf16 to compact utf16 transcoder")
                    }
                    Transcode::Utf16ToLatin1 => unimplemented!("utf16 to latin1 transcoder"),
                    Transcode::Utf16ToUtf8 => {
                        uwriteln!(
                                            self.src.js,
                                            "function trampoline{i} (src, src_len, dst, dst_len) {{
                                const encoder = new TextEncoder();
                                const {{ read, written }} = encoder.encodeInto(String.fromCharCode.apply(null, new Uint16Array(memory{from}.buffer, src, src_len)), new Uint8Array(memory{to}.buffer, dst, dst_len));
                                return [read, written];
                            }}
                            "
                                        );
                    }
                    Transcode::Utf8ToCompactUtf16 => {
                        unimplemented!("utf8 to compact utf16 transcoder")
                    }
                    Transcode::Utf8ToLatin1 => unimplemented!("utf8 to latin1 transcoder"),
                    Transcode::Utf8ToUtf16 => {
                        uwriteln!(
                                            self.src.js,
                                            "function trampoline{i} (from_ptr, len, to_ptr) {{
                                const decoder = new TextDecoder();
                                const content = decoder.decode(new Uint8Array(memory{from}.buffer, from_ptr, len));
                                const strlen = content.length
                                const view = new Uint16Array(memory{to}.buffer, to_ptr, strlen * 2)
                                for (var i = 0; i < strlen; i++) {{
                                    view[i] = content.charCodeAt(i);
                                }}
                                return strlen;
                            }}
                            "
                                        );
                    }
                };
            }

            Trampoline::ResourceNew(resource) => {
                self.ensure_resource_table(*resource);
                let rid = resource.as_u32();
                let rsc_table_create_own = self.bindgen.intrinsic(Intrinsic::Resource(
                    ResourceIntrinsic::ResourceTableCreateOwn,
                ));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {rsc_table_create_own}.bind(null, handleTable{rid});"
                );
            }

            Trampoline::ResourceRep(resource) => {
                self.ensure_resource_table(*resource);
                let rid = resource.as_u32();
                let rsc_flag = self
                    .bindgen
                    .intrinsic(Intrinsic::Resource(ResourceIntrinsic::ResourceTableFlag));
                uwriteln!(
                    self.src.js,
                    "function trampoline{i} (handle) {{
                        return handleTable{rid}[(handle << 1) + 1] & ~{rsc_flag};
                    }}"
                );
            }

            Trampoline::ResourceDrop(resource) => {
                self.ensure_resource_table(*resource);
                let tid = resource.as_u32();
                let resource_ty = &self.types[*resource];
                let rid = resource_ty.ty.as_u32();

                // Build the code fragment that encapsulates calling the destructor
                let dtor = if let Some(resource_idx) =
                    self.component.defined_resource_index(resource_ty.ty)
                {
                    let resource_def = self
                        .component
                        .initializers
                        .iter()
                        .find_map(|i| match i {
                            GlobalInitializer::Resource(r) if r.index == resource_idx => Some(r),
                            _ => None,
                        })
                        .unwrap();

                    // If a destructor index is defined for the resource, call it
                    if let Some(dtor) = &resource_def.dtor {
                        format!(
                            "
                            {}(handleEntry.rep);",
                            self.core_def(dtor)
                        )
                    } else {
                        "".into()
                    }
                } else {
                    // Imported resource is one without a defined resource index.
                    // If it is a captured instance (class instance was created externally so had to
                    // be assigned a rep), and there is a Symbol.dispose handler, call it explicitly
                    // for imported resources when the resource is dropped.
                    // Otherwise if it is an instance without a captured class definition, then
                    // call the low-level bindgen destructor.
                    let symbol_dispose = self.bindgen.intrinsic(Intrinsic::SymbolDispose);
                    let symbol_cabi_dispose = self.bindgen.intrinsic(Intrinsic::SymbolCabiDispose);

                    // previous imports walk should define all imported resources which are accessible
                    if let Some(imported_resource_local_name) =
                        self.bindgen.local_names.try_get(resource_ty.ty)
                    {
                        format!(
                                            "
                            const rsc = captureTable{rid}.get(handleEntry.rep);
                            if (rsc) {{
                                if (rsc[{symbol_dispose}]) rsc[{symbol_dispose}]();
                                captureTable{rid}.delete(handleEntry.rep);
                            }} else if ({imported_resource_local_name}[{symbol_cabi_dispose}]) {{
                                {imported_resource_local_name}[{symbol_cabi_dispose}](handleEntry.rep);
                            }}"
                                        )
                    } else {
                        // If not, then capture / disposal paths are never called
                        format!(
                            "throw new TypeError('unreachable trampoline for resource [{:?}]')",
                            resource_ty.ty
                        )
                    }
                };

                let rsc_table_remove = self
                    .bindgen
                    .intrinsic(Intrinsic::Resource(ResourceIntrinsic::ResourceTableRemove));
                uwrite!(
                    self.src.js,
                    "function trampoline{i}(handle) {{
                        const handleEntry = {rsc_table_remove}(handleTable{tid}, handle);
                        if (handleEntry.own) {{
                            {dtor}
                        }}
                    }}
                    ",
                );
            }

            Trampoline::ResourceTransferOwn => {
                let resource_transfer = self
                    .bindgen
                    .intrinsic(Intrinsic::Resource(ResourceIntrinsic::ResourceTransferOwn));
                uwriteln!(self.src.js, "const trampoline{i} = {resource_transfer};");
            }

            Trampoline::ResourceTransferBorrow => {
                let resource_transfer =
                    self.bindgen
                        .intrinsic(if self.bindgen.opts.valid_lifting_optimization {
                            Intrinsic::Resource(
                                ResourceIntrinsic::ResourceTransferBorrowValidLifting,
                            )
                        } else {
                            Intrinsic::Resource(ResourceIntrinsic::ResourceTransferBorrow)
                        });
                uwriteln!(self.src.js, "const trampoline{i} = {resource_transfer};");
            }

            Trampoline::ResourceEnterCall => {
                let scope_id = self.bindgen.intrinsic(Intrinsic::ScopeId);
                uwrite!(
                    self.src.js,
                    "function trampoline{i}() {{
                        {scope_id}++;
                    }}
                    ",
                );
            }

            Trampoline::ResourceExitCall => {
                let scope_id = self.bindgen.intrinsic(Intrinsic::ScopeId);
                let resource_borrows = self
                    .bindgen
                    .intrinsic(Intrinsic::Resource(ResourceIntrinsic::ResourceCallBorrows));
                let handle_tables = self.bindgen.intrinsic(Intrinsic::HandleTables);
                // To verify that borrows are dropped, it is enough to verify that the handle
                // either no longer exists (part of free list) or belongs to another scope, since
                // the enter call closed off the ability to create new handles in the parent scope
                uwrite!(
                    self.src.js,
                    "function trampoline{i}() {{
                        {scope_id}--;
                        for (const {{ rid, handle }} of {resource_borrows}) {{
                            if ({handle_tables}[rid][handle << 1] === {scope_id})
                                throw new TypeError('borrows not dropped for resource call');
                        }}
                        {resource_borrows} = [];
                    }}
                    ",
                );
            }

            Trampoline::ContextSet(slot) => {
                let context_set_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::ContextSet));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {context_set_fn}.bind(null, {slot});"
                );
            }

            Trampoline::ContextGet(slot) => {
                let context_get_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::ContextGet));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {context_get_fn}.bind(null, {slot});"
                );
            }

            Trampoline::TaskReturn { results, options } => {
                let canon_opts = self
                    .component
                    .options
                    .get(*options)
                    .expect("failed to find options");
                let CanonicalOptions {
                    instance,
                    async_,
                    data_model:
                        CanonicalOptionsDataModel::LinearMemory(LinearMemoryOptions { memory, realloc }),
                    callback,
                    post_return,
                    ..
                } = canon_opts
                else {
                    unreachable!("unexpected memory data model during task.return");
                };

                // Validate canonopts
                // TODO: these should be traps at runtime rather than failures at transpilation time
                if realloc.is_some() && memory.is_none() {
                    panic!("memory must be present if realloc is");
                }
                if *async_ && post_return.is_some() {
                    panic!("async and post return must not be specified together");
                }
                if *async_ && callback.is_none() {
                    panic!("callback must be specified for async");
                }
                if let Some(cb_idx) = callback {
                    let cb_fn = &self.types[TypeFuncIndex::from_u32(cb_idx.as_u32())];
                    match self.types[cb_fn.params].types[..] {
                        [InterfaceType::S32, InterfaceType::S32, InterfaceType::S32] => {}
                        _ => panic!("unexpected params for async callback fn"),
                    }
                    match self.types[cb_fn.results].types[..] {
                        [InterfaceType::S32] => {}
                        _ => panic!("unexpected results for async callback fn"),
                    }
                }

                // TODO: async callbacks always have a result, but that's not the *actual* return,
                // it's the async one.

                let result_types = &self.types[*results].types;

                // Calculate the number of parameters required to represent the results,
                // and whether they'll be stored in memory
                let result_flat_param_total: usize = result_types
                    .iter()
                    .map(|t| {
                        self.types
                            .canonical_abi(t)
                            .flat_count
                            .map(usize::from)
                            .unwrap_or(0)
                    })
                    .sum();
                let use_direct_params = result_flat_param_total < MAX_ASYNC_FLAT_PARAMS;

                // Build up a list of all the lifting functions that will be needed for the types
                // that are actually being passed through task.return
                let mut lift_fns: Vec<String> = Vec::with_capacity(result_types.len());
                for result_ty in result_types {
                    lift_fns.push(gen_flat_lift_fn_js_expr(
                        self.bindgen,
                        self.types,
                        result_ty,
                        canon_opts,
                    ));
                }
                let lift_fns_js = format!("[{}]", lift_fns.join(","));

                let get_memory_fn_js = memory
                    .map(|idx| format!("() => memory{}", idx.as_u32()))
                    .unwrap_or_else(|| "() => null".into());
                let memory_idx_js = memory
                    .map(|idx| idx.as_u32().to_string())
                    .unwrap_or_else(|| "null".into());
                let component_idx = instance.as_u32();
                let task_return_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::TaskReturn));
                let callback_fn_idx = callback
                    .map(|v| v.as_u32().to_string())
                    .unwrap_or_else(|| "null".into());

                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {task_return_fn}.bind(
                         null,
                         {{
                             componentIdx: {component_idx},
                             useDirectParams: {use_direct_params},
                             getMemoryFn: {get_memory_fn_js},
                             memoryIdx: {memory_idx_js},
                             callbackFnIdx: {callback_fn_idx},
                             liftFns: {lift_fns_js},
                         }},
                     );",
                );
            }

            Trampoline::BackpressureInc { instance } => {
                let backpressure_inc_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Component(ComponentIntrinsic::BackpressureInc));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {backpressure_inc_fn}.bind(null, {instance});\n",
                    instance = instance.as_u32(),
                );
            }

            Trampoline::BackpressureDec { instance } => {
                let backpressure_dec_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::Component(ComponentIntrinsic::BackpressureDec));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {backpressure_dec_fn}.bind(null, {instance});\n",
                    instance = instance.as_u32(),
                );
            }

            Trampoline::ThreadYield { cancellable } => {
                let yield_fn = self
                    .bindgen
                    .intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::Yield));
                uwriteln!(
                    self.src.js,
                    "const trampoline{i} = {yield_fn}.bind(null, {cancellable});\n",
                );
            }
        }
    }

    fn instantiation_global_initializer(&mut self, init: &GlobalInitializer) {
        match init {
            // Extracting callbacks is a part of the async support for hosts -- it ensures that
            // a given core export can be turned into a callback function that will be used
            // later.
            //
            // Generally what we have to do here is to create a callback that can be called upon re-entrance
            // into the component after a related suspension.
            GlobalInitializer::ExtractCallback(ExtractCallback { index, def }) => {
                let callback_idx = index.as_u32();
                let core_def = self.core_def(def);
                uwriteln!(self.src.js, "let callback_{callback_idx};",);
                uwriteln!(self.src.js_init, "callback_{callback_idx} = {core_def};");
            }
            GlobalInitializer::InstantiateModule(m) => match m {
                InstantiateModule::Static(idx, args) => self.instantiate_static_module(*idx, args),
                // This is only needed when instantiating an imported core wasm
                // module which while easy to implement here is not possible to
                // test at this time so it's left unimplemented.
                InstantiateModule::Import(..) => unimplemented!(),
            },
            GlobalInitializer::LowerImport { index, import } => {
                self.lower_import(*index, *import);
            }
            GlobalInitializer::ExtractMemory(m) => {
                let def = self.core_export_var_name(&m.export);
                let idx = m.index.as_u32();
                uwriteln!(self.src.js, "let memory{idx};");
                uwriteln!(self.src.js_init, "memory{idx} = {def};");
            }
            GlobalInitializer::ExtractRealloc(r) => {
                let def = self.core_def(&r.def);
                let idx = r.index.as_u32();
                uwriteln!(self.src.js, "let realloc{idx};");
                uwriteln!(self.src.js_init, "realloc{idx} = {def};",);
            }
            GlobalInitializer::ExtractPostReturn(p) => {
                let def = self.core_def(&p.def);
                let idx = p.index.as_u32();
                uwriteln!(self.src.js, "let postReturn{idx};");
                uwriteln!(self.src.js_init, "postReturn{idx} = {def};");
            }
            GlobalInitializer::Resource(_) => {}
            GlobalInitializer::ExtractTable(extract_table) => {
                let _ = extract_table;
            }
        }
    }

    fn instantiate_static_module(&mut self, idx: StaticModuleIndex, args: &[CoreDef]) {
        // Build a JS "import object" which represents `args`. The `args` is a
        // flat representation which needs to be zip'd with the list of names to
        // correspond to the JS wasm embedding API. This is one of the major
        // differences between Wasmtime's and JS's embedding API.
        let mut import_obj = BTreeMap::new();
        for (module, name, arg) in self.modules[idx].imports(args) {
            let def = if name.starts_with("[async-lower]")
                && let core::AugmentedImport::CoreDef(CoreDef::Export(CoreExport {
                    item: ExportItem::Index(EntityIndex::Function(fn_idx)),
                    ..
                })) = arg
            {
                // For async-lower imports, we should use a trampoline
                // that corresponds to a Trampoline::LowerImport call
                format!("trampoline_lower_import_fn_{}", fn_idx.as_u32())
            } else {
                // All other imports can be augmented normally
                self.augmented_import_def(&arg)
            };

            let dst = import_obj.entry(module).or_insert(BTreeMap::new());
            let prev = dst.insert(name, def);
            assert!(
                prev.is_none(),
                "unsupported duplicate import of `{module}::{name}`"
            );
            assert!(prev.is_none());
        }

        // Build list of imports
        let mut imports = String::new();
        if !import_obj.is_empty() {
            imports.push_str(", {\n");
            for (module, names) in import_obj {
                imports.push_str(&maybe_quote_id(module));
                imports.push_str(": {\n");
                for (name, val) in names {
                    imports.push_str(&maybe_quote_id(name));
                    uwriteln!(imports, ": {val},");
                }
                imports.push_str("},\n");
            }
            imports.push('}');
        }

        let i = self.instances.push(idx);
        let iu32 = i.as_u32();
        let instantiate = self.bindgen.intrinsic(Intrinsic::InstantiateCore);
        uwriteln!(self.src.js, "let exports{iu32};");

        match self.bindgen.opts.instantiation {
            Some(InstantiationMode::Async) | None => {
                uwriteln!(
                    self.src.js_init,
                    "({{ exports: exports{iu32} }} = yield {instantiate}(yield module{}{imports}));",
                    idx.as_u32(),
                )
            }

            Some(InstantiationMode::Sync) => {
                uwriteln!(
                    self.src.js_init,
                    "({{ exports: exports{iu32} }} = {instantiate}(module{}{imports}));",
                    idx.as_u32(),
                );
            }
        }
    }

    /// Map all types in parameters and results to local resource types
    ///
    /// # Arguments
    ///
    /// * `func` - The function in question
    /// * `ty_func_idx` - Type index of the function
    /// * `resource_map` - resource map of locally resolved types
    /// * `remote_resource_map` - resource map of types only known to the remote (ex. an `error-context` for which we only hold the relevant rep)
    ///
    fn create_resource_fn_map(
        &mut self,
        func: &Function,
        ty_func_idx: TypeFuncIndex,
        resource_map: &mut ResourceMap,
        remote_resource_map: &mut RemoteResourceMap,
    ) {
        // Connect resources used in parameters
        let params_ty = &self.types[self.types[ty_func_idx].params];
        for ((_, ty), iface_ty) in func.params.iter().zip(params_ty.types.iter()) {
            if let Type::Id(id) = ty {
                self.connect_resource_types(*id, iface_ty, resource_map, remote_resource_map);
            }
        }
        // Connect resources used in results
        let results_ty = &self.types[self.types[ty_func_idx].results];
        if let (Some(Type::Id(id)), Some(iface_ty)) = (func.result, results_ty.types.first()) {
            self.connect_resource_types(id, iface_ty, resource_map, remote_resource_map);
        }
    }

    fn resource_name(
        resolve: &Resolve,
        local_names: &'a mut LocalNames,
        resource: TypeId,
        resource_map: &BTreeMap<TypeId, ResourceIndex>,
    ) -> &'a str {
        let resource = crate::dealias(resolve, resource);
        local_names
            .get_or_create(
                resource_map[&resource],
                &resolve.types[resource]
                    .name
                    .as_ref()
                    .unwrap()
                    .to_upper_camel_case(),
            )
            .0
    }

    fn lower_import(&mut self, index: LoweredIndex, import: RuntimeImportIndex) {
        let (options, trampoline, func_ty) = self.lowering_options[index];

        // Get the world key for the CM import
        let (import_index, path) = &self.component.imports[import];
        let (import_name, _) = &self.component.import_types[*import_index];
        let world_key = &self.imports[import_name];

        // Determine the name of the function
        let (func, func_name, iface_name) =
            match &self.resolve.worlds[self.world].imports[world_key] {
                WorldItem::Function(func) => {
                    assert_eq!(path.len(), 0);
                    (func, import_name, None)
                }
                WorldItem::Interface { id, stability: _ } => {
                    assert_eq!(path.len(), 1);
                    let iface = &self.resolve.interfaces[*id];
                    let func = &iface.functions[&path[0]];
                    (
                        func,
                        &path[0],
                        Some(iface.name.as_deref().unwrap_or_else(|| import_name)),
                    )
                }
                WorldItem::Type(_) => unreachable!("unexpected imported world item type"),
            };

        let is_async = is_async_fn(func, options);

        if options.async_ {
            assert!(
                options.post_return.is_none(),
                "async function {func_name} (import {import_name}) can't have post return",
            );
        }

        // Host lifted async import (i.e. JSPI)
        let requires_async_porcelain = requires_async_porcelain(
            FunctionIdentifier::Fn(func),
            import_name,
            &self.async_imports,
        );

        // Nested interfaces only currently possible through mapping
        let (import_specifier, maybe_iface_member) = map_import(
            &self.bindgen.opts.map,
            if iface_name.is_some() {
                import_name
            } else {
                match func.kind {
                    FunctionKind::Method(_) => {
                        let stripped = import_name.strip_prefix("[method]").unwrap();
                        &stripped[0..stripped.find(".").unwrap()]
                    }
                    FunctionKind::AsyncMethod(_) => {
                        let stripped = import_name.strip_prefix("[async method]").unwrap();
                        &stripped[0..stripped.find(".").unwrap()]
                    }
                    FunctionKind::Static(_) => {
                        let stripped = import_name.strip_prefix("[static]").unwrap();
                        &stripped[0..stripped.find(".").unwrap()]
                    }
                    FunctionKind::AsyncStatic(_) => {
                        let stripped = import_name.strip_prefix("[async static]").unwrap();
                        &stripped[0..stripped.find(".").unwrap()]
                    }
                    FunctionKind::Constructor(_) => {
                        import_name.strip_prefix("[constructor]").unwrap()
                    }
                    FunctionKind::Freestanding | FunctionKind::AsyncFreestanding => import_name,
                }
            },
        );

        let mut import_resource_map = ResourceMap::new();
        let mut import_remote_resource_map = RemoteResourceMap::new();
        self.create_resource_fn_map(
            func,
            func_ty,
            &mut import_resource_map,
            &mut import_remote_resource_map,
        );

        let (callee_name, call_type) = match func.kind {
            FunctionKind::Freestanding => (
                self.bindgen
                    .local_names
                    .get_or_create(
                        format!(
                            "import:{import}-{maybe_iface_member}-{func_name}",
                            import = import_specifier,
                            maybe_iface_member = maybe_iface_member.as_deref().unwrap_or(""),
                            func_name = &func.name
                        ),
                        &func.name,
                    )
                    .0
                    .to_string(),
                CallType::Standard,
            ),

            FunctionKind::AsyncFreestanding => (
                self.bindgen
                    .local_names
                    .get_or_create(
                        format!(
                            "import:async-{import}-{maybe_iface_member}-{func_name}",
                            import = import_specifier,
                            maybe_iface_member = maybe_iface_member.as_deref().unwrap_or(""),
                            func_name = &func.name
                        ),
                        &func.name,
                    )
                    .0
                    .to_string(),
                CallType::AsyncStandard,
            ),

            FunctionKind::Method(_) => (
                func.item_name().to_lower_camel_case(),
                CallType::CalleeResourceDispatch,
            ),

            FunctionKind::AsyncMethod(_) => (
                func.item_name().to_lower_camel_case(),
                CallType::AsyncCalleeResourceDispatch,
            ),

            FunctionKind::Static(resource_id) => (
                format!(
                    "{}.{}",
                    Instantiator::resource_name(
                        self.resolve,
                        &mut self.bindgen.local_names,
                        resource_id,
                        &self.imports_resource_types
                    ),
                    func.item_name().to_lower_camel_case()
                ),
                CallType::Standard,
            ),

            FunctionKind::AsyncStatic(resource_id) => (
                format!(
                    "{}.{}",
                    Instantiator::resource_name(
                        self.resolve,
                        &mut self.bindgen.local_names,
                        resource_id,
                        &self.imports_resource_types
                    ),
                    func.item_name().to_lower_camel_case()
                ),
                CallType::AsyncStandard,
            ),

            FunctionKind::Constructor(resource_id) => (
                format!(
                    "new {}",
                    Instantiator::resource_name(
                        self.resolve,
                        &mut self.bindgen.local_names,
                        resource_id,
                        &self.imports_resource_types
                    )
                ),
                CallType::Standard,
            ),
        };

        let nparams = self
            .resolve
            .wasm_signature(AbiVariant::GuestImport, func)
            .params
            .len();

        // Generate the JS trampoline function
        match self.bindgen.opts.import_bindings {
            None | Some(BindingsMode::Js) | Some(BindingsMode::Hybrid) => {
                // Write out function declaration start
                if requires_async_porcelain | is_async {
                    // If an import is either an async host import (i.e. JSPI powered)
                    // or a guest async lifted import from another component,
                    // use WebAssembly.Suspending to allow suspending this component
                    uwrite!(
                        self.src.js,
                        "\nconst trampoline{} = new WebAssembly.Suspending(async function",
                        trampoline.as_u32()
                    );
                } else {
                    // If the import is not async in any way, use a regular trampoline
                    uwrite!(self.src.js, "\nfunction trampoline{}", trampoline.as_u32());
                }

                // Write out the function (brace + body + brace)
                self.bindgen(JsFunctionBindgenArgs {
                    nparams,
                    call_type,
                    iface_name: if import_name.is_empty() {
                        None
                    } else {
                        Some(import_name)
                    },
                    callee: &callee_name,
                    opts: options,
                    func,
                    resource_map: &import_resource_map,
                    remote_resource_map: &import_remote_resource_map,
                    abi: AbiVariant::GuestImport,
                    requires_async_porcelain,
                    is_async,
                });
                uwriteln!(self.src.js, "");

                // Write new function ending
                if requires_async_porcelain | is_async {
                    uwriteln!(self.src.js, ");");
                } else {
                    uwriteln!(self.src.js, "");
                }
            }

            Some(BindingsMode::Optimized) | Some(BindingsMode::DirectOptimized) => {
                uwriteln!(self.src.js, "let trampoline{};", trampoline.as_u32());
            }
        };

        // Build import bindings & trampolines for the import
        //
        // This is only necessary if an import binding mode is specified and not JS (the default),
        // (e.g. Optimized, Direct, Hybrid).
        if !matches!(
            self.bindgen.opts.import_bindings,
            None | Some(BindingsMode::Js)
        ) {
            let (memory, realloc) =
                if let CanonicalOptionsDataModel::LinearMemory(LinearMemoryOptions {
                    memory,
                    realloc,
                }) = options.data_model
                {
                    (
                        memory.map(|idx| format!(" memory: memory{},", idx.as_u32())),
                        realloc.map(|idx| format!(" realloc: realloc{},", idx.as_u32())),
                    )
                } else {
                    (None, None)
                };
            let memory = memory.unwrap_or_default();
            let realloc = realloc.unwrap_or_default();

            let post_return = options
                .post_return
                .map(|idx| format!(" postReturn: postReturn{},", idx.as_u32()))
                .unwrap_or("".into());
            let string_encoding = match options.string_encoding {
                wasmtime_environ::component::StringEncoding::Utf8 => "",
                wasmtime_environ::component::StringEncoding::Utf16 => " stringEncoding: 'utf16',",
                wasmtime_environ::component::StringEncoding::CompactUtf16 => {
                    " stringEncoding: 'compact-utf16',"
                }
            };

            let callee_name = match func.kind {
                FunctionKind::Constructor(_) => callee_name[4..].to_string(),

                FunctionKind::Static(_)
                | FunctionKind::AsyncStatic(_)
                | FunctionKind::Freestanding
                | FunctionKind::AsyncFreestanding => callee_name.to_string(),

                FunctionKind::Method(resource_id) | FunctionKind::AsyncMethod(resource_id) => {
                    format!(
                        "{}.prototype.{callee_name}",
                        Instantiator::resource_name(
                            self.resolve,
                            &mut self.bindgen.local_names,
                            resource_id,
                            &self.imports_resource_types
                        )
                    )
                }
            };

            let resource_tables = {
                let mut resource_tables: Vec<TypeResourceTableIndex> = Vec::new();

                for (_, data) in import_resource_map {
                    let ResourceTable {
                        data: ResourceData::Host { tid, .. },
                        ..
                    } = &data
                    else {
                        unreachable!("unexpected non-host resource table");
                    };
                    resource_tables.push(*tid);
                }

                if resource_tables.is_empty() {
                    "".to_string()
                } else {
                    format!(
                        " resourceTables: [{}],",
                        resource_tables
                            .iter()
                            .map(|x| format!("handleTable{}", x.as_u32()))
                            .collect::<Vec<String>>()
                            .join(", ")
                    )
                }
            };

            // Build trampolines for the import
            match self.bindgen.opts.import_bindings {
                Some(BindingsMode::Hybrid) => {
                    let symbol_cabi_lower = self.bindgen.intrinsic(Intrinsic::SymbolCabiLower);
                    uwriteln!(self.src.js_init, "if ({callee_name}[{symbol_cabi_lower}]) {{
                        trampoline{} = {callee_name}[{symbol_cabi_lower}]({{{memory}{realloc}{post_return}{string_encoding}{resource_tables}}});
                    }}", trampoline.as_u32());
                }
                Some(BindingsMode::Optimized) => {
                    let symbol_cabi_lower = self.bindgen.intrinsic(Intrinsic::SymbolCabiLower);
                    if !self.bindgen.opts.valid_lifting_optimization {
                        uwriteln!(self.src.js_init, "if (!{callee_name}[{symbol_cabi_lower}]) {{
                            throw new TypeError('import for \"{import_name}\" does not define a Symbol.for(\"cabiLower\") optimized binding');
                        }}");
                    }
                    uwriteln!(
                        self.src.js_init,
                        "trampoline{} = {callee_name}[{symbol_cabi_lower}]({{{memory}{realloc}{post_return}{string_encoding}{resource_tables}}});",
                        trampoline.as_u32()
                    );
                }
                Some(BindingsMode::DirectOptimized) => {
                    uwriteln!(
                        self.src.js_init,
                        "trampoline{} = {callee_name}({{{memory}{realloc}{post_return}{string_encoding}}});",
                        trampoline.as_u32()
                    );
                }
                None | Some(BindingsMode::Js) => unreachable!("invalid bindings mode"),
            };
        }

        // Figure out the function name and callee (e.g. class for a given resource) to use
        let (import_name, binding_name) = match func.kind {
            FunctionKind::Freestanding | FunctionKind::AsyncFreestanding => (
                // TODO: if we want to avoid the naming of 'async<fn name>' (e.g. 'asyncSleepMillis'
                // vs 'sleepMillis' which just *is* an imported async function)....
                //
                // We need to use the code below:
                //
                // func_name
                //     .strip_prefix("[async]")
                //     .unwrap_or(func_name)
                //     .to_lower_camel_case(),
                //
                // This has the potential to break a lot of downstream consumers who are expecting to
                // provide 'async<fn name>`, so it must be done before a breaking change.
                func_name.to_lower_camel_case(),
                callee_name,
            ),

            FunctionKind::Method(tid)
            | FunctionKind::AsyncMethod(tid)
            | FunctionKind::Static(tid)
            | FunctionKind::AsyncStatic(tid)
            | FunctionKind::Constructor(tid) => {
                let ty = &self.resolve.types[tid];
                (
                    ty.name.as_ref().unwrap().to_upper_camel_case(),
                    Instantiator::resource_name(
                        self.resolve,
                        &mut self.bindgen.local_names,
                        tid,
                        &self.imports_resource_types,
                    )
                    .to_string(),
                )
            }
        };

        self.ensure_import(
            import_specifier,
            iface_name,
            maybe_iface_member.as_deref(),
            if iface_name.is_some() {
                Some(import_name.to_string())
            } else {
                None
            },
            binding_name,
        );
    }

    /// Process an import if it has not already been processed
    ///
    /// # Arguments
    ///
    /// * `import_specifier` - The specifier of the import as used in JS (ex. `"@bytecodealliance/preview2-shim/random"`)
    /// * `iface_name` - The name of the WIT interface related to this binding, if present (ex. `"random"`)
    /// * `iface_member` - The name of the interface member, if present (ex. `"random"`)
    /// * `import_binding` - The name of binding, if present (ex. `"getRandomBytes"`)
    /// * `local_name` - Local name of the import (ex. `"getRandomBytes"`)
    ///
    fn ensure_import(
        &mut self,
        import_specifier: String,
        iface_name: Option<&str>,
        iface_member: Option<&str>,
        import_binding: Option<String>,
        local_name: String,
    ) {
        if import_specifier.starts_with("webidl:") {
            self.bindgen
                .intrinsic(Intrinsic::WebIdl(WebIdlIntrinsic::GlobalThisIdlProxy));
        }

        // Build the import path depending on the kind of interface
        let mut import_path = Vec::with_capacity(2);
        import_path.push(import_specifier);
        if let Some(_iface_name) = iface_name {
            // Mapping can be used to construct virtual nested namespaces
            // which is used eg to support WASI interface groupings
            if let Some(iface_member) = iface_member {
                import_path.push(iface_member.to_lower_camel_case());
            }
            import_path.push(import_binding.clone().unwrap());
        } else if let Some(iface_member) = iface_member {
            import_path.push(iface_member.into());
        } else if let Some(import_binding) = &import_binding {
            import_path.push(import_binding.into());
        }

        // Add the import binding that represents this import
        self.bindgen
            .esm_bindgen
            .add_import_binding(&import_path, local_name);
    }

    /// Connect resources that have no types
    ///
    /// Commonly this is used for resources that have a type on on the import side
    /// but no relevant type on the receiving side, for which local types must be generated locally:
    /// - `error-context`
    /// - `future<_>`
    /// - `stream<_>`
    ///
    fn connect_remote_resources(
        &mut self,
        iface_ty: &InterfaceType,
        remote_resource_map: &mut RemoteResourceMap,
    ) {
        // TODO: finish implementing resource table creation for this data
        let (idx, entry) = match iface_ty {
            InterfaceType::Future(idx) => {
                // Create an entry to represent this future
                (
                    idx.as_u32(),
                    ResourceTable {
                        imported: true,
                        data: ResourceData::Guest {
                            resource_name: "Future".into(),
                            prefix: Some(format!("${}", idx.as_u32())),
                        },
                    },
                )
            }
            InterfaceType::Stream(idx) => (
                idx.as_u32(),
                ResourceTable {
                    imported: true,
                    data: ResourceData::Guest {
                        resource_name: "Stream".into(),
                        prefix: Some(format!("${}", idx.as_u32())),
                    },
                },
            ),
            InterfaceType::ErrorContext(idx) => (
                idx.as_u32(),
                ResourceTable {
                    imported: true,
                    data: ResourceData::Guest {
                        resource_name: "ErrorContext".into(),
                        prefix: Some(format!("${}", idx.as_u32())),
                    },
                },
            ),
            _ => unreachable!("unexpected interface type [{iface_ty:?}] with no type"),
        };

        remote_resource_map.insert(idx, entry);
    }

    /// Connect two types as host resources
    ///
    /// # Arguments
    ///
    /// * `t` - the TypeId
    /// * `tid` - Index into the type resource table of the interface (foreign side)
    /// * `resource_map` - Resource map that holds resource pairings
    ///
    fn connect_host_resource(
        &mut self,
        t: TypeId,
        tid: TypeResourceTableIndex,
        resource_map: &mut ResourceMap,
    ) {
        self.ensure_resource_table(tid);

        // Figure out whether the resource index we're dealing with is for an imported type
        let resource_idx = self.types[tid].ty;
        let imported = self
            .component
            .defined_resource_index(resource_idx)
            .is_none();

        // Retrieve the resource id for the type definition
        let resource_id = crate::dealias(self.resolve, t);
        let ty = &self.resolve.types[resource_id];

        // If the resource is defined by this component (i.e. exported/used internally, *not* imported),
        // then determine the destructor that should be run based on the relevant resource
        let mut dtor_str = None;
        if let Some(resource_idx) = self.component.defined_resource_index(resource_idx) {
            assert!(!imported);
            let resource_def = self
                .component
                .initializers
                .iter()
                .find_map(|i| match i {
                    GlobalInitializer::Resource(r) if r.index == resource_idx => Some(r),
                    _ => None,
                })
                .unwrap();

            if let Some(dtor) = &resource_def.dtor {
                dtor_str = Some(self.core_def(dtor));
            }
        }

        // Look up the local import name
        let resource_name = ty.name.as_ref().unwrap().to_upper_camel_case();

        let local_name = if imported {
            let (world_key, iface_name) = match ty.owner {
                wit_parser::TypeOwner::World(world) => (
                    self.resolve.worlds[world]
                        .imports
                        .iter()
                        .find(|&(_, item)| *item == WorldItem::Type(t))
                        .unwrap()
                        .0
                        .clone(),
                    None,
                ),
                wit_parser::TypeOwner::Interface(iface) => {
                    match &self.resolve.interfaces[iface].name {
                        Some(name) => (WorldKey::Interface(iface), Some(name.as_str())),
                        None => {
                            let key = self.resolve.worlds[self.world]
                                .imports
                                .iter()
                                .find(|&(_, item)| match item {
                                    WorldItem::Interface { id, .. } => *id == iface,
                                    _ => false,
                                })
                                .unwrap()
                                .0;
                            (
                                key.clone(),
                                match key {
                                    WorldKey::Name(name) => Some(name.as_str()),
                                    WorldKey::Interface(_) => None,
                                },
                            )
                        }
                    }
                }
                wit_parser::TypeOwner::None => unimplemented!(),
            };

            let import_name = self.resolve.name_world_key(&world_key);
            let (local_name, _) = self
                .bindgen
                .local_names
                .get_or_create(resource_idx, &resource_name);

            let local_name_str = local_name.to_string();

            // Nested interfaces only currently possible through mapping
            let (import_specifier, maybe_iface_member) =
                map_import(&self.bindgen.opts.map, &import_name);

            // Ensure that the import exists
            self.ensure_import(
                import_specifier,
                iface_name,
                maybe_iface_member.as_deref(),
                iface_name.map(|_| resource_name),
                local_name_str.to_string(),
            );
            local_name_str
        } else {
            let (local_name, _) = self
                .bindgen
                .local_names
                .get_or_create(resource_idx, &resource_name);
            local_name.to_string()
        };

        // Add a resource table to track the host resource
        let entry = ResourceTable {
            imported,
            data: ResourceData::Host {
                tid,
                rid: self.types[tid].ty,
                local_name,
                dtor_name: dtor_str,
            },
        };

        // If the the resource already exists, then  ensure that it is exactly the same as the
        // value we're attempting to insert
        if let Some(existing) = resource_map.get(&resource_id) {
            assert_eq!(*existing, entry);
            return;
        }

        // Insert the resource into the map,
        resource_map.insert(resource_id, entry);
    }

    /// Connect resources that are defined at the type levels in `wit-parser`
    /// to their types as defined in `wamstime-environ`
    ///
    /// The types that are connected here are stored in the `resource_map` for
    /// use later.
    ///
    /// # Arguments
    ///
    /// * `id` - The ID of the type if present (can be missing when dealing with `error-context`s, `future<_>`, etc)
    /// * `iface_ty` - The relevant interface type
    /// * `resource_map` - Resource map that we will update with pairings
    ///
    fn connect_resource_types(
        &mut self,
        id: TypeId,
        iface_ty: &InterfaceType,
        resource_map: &mut ResourceMap,
        remote_resource_map: &mut RemoteResourceMap,
    ) {
        match (&self.resolve.types[id].kind, iface_ty) {
            // For flags and enums we can do nothing -- they're global (?)
            (TypeDefKind::Flags(_), InterfaceType::Flags(_))
            | (TypeDefKind::Enum(_), InterfaceType::Enum(_)) => {}

            // Connect records to records
            (TypeDefKind::Record(t1), InterfaceType::Record(t2)) => {
                let t2 = &self.types[*t2];
                for (f1, f2) in t1.fields.iter().zip(t2.fields.iter()) {
                    if let Type::Id(id) = f1.ty {
                        self.connect_resource_types(id, &f2.ty, resource_map, remote_resource_map);
                    }
                }
            }

            // Handle connecting owned/borrowed handles to owned/borrowed handles
            (
                TypeDefKind::Handle(Handle::Own(t1) | Handle::Borrow(t1)),
                InterfaceType::Own(t2) | InterfaceType::Borrow(t2),
            ) => {
                self.connect_host_resource(*t1, *t2, resource_map);
            }

            // Connect tuples to interface tuples
            (TypeDefKind::Tuple(t1), InterfaceType::Tuple(t2)) => {
                let t2 = &self.types[*t2];
                for (f1, f2) in t1.types.iter().zip(t2.types.iter()) {
                    if let Type::Id(id) = f1 {
                        self.connect_resource_types(*id, f2, resource_map, remote_resource_map);
                    }
                }
            }

            // Connect inner types of variants to their interface types
            (TypeDefKind::Variant(t1), InterfaceType::Variant(t2)) => {
                let t2 = &self.types[*t2];
                for (f1, f2) in t1.cases.iter().zip(t2.cases.iter()) {
                    if let Some(Type::Id(id)) = &f1.ty {
                        self.connect_resource_types(
                            *id,
                            f2.1.as_ref().unwrap(),
                            resource_map,
                            remote_resource_map,
                        );
                    }
                }
            }

            // Connect option<t> to option<t>
            (TypeDefKind::Option(t1), InterfaceType::Option(t2)) => {
                let t2 = &self.types[*t2];
                if let Type::Id(id) = t1 {
                    self.connect_resource_types(*id, &t2.ty, resource_map, remote_resource_map);
                }
            }

            // Connect result<t> to result<t>
            (TypeDefKind::Result(t1), InterfaceType::Result(t2)) => {
                let t2 = &self.types[*t2];
                if let Some(Type::Id(id)) = &t1.ok {
                    self.connect_resource_types(
                        *id,
                        &t2.ok.unwrap(),
                        resource_map,
                        remote_resource_map,
                    );
                }
                if let Some(Type::Id(id)) = &t1.err {
                    self.connect_resource_types(
                        *id,
                        &t2.err.unwrap(),
                        resource_map,
                        remote_resource_map,
                    );
                }
            }

            // Connect list<t> to list types
            (TypeDefKind::List(t1), InterfaceType::List(t2)) => {
                let t2 = &self.types[*t2];
                if let Type::Id(id) = t1 {
                    self.connect_resource_types(
                        *id,
                        &t2.element,
                        resource_map,
                        remote_resource_map,
                    );
                }
            }

            // Connect named types
            (TypeDefKind::Type(ty), _) => {
                if let Type::Id(id) = ty {
                    self.connect_resource_types(*id, iface_ty, resource_map, remote_resource_map);
                }
            }

            // Connect futures & stream types
            (TypeDefKind::Future(maybe_ty), InterfaceType::Future(_))
            | (TypeDefKind::Stream(maybe_ty), InterfaceType::Stream(_)) => {
                match maybe_ty {
                    // The case of an empty future is the propagation of a `null`-like value, usually a simple signal
                    // which we'll connect with the *normally invalid* type value 0 as an indicator
                    None => {
                        self.connect_remote_resources(iface_ty, remote_resource_map);
                    }
                    // For custom types we can connect the inner type
                    Some(Type::Id(t)) => {
                        self.connect_resource_types(*t, iface_ty, resource_map, remote_resource_map)
                    }
                    // For basic types that are connected (non inner types) we can do a generic connect
                    Some(_) => {
                        self.connect_remote_resources(iface_ty, remote_resource_map);
                    }
                }
            }

            // Connect the types in an ok/error variant of a Result to the future that they're being sent in
            (
                TypeDefKind::Result(Result_ { ok, err }),
                tk2 @ (InterfaceType::Future(_) | InterfaceType::Stream(_)),
            ) => {
                if let Some(Type::Id(ok_t)) = ok {
                    self.connect_resource_types(*ok_t, tk2, resource_map, remote_resource_map)
                }
                if let Some(Type::Id(err_t)) = err {
                    self.connect_resource_types(*err_t, tk2, resource_map, remote_resource_map)
                }
            }

            // Connect the types in an option to the future that they're being sent in
            (
                TypeDefKind::Option(ty),
                tk2 @ (InterfaceType::Future(_) | InterfaceType::Stream(_)),
            ) => {
                if let Type::Id(some_t) = ty {
                    self.connect_resource_types(*some_t, tk2, resource_map, remote_resource_map)
                }
            }

            // Connect resources to the future/stream that they're being sent in
            (
                TypeDefKind::Handle(Handle::Own(t1) | Handle::Borrow(t1)),
                tk2 @ (InterfaceType::Future(_) | InterfaceType::Stream(_)),
            ) => self.connect_resource_types(*t1, tk2, resource_map, remote_resource_map),

            (TypeDefKind::Resource, InterfaceType::Future(_) | InterfaceType::Stream(_)) => {}

            // Connect the inner types of variants to the future they're being sent in
            (
                TypeDefKind::Variant(variant),
                tk2 @ (InterfaceType::Future(_) | InterfaceType::Stream(_)),
            ) => {
                for f1 in variant.cases.iter() {
                    if let Some(Type::Id(id)) = &f1.ty {
                        self.connect_resource_types(*id, tk2, resource_map, remote_resource_map);
                    }
                }
            }

            // Connect the inner types of variants to the future they're being sent in
            (
                TypeDefKind::Record(record),
                tk2 @ (InterfaceType::Future(_) | InterfaceType::Stream(_)),
            ) => {
                for f1 in record.fields.iter() {
                    if let Type::Id(id) = f1.ty {
                        self.connect_resource_types(id, tk2, resource_map, remote_resource_map);
                    }
                }
            }

            // Simliar to the non-stream/future case, we don't have to do anything for
            // flags and plain enums as they are read directly
            (
                TypeDefKind::Enum(_) | TypeDefKind::Flags(_),
                InterfaceType::Future(_) | InterfaceType::Stream(_),
            ) => {}

            (TypeDefKind::Resource, tk2) => {
                unreachable!(
                    "resource types do not need to be connected (in this case, to [{tk2:?}])"
                )
            }

            (TypeDefKind::Unknown, tk2) => {
                unreachable!("unknown types cannot be connected (in this case to [{tk2:?}])")
            }

            (tk1, tk2) => unreachable!("invalid typedef kind combination [{tk1:?}] [{tk2:?}]",),
        }
    }

    fn bindgen(&mut self, args: JsFunctionBindgenArgs) {
        let JsFunctionBindgenArgs {
            nparams,
            call_type,
            iface_name,
            callee,
            opts,
            func,
            resource_map,
            remote_resource_map,
            abi,
            requires_async_porcelain,
            is_async,
        } = args;

        let (memory, realloc) =
            if let CanonicalOptionsDataModel::LinearMemory(LinearMemoryOptions {
                memory,
                realloc,
            }) = opts.data_model
            {
                (
                    memory.map(|idx| format!("memory{}", idx.as_u32())),
                    realloc.map(|idx| format!("realloc{}", idx.as_u32())),
                )
            } else {
                (None, None)
            };

        let post_return = opts
            .post_return
            .map(|idx| format!("postReturn{}", idx.as_u32()));

        let tracing_prefix = format!(
            "[iface=\"{}\", function=\"{}\"]",
            iface_name.unwrap_or("<no iface>"),
            func.name
        );

        // Write the function argument list
        //
        // At this point, only the function preamble (e.g. 'function nameOfFunc()') has been written
        self.src.js("(");
        let mut params = Vec::new();
        let mut first = true;
        for i in 0..nparams {
            if i == 0
                && matches!(
                    call_type,
                    CallType::FirstArgIsThis | CallType::AsyncFirstArgIsThis
                )
            {
                params.push("this".into());
                continue;
            }
            if !first {
                self.src.js(", ");
            } else {
                first = false;
            }
            let param = format!("arg{i}");
            self.src.js(&param);
            params.push(param);
        }
        uwriteln!(self.src.js, ") {{");

        // If tracing is enabled, output a function entry tracing message
        if self.bindgen.opts.tracing {
            let event_fields = func
                .params
                .iter()
                .enumerate()
                .map(|(i, (name, _ty))| format!("{name}=${{arguments[{i}]}}"))
                .collect::<Vec<String>>();
            uwriteln!(
                self.src.js,
                "console.error(`{tracing_prefix} call {}`);",
                event_fields.join(", ")
            );
        }

        // If TLA compat was enabled, ensure that it was initialized
        if self.bindgen.opts.tla_compat
            && matches!(abi, AbiVariant::GuestExport)
            && self.bindgen.opts.instantiation.is_none()
        {
            let throw_uninitialized = self.bindgen.intrinsic(Intrinsic::ThrowUninitialized);
            uwrite!(
                self.src.js,
                "\
                if (!_initialized) {throw_uninitialized}();
            "
            );
        }

        // Every call to a component export should create a new Task
        let is_guest_top_level_export = matches!(
            func.kind,
            FunctionKind::Freestanding | FunctionKind::AsyncFreestanding
        ) && matches!(
            abi,
            AbiVariant::GuestExport
                | AbiVariant::GuestExportAsync
                | AbiVariant::GuestExportAsyncStackful
        );
        if is_guest_top_level_export {
            // TODO: create a new Task for this export call
        }

        // Generate function body
        let mut f = FunctionBindgen {
            resource_map,
            remote_resource_map,
            clear_resource_borrows: false,
            intrinsics: &mut self.bindgen.all_intrinsics,
            valid_lifting_optimization: self.bindgen.opts.valid_lifting_optimization,
            sizes: &self.sizes,
            err: if get_thrown_type(self.resolve, func.result).is_some() {
                match abi {
                    AbiVariant::GuestExport
                    | AbiVariant::GuestExportAsync
                    | AbiVariant::GuestExportAsyncStackful => ErrHandling::ThrowResultErr,
                    AbiVariant::GuestImport | AbiVariant::GuestImportAsync => {
                        ErrHandling::ResultCatchHandler
                    }
                }
            } else {
                ErrHandling::None
            },
            block_storage: Vec::new(),
            blocks: Vec::new(),
            callee,
            callee_resource_dynamic: matches!(call_type, CallType::CalleeResourceDispatch),
            memory: memory.as_ref(),
            realloc: realloc.as_ref(),
            tmp: 0,
            params,
            post_return: post_return.as_ref(),
            tracing_prefix: &tracing_prefix,
            tracing_enabled: self.bindgen.opts.tracing,
            encoding: match opts.string_encoding {
                wasmtime_environ::component::StringEncoding::Utf8 => StringEncoding::UTF8,
                wasmtime_environ::component::StringEncoding::Utf16 => StringEncoding::UTF16,
                wasmtime_environ::component::StringEncoding::CompactUtf16 => {
                    StringEncoding::CompactUTF16
                }
            },
            src: source::Source::default(),
            resolve: self.resolve,
            requires_async_porcelain,
            is_async,
            canon_opts: opts,
            iface_name,
        };

        // Emit (and visit, via the `FunctionBindgen` object) an abstract sequence of
        // instructions which represents the function being generated.
        abi::call(
            self.resolve,
            abi,
            match abi {
                AbiVariant::GuestImport | AbiVariant::GuestImportAsync => {
                    LiftLower::LiftArgsLowerResults
                }
                AbiVariant::GuestExport
                | AbiVariant::GuestExportAsync
                | AbiVariant::GuestExportAsyncStackful => LiftLower::LowerArgsLiftResults,
            },
            func,
            &mut f,
            is_async,
        );

        // Once visiting has completed, write the contents the `FunctionBindgen` generated to output
        self.src.js(&f.src);

        // Close function body
        self.src.js("}");
    }

    fn augmented_import_def(&self, def: &core::AugmentedImport<'_>) -> String {
        match def {
            core::AugmentedImport::CoreDef(def) => self.core_def(def),
            core::AugmentedImport::Memory { mem, op } => {
                let mem = self.core_def(mem);
                match op {
                    core::AugmentedOp::I32Load => {
                        format!(
                            "(ptr, off) => new DataView({mem}.buffer).getInt32(ptr + off, true)"
                        )
                    }
                    core::AugmentedOp::I32Load8U => {
                        format!(
                            "(ptr, off) => new DataView({mem}.buffer).getUint8(ptr + off, true)"
                        )
                    }
                    core::AugmentedOp::I32Load8S => {
                        format!("(ptr, off) => new DataView({mem}.buffer).getInt8(ptr + off, true)")
                    }
                    core::AugmentedOp::I32Load16U => {
                        format!(
                            "(ptr, off) => new DataView({mem}.buffer).getUint16(ptr + off, true)"
                        )
                    }
                    core::AugmentedOp::I32Load16S => {
                        format!(
                            "(ptr, off) => new DataView({mem}.buffer).getInt16(ptr + off, true)"
                        )
                    }
                    core::AugmentedOp::I64Load => {
                        format!(
                            "(ptr, off) => new DataView({mem}.buffer).getBigInt64(ptr + off, true)"
                        )
                    }
                    core::AugmentedOp::F32Load => {
                        format!(
                            "(ptr, off) => new DataView({mem}.buffer).getFloat32(ptr + off, true)"
                        )
                    }
                    core::AugmentedOp::F64Load => {
                        format!(
                            "(ptr, off) => new DataView({mem}.buffer).getFloat64(ptr + off, true)"
                        )
                    }
                    core::AugmentedOp::I32Store8 => {
                        format!(
                            "(ptr, val, offset) => {{
                                new DataView({mem}.buffer).setInt8(ptr + offset, val, true);
                            }}"
                        )
                    }
                    core::AugmentedOp::I32Store16 => {
                        format!(
                            "(ptr, val, offset) => {{
                                new DataView({mem}.buffer).setInt16(ptr + offset, val, true);
                            }}"
                        )
                    }
                    core::AugmentedOp::I32Store => {
                        format!(
                            "(ptr, val, offset) => {{
                                new DataView({mem}.buffer).setInt32(ptr + offset, val, true);
                            }}"
                        )
                    }
                    core::AugmentedOp::I64Store => {
                        format!(
                            "(ptr, val, offset) => {{
                                new DataView({mem}.buffer).setBigInt64(ptr + offset, val, true);
                            }}"
                        )
                    }
                    core::AugmentedOp::F32Store => {
                        format!(
                            "(ptr, val, offset) => {{
                                new DataView({mem}.buffer).setFloat32(ptr + offset, val, true);
                            }}"
                        )
                    }
                    core::AugmentedOp::F64Store => {
                        format!(
                            "(ptr, val, offset) => {{
                                new DataView({mem}.buffer).setFloat64(ptr + offset, val, true);
                            }}"
                        )
                    }
                    core::AugmentedOp::MemorySize => {
                        format!("ptr => {mem}.buffer.byteLength / 65536")
                    }
                }
            }
        }
    }

    fn core_def(&self, def: &CoreDef) -> String {
        match def {
            CoreDef::Export(e) => self.core_export_var_name(e),
            CoreDef::Trampoline(i) => format!("trampoline{}", i.as_u32()),
            CoreDef::InstanceFlags(i) => {
                // SAFETY: short-lived borrow-mut.
                self.used_instance_flags.borrow_mut().insert(*i);
                format!("instanceFlags{}", i.as_u32())
            }
        }
    }

    fn core_export_var_name<T>(&self, export: &CoreExport<T>) -> String
    where
        T: Into<EntityIndex> + Copy,
    {
        let name = match &export.item {
            ExportItem::Index(idx) => {
                let module = &self.modules[self.instances[export.instance]];
                let idx = (*idx).into();
                module
                    .exports()
                    .iter()
                    .find_map(|(name, i)| if *i == idx { Some(name) } else { None })
                    .unwrap()
            }
            ExportItem::Name(s) => s,
        };

        let i = export.instance.as_u32() as usize;

        format!("exports{i}{}", maybe_quote_member(name))
    }

    fn exports(&mut self, exports: &NameMap<String, ExportIndex>) {
        for (export_name, export_idx) in exports.raw_iter() {
            let export = &self.component.export_items[*export_idx];
            let world_key = &self.exports[export_name];
            let item = &self.resolve.worlds[self.world].exports[world_key];
            let mut export_resource_map = ResourceMap::new();
            let mut export_remote_resource_map = RemoteResourceMap::new();
            match export {
                Export::LiftedFunction {
                    func: def,
                    options,
                    ty: func_ty,
                } => {
                    let func = match item {
                        WorldItem::Function(f) => f,
                        WorldItem::Interface { .. } | WorldItem::Type(_) => {
                            unreachable!("unexpectedly non-function lifted function export")
                        }
                    };
                    self.create_resource_fn_map(
                        func,
                        *func_ty,
                        &mut export_resource_map,
                        &mut export_remote_resource_map,
                    );

                    let local_name = if let FunctionKind::Constructor(resource_id)
                    | FunctionKind::Method(resource_id)
                    | FunctionKind::Static(resource_id) = func.kind
                    {
                        Instantiator::resource_name(
                            self.resolve,
                            &mut self.bindgen.local_names,
                            resource_id,
                            &self.exports_resource_types,
                        )
                    } else {
                        self.bindgen.local_names.create_once(export_name)
                    }
                    .to_string();

                    let options = self
                        .component
                        .options
                        .get(*options)
                        .expect("failed to find options");

                    self.export_bindgen(
                        &local_name,
                        def,
                        options,
                        func,
                        export_name,
                        &export_resource_map,
                        &export_remote_resource_map,
                    );

                    // Determine the correct export func name
                    let js_func_name = if let FunctionKind::Constructor(ty)
                    | FunctionKind::Method(ty)
                    | FunctionKind::Static(ty) = func.kind
                    {
                        self.resolve.types[ty]
                            .name
                            .as_ref()
                            .unwrap()
                            .to_upper_camel_case()
                    } else {
                        export_name.to_lower_camel_case()
                    };

                    // Add the export binding
                    self.bindgen.esm_bindgen.add_export_binding(
                        None,
                        local_name,
                        js_func_name,
                        func,
                    );
                }

                Export::Instance { exports, .. } => {
                    let id = match item {
                        WorldItem::Interface { id, stability: _ } => *id,
                        WorldItem::Function(_) | WorldItem::Type(_) => {
                            unreachable!("unexpectedly non-interface export instance")
                        }
                    };
                    for (func_name, export_idx) in exports.raw_iter() {
                        let export = &self.component.export_items[*export_idx];
                        let (def, options, func_ty) = match export {
                            Export::LiftedFunction { func, options, ty } => (func, options, ty),
                            Export::Type(_) => continue, // ignored
                            _ => unreachable!("unexpected non-lifted function export"),
                        };

                        let func = &self.resolve.interfaces[id].functions[func_name];

                        self.create_resource_fn_map(
                            func,
                            *func_ty,
                            &mut export_resource_map,
                            &mut export_remote_resource_map,
                        );

                        let local_name = if let FunctionKind::Constructor(resource_id)
                        | FunctionKind::Method(resource_id)
                        | FunctionKind::Static(resource_id) = func.kind
                        {
                            Instantiator::resource_name(
                                self.resolve,
                                &mut self.bindgen.local_names,
                                resource_id,
                                &self.exports_resource_types,
                            )
                        } else {
                            self.bindgen.local_names.create_once(func_name)
                        }
                        .to_string();

                        let options = self
                            .component
                            .options
                            .get(*options)
                            .expect("failed to find options");

                        self.export_bindgen(
                            &local_name,
                            def,
                            options,
                            func,
                            export_name,
                            &export_resource_map,
                            &export_remote_resource_map,
                        );

                        // Determine the export func name
                        let export_func_name = if let FunctionKind::Constructor(ty)
                        | FunctionKind::Method(ty)
                        | FunctionKind::Static(ty) = func.kind
                        {
                            self.resolve.types[ty]
                                .name
                                .as_ref()
                                .unwrap()
                                .to_upper_camel_case()
                        } else {
                            func_name.to_lower_camel_case()
                        };

                        // Add the export binding
                        self.bindgen.esm_bindgen.add_export_binding(
                            Some(export_name),
                            local_name,
                            export_func_name,
                            func,
                        );
                    }
                }

                // ignore type exports for now
                Export::Type(_) => {}

                // This can't be tested at this time so leave it unimplemented
                Export::ModuleStatic { .. } | Export::ModuleImport { .. } => unimplemented!(),
            }
        }
        self.bindgen.esm_bindgen.populate_export_aliases();
    }

    #[allow(clippy::too_many_arguments)]
    fn export_bindgen(
        &mut self,
        local_name: &str,
        def: &CoreDef,
        options: &CanonicalOptions,
        func: &Function,
        export_name: &String,
        export_resource_map: &ResourceMap,
        export_remote_resource_map: &RemoteResourceMap,
    ) {
        // Determine whether the function should be generated as async
        let requires_async_porcelain = requires_async_porcelain(
            FunctionIdentifier::Fn(func),
            export_name,
            &self.async_exports,
        );
        // If the function is *also* async lifted, it
        if options.async_ {
            assert!(
                options.post_return.is_none(),
                "async function {local_name} (export {export_name}) can't have post return"
            );
        }

        let is_async = is_async_fn(func, options);
        let maybe_async = if requires_async_porcelain || is_async {
            "async "
        } else {
            ""
        };

        // Start building early variable declarations
        let core_export_fn = self.core_def(def);
        let callee = match self
            .bindgen
            .local_names
            .get_or_create(&core_export_fn, &core_export_fn)
        {
            (local_name, true) => local_name.to_string(),
            (local_name, false) => {
                let local_name = local_name.to_string();
                uwriteln!(self.src.js, "let {local_name};");
                self.bindgen
                    .all_core_exported_funcs
                    // NOTE: this breaks because using WebAssembly.promising and trying to
                    // await JS from the host is a bug ("trying to suspend JS frames")
                    //
                    // We trigger this either with --async-exports *OR* by widening the check as below
                    //
                    // .push((core_export_fn.clone(), requires_async_porcelain || is_async));
                    .push((core_export_fn.clone(), requires_async_porcelain));
                local_name
            }
        };

        match func.kind {
            FunctionKind::Freestanding => {
                uwrite!(self.src.js, "\n{maybe_async}function {local_name}")
            }
            FunctionKind::Method(_) => {
                self.ensure_local_resource_class(local_name.to_string());
                let method_name = func.item_name().to_lower_camel_case();

                uwrite!(
                    self.src.js,
                    "\n{local_name}.prototype.{method_name} = {maybe_async}function {}",
                    if !is_js_reserved_word(&method_name) {
                        method_name.to_string()
                    } else {
                        format!("${method_name}")
                    }
                );
            }
            FunctionKind::Static(_) => {
                self.ensure_local_resource_class(local_name.to_string());
                let method_name = func.item_name().to_lower_camel_case();
                uwrite!(
                    self.src.js,
                    "\n{local_name}.{method_name} = function {}",
                    if !is_js_reserved_word(&method_name) {
                        method_name.to_string()
                    } else {
                        format!("${method_name}")
                    }
                );
            }
            FunctionKind::Constructor(_) => {
                if self.defined_resource_classes.contains(local_name) {
                    panic!(
                        "Internal error: Resource constructor must be defined before other methods and statics"
                    );
                }
                uwrite!(
                    self.src.js,
                    "
                    class {local_name} {{
                        constructor"
                );
                self.defined_resource_classes.insert(local_name.to_string());
            }
            FunctionKind::AsyncFreestanding => {
                uwrite!(self.src.js, "\nasync function {local_name}")
            }
            FunctionKind::AsyncMethod(_) => {
                self.ensure_local_resource_class(local_name.to_string());
                let method_name = func.item_name().to_lower_camel_case();
                let fn_name = if !is_js_reserved_word(&method_name) {
                    method_name.to_string()
                } else {
                    format!("${method_name}")
                };
                uwrite!(
                    self.src.js,
                    "\n{local_name}.prototype.{method_name} = async function {fn_name}",
                );
            }
            FunctionKind::AsyncStatic(_) => {
                self.ensure_local_resource_class(local_name.to_string());
                let method_name = func.item_name().to_lower_camel_case();
                let fn_name = if !is_js_reserved_word(&method_name) {
                    method_name.to_string()
                } else {
                    format!("${method_name}")
                };
                uwrite!(
                    self.src.js,
                    "\n{local_name}.{method_name} = async function {fn_name}",
                );
            }
        }

        // Perform bindgen
        self.bindgen(JsFunctionBindgenArgs {
            nparams: func.params.len(),
            call_type: match func.kind {
                FunctionKind::Method(_) => CallType::FirstArgIsThis,
                FunctionKind::AsyncMethod(_) => CallType::AsyncFirstArgIsThis,
                FunctionKind::Freestanding
                | FunctionKind::Static(_)
                | FunctionKind::Constructor(_) => CallType::Standard,
                FunctionKind::AsyncFreestanding | FunctionKind::AsyncStatic(_) => {
                    CallType::AsyncStandard
                }
            },
            iface_name: if export_name.is_empty() {
                None
            } else {
                Some(export_name)
            },
            callee: &callee,
            opts: options,
            func,
            resource_map: export_resource_map,
            remote_resource_map: export_remote_resource_map,
            abi: AbiVariant::GuestExport,
            requires_async_porcelain,
            is_async,
        });

        // End the function
        match func.kind {
            FunctionKind::AsyncFreestanding | FunctionKind::Freestanding => self.src.js("\n"),
            FunctionKind::AsyncMethod(_)
            | FunctionKind::AsyncStatic(_)
            | FunctionKind::Method(_)
            | FunctionKind::Static(_) => self.src.js(";\n"),
            FunctionKind::Constructor(_) => self.src.js("\n}\n"),
        }
    }
}

#[derive(Default)]
pub struct Source {
    pub js: source::Source,
    pub js_init: source::Source,
}

impl Source {
    pub fn js(&mut self, s: &str) {
        self.js.push_str(s);
    }
    pub fn js_init(&mut self, s: &str) {
        self.js_init.push_str(s);
    }
}

fn map_import(map: &Option<HashMap<String, String>>, impt: &str) -> (String, Option<String>) {
    let impt_sans_version = match impt.find('@') {
        Some(version_idx) => &impt[0..version_idx],
        None => impt,
    };
    if let Some(map) = map.as_ref() {
        if let Some(mapping) = map.get(impt) {
            return if let Some(hash_idx) = mapping[1..].find('#') {
                (
                    mapping[0..hash_idx + 1].to_string(),
                    Some(mapping[hash_idx + 2..].into()),
                )
            } else {
                (mapping.into(), None)
            };
        }
        if let Some(mapping) = map.get(impt_sans_version) {
            return if let Some(hash_idx) = mapping[1..].find('#') {
                (
                    mapping[0..hash_idx + 1].to_string(),
                    Some(mapping[hash_idx + 2..].into()),
                )
            } else {
                (mapping.into(), None)
            };
        }
        for (key, mapping) in map {
            if let Some(wildcard_idx) = key.find('*') {
                let lhs = &key[0..wildcard_idx];
                let rhs = &key[wildcard_idx + 1..];
                if impt_sans_version.starts_with(lhs) && impt_sans_version.ends_with(rhs) {
                    let matched = &impt_sans_version[wildcard_idx
                        ..wildcard_idx + impt_sans_version.len() - lhs.len() - rhs.len()];
                    let mapping = mapping.replace('*', matched);
                    return if let Some(hash_idx) = mapping[1..].find('#') {
                        (
                            mapping[0..hash_idx + 1].to_string(),
                            Some(mapping[hash_idx + 2..].into()),
                        )
                    } else {
                        (mapping, None)
                    };
                }
                if impt.starts_with(lhs) && impt.ends_with(rhs) {
                    let matched =
                        &impt[wildcard_idx..wildcard_idx + impt.len() - lhs.len() - rhs.len()];
                    let mapping = mapping.replace('*', matched);
                    return if let Some(hash_idx) = mapping[1..].find('#') {
                        (
                            mapping[0..hash_idx + 1].to_string(),
                            Some(mapping[hash_idx + 2..].into()),
                        )
                    } else {
                        (mapping, None)
                    };
                }
            }
        }
    }
    (impt_sans_version.to_string(), None)
}

pub fn parse_world_key(name: &str) -> Option<(&str, &str, &str)> {
    let registry_idx = name.find(':')?;
    let ns = &name[0..registry_idx];
    match name.rfind('/') {
        Some(sep_idx) => {
            let end = if let Some(version_idx) = name.rfind('@') {
                version_idx
            } else {
                name.len()
            };
            Some((
                ns,
                &name[registry_idx + 1..sep_idx],
                &name[sep_idx + 1..end],
            ))
        }
        // interface is a namespace, function is a default export
        None => Some((ns, &name[registry_idx + 1..], "")),
    }
}

fn core_file_name(name: &str, idx: u32) -> String {
    let i_str = if idx == 0 {
        String::from("")
    } else {
        (idx + 1).to_string()
    };
    format!("{name}.core{i_str}.wasm")
}

/// Encode a [`StringEncoding`] as a string that can be used in Javascript
fn string_encoding_js_literal(val: &wasmtime_environ::component::StringEncoding) -> &'static str {
    match val {
        wasmtime_environ::component::StringEncoding::Utf8 => "'utf8'",
        wasmtime_environ::component::StringEncoding::Utf16 => "'utf16'",
        wasmtime_environ::component::StringEncoding::CompactUtf16 => "'compact-utf16'",
    }
}

/// Generate the javascript lifting function for a given type
///
/// This function will a function object that can be executed with the right
/// context in order to perform the lift. For example, running this for bool
/// will produce the following:
///
/// ```
/// _liftFlatBool
/// ```
///
/// This is becasue all it takes to lift a flat boolean is to run the _liftFlatBool function intrinsic.
///
/// The intrinsic it guaranteed to be in scope once execution time because it wlil be used in the relevant branch.
///
pub fn gen_flat_lift_fn_js_expr(
    intrinsic_mgr: &mut impl ManagesIntrinsics,
    component_types: &ComponentTypes,
    ty: &InterfaceType,
    canon_opts: &CanonicalOptions,
) -> String {
    //let ty_abi = component_types.canonical_abi(ty);
    let string_encoding = canon_opts.string_encoding;
    match ty {
        InterfaceType::Bool => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatBool));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatBool).name().into()
        }
        InterfaceType::S8 => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatS8));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatS8).name().into()
        }
        InterfaceType::U8 => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatU8));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatU8).name().into()
        }
        InterfaceType::S16 => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatS16));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatS16).name().into()
        }
        InterfaceType::U16 => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatU16));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatU16).name().into()
        }
        InterfaceType::S32 => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatS32));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatS32).name().into()
        }
        InterfaceType::U32 => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatU32));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatU32).name().into()
        }
        InterfaceType::S64 => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatS64));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatS64).name().into()
        }
        InterfaceType::U64 => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatU64));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatU64).name().into()
        }
        InterfaceType::Float32 => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatFloat32));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatFloat32)
                .name()
                .into()
        }
        InterfaceType::Float64 => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatFloat64));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatFloat64)
                .name()
                .into()
        }
        InterfaceType::Char => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatChar));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatChar).name().into()
        }
        InterfaceType::String => match string_encoding {
            wasmtime_environ::component::StringEncoding::Utf8 => {
                intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatStringUtf8));
                Intrinsic::Lift(LiftIntrinsic::LiftFlatStringUtf8)
                    .name()
                    .into()
            }
            wasmtime_environ::component::StringEncoding::Utf16 => {
                intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatStringUtf16));
                Intrinsic::Lift(LiftIntrinsic::LiftFlatStringUtf16)
                    .name()
                    .into()
            }
            wasmtime_environ::component::StringEncoding::CompactUtf16 => {
                todo!("latin1+utf8 not supported")
            }
        },
        InterfaceType::Record(ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatRecord));
            let lift_fn = Intrinsic::Lift(LiftIntrinsic::LiftFlatRecord).name();
            let record_ty = &component_types[*ty_idx];
            let mut keys_and_lifts_expr = String::from("[");
            for f in &record_ty.fields {
                // For each field we build a list of [name, liftFn, 32bit alignment]
                // so that the record lifting function (which is a higher level function)
                // can properly generate a function that lifts the fields.
                keys_and_lifts_expr.push_str(&format!(
                    "['{}', {}, {}],",
                    f.name,
                    gen_flat_lift_fn_js_expr(intrinsic_mgr, component_types, &f.ty, canon_opts),
                    component_types.canonical_abi(ty).size32,
                ));
            }
            keys_and_lifts_expr.push(']');
            format!("{lift_fn}({keys_and_lifts_expr})")
        }
        InterfaceType::Variant(ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatVariant));
            let lift_fn = Intrinsic::Lift(LiftIntrinsic::LiftFlatVariant).name();
            let variant_ty = &component_types[*ty_idx];
            let mut cases_and_lifts_expr = String::from("[");
            for (name, maybe_ty) in &variant_ty.cases {
                cases_and_lifts_expr.push_str(&format!(
                    "['{}', {}, {}],",
                    name,
                    maybe_ty
                        .as_ref()
                        .map(|ty| gen_flat_lift_fn_js_expr(
                            intrinsic_mgr,
                            component_types,
                            ty,
                            canon_opts
                        ))
                        .unwrap_or(String::from("null")),
                    maybe_ty
                        .as_ref()
                        .map(|ty| component_types.canonical_abi(ty).size32)
                        .map(|n| n.to_string())
                        .unwrap_or(String::from("null")),
                ));
            }
            cases_and_lifts_expr.push(']');
            format!("{lift_fn}({cases_and_lifts_expr})")
        }
        InterfaceType::List(_ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatList));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatList).name().into()
        }
        InterfaceType::Tuple(_ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatTuple));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatTuple).name().into()
        }
        InterfaceType::Flags(_ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatFlags));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatFlags).name().into()
        }
        InterfaceType::Enum(_ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatEnum));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatEnum).name().into()
        }
        InterfaceType::Option(_ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatOption));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatOption).name().into()
        }
        InterfaceType::Result(ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatResult));
            let lift_fn = Intrinsic::Lift(LiftIntrinsic::LiftFlatResult).name();
            let result_ty = &component_types[*ty_idx];
            let mut cases_and_lifts_expr = String::from("[");
            cases_and_lifts_expr.push_str(&format!(
                "['{}', {}, {}],",
                "ok",
                result_ty
                    .ok
                    .as_ref()
                    .map(|ty| gen_flat_lift_fn_js_expr(
                        intrinsic_mgr,
                        component_types,
                        ty,
                        canon_opts
                    ))
                    .unwrap_or(String::from("null")),
                result_ty
                    .ok
                    .as_ref()
                    .map(|ty| component_types.canonical_abi(ty).size32)
                    .map(|n| n.to_string())
                    .unwrap_or(String::from("null")),
            ));
            cases_and_lifts_expr.push_str(&format!(
                "['{}', {}, {}],",
                "error",
                result_ty
                    .err
                    .as_ref()
                    .map(|ty| gen_flat_lift_fn_js_expr(
                        intrinsic_mgr,
                        component_types,
                        ty,
                        canon_opts
                    ))
                    .unwrap_or(String::from("null")),
                result_ty
                    .err
                    .as_ref()
                    .map(|ty| component_types.canonical_abi(ty).size32)
                    .map(|n| n.to_string())
                    .unwrap_or(String::from("null")),
            ));

            cases_and_lifts_expr.push(']');
            format!("{lift_fn}({cases_and_lifts_expr})")
        }
        InterfaceType::Own(_ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatOwn));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatOwn).name().into()
        }
        InterfaceType::Borrow(_ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatOwn));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatOwn).name().into()
        }
        InterfaceType::Future(_ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatFuture));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatFuture).name().into()
        }
        InterfaceType::Stream(_ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatStream));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatStream).name().into()
        }
        InterfaceType::ErrorContext(_ty_idx) => {
            intrinsic_mgr.add_intrinsic(Intrinsic::Lift(LiftIntrinsic::LiftFlatErrorContext));
            Intrinsic::Lift(LiftIntrinsic::LiftFlatErrorContext)
                .name()
                .into()
        }
    }
}
