use crate::core;
use crate::esm_bindgen::EsmBindgen;
use crate::files::Files;
use crate::function_bindgen::{
    ErrHandling, FunctionBindgen, ResourceData, ResourceMap, ResourceTable,
};
use crate::intrinsics::{render_intrinsics, Intrinsic};
use crate::names::{maybe_quote_id, maybe_quote_member, LocalNames};
use crate::source;
use crate::{uwrite, uwriteln};
use base64::{engine::general_purpose, Engine as _};
use heck::*;
use indexmap::IndexMap;
use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fmt::Write;
use std::mem;
use wasmtime_environ::component::{
    ComponentTypes, InterfaceType, RuntimeComponentInstanceIndex, TypeDef, TypeFuncIndex,
    TypeResourceTableIndex,
};
use wasmtime_environ::{
    component,
    component::{
        CanonicalOptions, Component, ComponentTranslation, CoreDef, CoreExport, Export, ExportItem,
        GlobalInitializer, InstantiateModule, LoweredIndex, RuntimeImportIndex,
        RuntimeInstanceIndex, StaticModuleIndex, Trampoline, TrampolineIndex,
    },
    fact::{FixedEncoding, Transcode},
    EntityIndex, PrimaryMap,
};
use wit_bindgen_core::abi::{self, LiftLower};
use wit_component::StringEncoding;
use wit_parser::abi::AbiVariant;
use wit_parser::{
    Function, FunctionKind, Handle, Resolve, SizeAlign, Type, TypeDefKind, TypeId, WorldId,
    WorldItem, WorldKey,
};

#[derive(Hash)]
struct ResourceInstance<'a> {
    resource_id: TypeId,
    import: Option<&'a str>,
}

#[derive(Default, Clone)]
pub struct TranspileOpts {
    pub name: String,
    /// Disables generation of `*.d.ts` files and instead only generates `*.js`
    /// source files.
    pub no_typescript: bool,
    /// Provide a custom JS instantiation API for the component instead
    /// of the direct importable native ESM output.
    pub instantiation: Option<InstantiationMode>,
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
}

#[derive(Default, Clone, Debug)]
pub enum InstantiationMode {
    #[default]
    Async,
    Sync,
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
}

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
    let mut bindgen = JsBindgen {
        local_names: LocalNames::default(),
        src: Source::default(),
        esm_bindgen: EsmBindgen::default(),
        core_module_cnt: 0,
        opts: &opts,
        all_intrinsics: BTreeSet::new(),
    };
    bindgen
        .local_names
        .exclude_globals(Intrinsic::get_global_names());
    bindgen.core_module_cnt = modules.len();

    // bindings is the actual `instantiate` method itself, created by this
    // structure.

    let mut instantiator = Instantiator {
        src: Source::default(),
        sizes: SizeAlign::default(),
        gen: &mut bindgen,
        modules,
        instances: Default::default(),
        resolve,
        world: id,
        translation: component,
        component: &component.component,
        types,
        imports: Default::default(),
        exports: Default::default(),
        lowering_options: Default::default(),
        imports_resource_map: Default::default(),
        exports_resource_map: Default::default(),
        used_instance_flags: Default::default(),
        defined_resource_classes: Default::default(),
        resource_dtors: Default::default(),
        resource_tables_initialized: (0..component.component.num_resource_tables)
            .map(|_| false)
            .collect(),
    };
    instantiator.sizes.fill(resolve);
    instantiator.initialize();
    instantiator.instantiate();
    instantiator.ensure_resource_tables();
    instantiator.destructors();
    instantiator.instance_flags();
    instantiator.gen.src.js(&instantiator.src.js);
    instantiator.gen.src.js_init(&instantiator.src.js_init);

    instantiator.gen.finish_component(name, files, &opts);

    let exports = instantiator
        .gen
        .esm_bindgen
        .exports()
        .iter()
        .map(|(export_name, canon_export_name)| {
            let export = if canon_export_name.contains(':') {
                &instantiator.component.exports[*canon_export_name]
            } else {
                &instantiator.component.exports[&canon_export_name.to_kebab_case()]
            };
            (export_name.to_string(), export.clone())
        })
        .collect();

    (bindgen.esm_bindgen.import_specifiers(), exports)
}

impl<'a> JsBindgen<'a> {
    fn finish_component(&mut self, name: &str, files: &mut Files, opts: &TranspileOpts) {
        let mut output = source::Source::default();
        let mut compilation_promises = source::Source::default();

        // Setup the compilation data and compilation promises
        let mut removed = BTreeSet::new();
        for i in 0..self.core_module_cnt {
            let local_name = format!("module{}", i);
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

        let js_intrinsics = render_intrinsics(
            &mut self.all_intrinsics,
            self.opts.no_nodejs_compat,
            self.opts.instantiation.clone(),
        );

        match self.opts.instantiation {
            Some(InstantiationMode::Async) => {
                uwrite!(
                    output,
                    "\
                        {}
                        export async function instantiate(getCoreModule, imports, instantiateCore = WebAssembly.instantiate) {{
                            {}
                    ",
                    &js_intrinsics as &str,
                    &compilation_promises as &str,
                )
            }

            Some(InstantiationMode::Sync) => {
                uwrite!(
                    output,
                    "\
                        {}
                        export function instantiate(getCoreModule, imports, instantiateCore = WebAssembly.Instance) {{
                            {}
                    ",
                    &js_intrinsics as &str,
                    &compilation_promises as &str,
                )
            }

            None => {}
        }

        let imports_object = if self.opts.instantiation.is_some() {
            Some("imports")
        } else {
            None
        };
        self.esm_bindgen
            .render_imports(&mut output, imports_object, &mut self.local_names);

        if self.opts.instantiation.is_some() {
            self.esm_bindgen.render_exports(
                &mut self.src.js,
                self.opts.instantiation.is_some(),
                &mut self.local_names,
                opts,
            );
            uwrite!(
                output,
                "\
                        {}\
                        {};
                    }}
                ",
                &self.src.js_init as &str,
                &self.src.js as &str,
            );
        } else {
            let (maybe_init_export, maybe_init) = if self.opts.tla_compat {
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
                    {maybe_init_export}const $init = (async() => {{
                        {}\
                        {}\
                    }})();
                    {maybe_init}\
                ",
                &js_intrinsics as &str,
                &self.src.js as &str,
                &compilation_promises as &str,
                &self.src.js_init as &str,
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
    gen: &'a mut JsBindgen<'b>,
    modules: &'a PrimaryMap<StaticModuleIndex, core::Translation<'a>>,
    instances: PrimaryMap<RuntimeInstanceIndex, StaticModuleIndex>,
    types: &'a ComponentTypes,
    resolve: &'a Resolve,
    world: WorldId,
    sizes: SizeAlign,
    component: &'a Component,
    translation: &'a ComponentTranslation,
    resource_tables_initialized: Vec<bool>,
    exports: BTreeMap<String, WorldKey>,
    imports: BTreeMap<String, WorldKey>,
    imports_resource_map: ResourceMap,
    exports_resource_map: ResourceMap,
    /// Instance flags which references have been emitted externally at least once.
    used_instance_flags: RefCell<BTreeSet<RuntimeComponentInstanceIndex>>,
    defined_resource_classes: BTreeSet<String>,
    resource_dtors: BTreeMap<TypeId, CoreDef>,
    lowering_options:
        PrimaryMap<LoweredIndex, (&'a CanonicalOptions, TrampolineIndex, TypeFuncIndex)>,
}

impl<'a> Instantiator<'a, '_> {
    fn initialize(&mut self) {
        // populate reverse map from import names to world items
        // as well as the full resource map for the world
        for (key, item) in &self.resolve.worlds[self.world].imports {
            let name = &self.resolve.name_world_key(key);
            self.imports.insert(name.to_string(), key.clone());
            let Some((_, (_, import))) = self
                .component
                .import_types
                .iter()
                .find(|(_, (impt_name, _))| impt_name == name)
            else {
                match item {
                    WorldItem::Interface(_) => unreachable!(),
                    WorldItem::Function(_) => unreachable!(),
                    WorldItem::Type(ty) => assert!(!matches!(
                        self.resolve.types[*ty].kind,
                        TypeDefKind::Resource
                    )),
                }
                continue;
            };
            match item {
                WorldItem::Interface(iface) => {
                    let TypeDef::ComponentInstance(instance) = import else {
                        unreachable!()
                    };
                    let import_ty = &self.types[*instance];
                    let iface = &self.resolve.interfaces[*iface];
                    for (ty_name, ty) in &iface.types {
                        match &import_ty.exports.get(ty_name) {
                            Some(TypeDef::Resource(resource)) => {
                                self.connect_resources(*ty, *resource, false);
                            }
                            Some(TypeDef::Interface(iface)) => {
                                self.connect_resource_types(*ty, iface, false);
                            }
                            Some(_) => unreachable!(),
                            None => {
                                // This can be safely ignored because you can import
                                // less than an interface actually has
                            }
                        }
                    }
                    for (func_name, func) in &iface.functions {
                        let TypeDef::ComponentFunc(ty) = &import_ty.exports[func_name] else {
                            unreachable!()
                        };
                        self.create_resource_fn_map(func, *ty, false);
                    }
                }
                WorldItem::Function(func) => {
                    let TypeDef::ComponentFunc(func_ty) = import else {
                        unreachable!()
                    };
                    self.create_resource_fn_map(func, *func_ty, false);
                }
                WorldItem::Type(ty) => match import {
                    TypeDef::Resource(resource) => {
                        self.connect_resources(*ty, *resource, false);
                    }
                    TypeDef::Interface(iface) => {
                        self.connect_resource_types(*ty, iface, false);
                    }
                    _ => unreachable!(),
                },
            }
        }
        self.exports_resource_map = self.imports_resource_map.clone();
        for (key, item) in &self.resolve.worlds[self.world].exports {
            let name = &self.resolve.name_world_key(key);
            self.exports.insert(name.to_string(), key.clone());
            let (_, export) = self
                .component
                .exports
                .iter()
                .find(|(expt_name, _)| *expt_name == name)
                .unwrap();
            match item {
                WorldItem::Interface(iface) => {
                    let iface = &self.resolve.interfaces[*iface];
                    let Export::Instance(instance) = &export else {
                        unreachable!()
                    };
                    for (ty_name, ty) in &iface.types {
                        match instance.get(ty_name).unwrap() {
                            Export::Type(TypeDef::Resource(resource)) => {
                                self.connect_resources(*ty, *resource, true);
                            }
                            Export::Type(TypeDef::Interface(iface)) => {
                                self.connect_resource_types(*ty, iface, true);
                            }
                            _ => unreachable!(),
                        }
                    }
                    for (func_name, func) in &iface.functions {
                        let Export::LiftedFunction { ty, .. } = instance.get(func_name).unwrap()
                        else {
                            unreachable!()
                        };
                        self.create_resource_fn_map(func, *ty, true);
                    }
                }
                WorldItem::Function(func) => {
                    let Export::LiftedFunction { ty, .. } = export else {
                        unreachable!()
                    };
                    self.create_resource_fn_map(func, *ty, true);
                }
                WorldItem::Type(_) => unreachable!(),
            }
        }
    }

    fn instantiate(&mut self) {
        for (i, trampoline) in self.translation.trampolines.iter() {
            let Trampoline::LowerImport {
                index,
                lower_ty,
                options,
            } = trampoline
            else {
                continue;
            };
            let i = self.lowering_options.push((options, i, *lower_ty));
            assert_eq!(i, *index);
        }

        if let Some(InstantiationMode::Async) = self.gen.opts.instantiation {
            // To avoid uncaught promise rejection errors, we attach an intermediate
            // Promise.all with a rejection handler, if there are multiple promises.
            if self.modules.len() > 1 {
                self.src.js_init.push_str("Promise.all([");
                for i in 0..self.modules.len() {
                    if i > 0 {
                        self.src.js_init.push_str(", ");
                    }
                    self.src.js_init.push_str(&format!("module{}", i));
                }
                uwriteln!(self.src.js_init, "]).catch(() => {{}});");
            }
        }

        for init in self.component.initializers.iter() {
            self.instantiation_global_initializer(init);
        }

        // Trampolines after initializers so we have static module indices
        for (i, trampoline) in self.translation.trampolines.iter() {
            self.trampoline(i, trampoline);
        }

        if self.gen.opts.instantiation.is_some() {
            let js_init = mem::take(&mut self.src.js_init);
            self.src.js.push_str(&js_init);
        }

        self.exports(&self.component.exports);
    }

    fn ensure_resource_tables(&mut self) {
        let mut ids_to_ensure = BTreeSet::new();
        for (_, ResourceTable { data, .. }) in self.imports_resource_map.iter() {
            let ResourceData::Host { id, .. } = &data else {
                panic!("unexpected guest data")
            };
            ids_to_ensure.insert(id.clone());
        }
        for (_, ResourceTable { data, .. }) in self.exports_resource_map.iter() {
            let ResourceData::Host { id, .. } = &data else {
                panic!("unexpected guest data")
            };
            ids_to_ensure.insert(id.clone());
        }
        for id in ids_to_ensure {
            let rid = id.as_u32();
            if !self.resource_tables_initialized[rid as usize] {
                let resource = self.types[id].ty;
                let (is_imported, dtor) = if let Some(resource_idx) =
                    self.component.defined_resource_index(resource)
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

                    if let Some(dtor) = &resource_def.dtor {
                        (
                            false,
                            format!(
                                "
                                    if (handleEntry.own) {{
                                        {}(handleEntry.rep);
                                    }}",
                                self.core_def(dtor)
                            ),
                        )
                    } else {
                        (false, "".into())
                    }
                } else {
                    (true, "".into())
                };

                uwriteln!(
                    self.src.js,
                    "const handleTable{rid} = new Map();
                    let handleCnt{rid} = 0;",
                );

                if !is_imported {
                    uwriteln!(
                        self.src.js,
                        "const finalizationRegistry{rid} = new FinalizationRegistry(handle => {{
                            const handleEntry = handleTable{rid}.get(handle);
                            if (handleEntry) {{
                                handleTable{rid}.delete(handle);
                                {}
                            }}
                        }});
                        ",
                        dtor
                    );
                }
                self.resource_tables_initialized[rid as usize] = true;
            }
        }
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
                | wasmtime_environ::component::FLAG_MAY_ENTER);
        }
        self.src.js_init.prepend_str(&instance_flag_defs);
    }

    fn destructors(&mut self) {
        for (ty, dtor) in self.resource_dtors.iter() {
            let dtor_name_str = self.core_def(dtor);
            let Some(ResourceTable {
                data: ResourceData::Host { dtor_name, .. },
                ..
            }) = self.exports_resource_map.get_mut(ty)
            else {
                panic!("Expected exports resource map entry for dtor")
            };
            let _ = dtor_name.insert(dtor_name_str);
        }
    }

    fn trampoline(&mut self, i: TrampolineIndex, trampoline: &'a Trampoline) {
        let i = i.as_u32();
        match trampoline {
            // these are hoisted before initialization
            Trampoline::LowerImport { .. } => {}

            // This is only used for a "degenerate component" which internally
            // has a function that always traps. While this should be trivial to
            // implement (generate a JS function that always throws) there's no
            // way to test this at this time so leave this unimplemented.
            Trampoline::AlwaysTrap => unimplemented!(),

            // This is required when strings pass between components within a
            // component and may change encodings. This is left unimplemented
            // for now since it can't be tested and additionally JS doesn't
            // support multi-memory which transcoders rely on anyway.
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
                    Transcode::Utf16ToUtf8 => unimplemented!("utf16 to utf8 transcoder"),
                    Transcode::Utf8ToCompactUtf16 => {
                        unimplemented!("utf8 to compact utf16 transcoder")
                    }
                    Transcode::Utf8ToLatin1 => unimplemented!("utf8 to latin1 transcoder"),
                    Transcode::Utf8ToUtf16 => unimplemented!("utf8 to utf16 transcoder"),
                };
            }

            Trampoline::ResourceNew(resource) => {
                let rid = resource.as_u32();
                uwrite!(
                    self.src.js,
                    "function trampoline{i}(rep) {{
                        const handle = handleCnt{rid}++;
                        handleTable{rid}.set(handle, {{ rep, own: true }});
                        return handle;
                    }}
                "
                );
            }
            Trampoline::ResourceRep(resource) => {
                let rid = resource.as_u32();
                uwrite!(
                    self.src.js,
                    "function trampoline{i}(handle) {{
                        const handleEntry = handleTable{rid}.get(handle);
                        if (!handleEntry) {{
                            throw new Error(`Resource error: Invalid handle ${{handle}}`);
                        }}
                        return handleEntry.rep;
                    }}
                "
                );
            }
            Trampoline::ResourceDrop(resource) => {
                let rid = resource.as_u32();
                let resource = &self.types[*resource];
                let dtor = if let Some(resource_idx) =
                    self.component.defined_resource_index(resource.ty)
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

                    if let Some(dtor) = &resource_def.dtor {
                        format!(
                            "if (handleEntry.own) {{
                                {}(handleEntry.rep);
                            }}
                            ",
                            self.core_def(dtor)
                        )
                    } else {
                        "".into()
                    }
                } else {
                    // if there is a Symbol.dispose handler, call it explicitly for imported
                    // resources when the resource is dropped
                    let symbol_dispose = self.gen.intrinsic(Intrinsic::SymbolDispose);
                    format!(
                        "if (handleEntry.own && handleEntry.rep[{symbol_dispose}]) {{
                            handleEntry.rep[{symbol_dispose}]();
                        }}"
                    )
                };

                uwrite!(
                    self.src.js,
                    "function trampoline{i}(handle) {{
                        const handleEntry = handleTable{rid}.get(handle);
                        if (!handleEntry) {{
                            throw new Error(`Resource error: Invalid handle ${{handle}}`);
                        }}
                        handleTable{rid}.delete(handle);
                        {dtor}
                    }}
                    ",
                );
            }
            Trampoline::ResourceTransferOwn => unimplemented!(),
            Trampoline::ResourceTransferBorrow => unimplemented!(),
            Trampoline::ResourceEnterCall => unimplemented!(),
            Trampoline::ResourceExitCall => unimplemented!(),
        }
    }

    fn instantiation_global_initializer(&mut self, init: &GlobalInitializer) {
        match init {
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
                let def = self.core_export(&m.export);
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
        }
    }

    fn instantiate_static_module(&mut self, idx: StaticModuleIndex, args: &[CoreDef]) {
        // Build a JS "import object" which represents `args`. The `args` is a
        // flat representation which needs to be zip'd with the list of names to
        // correspond to the JS wasm embedding API. This is one of the major
        // differences between Wasmtime's and JS's embedding API.
        let mut import_obj = BTreeMap::new();
        for (module, name, arg) in self.modules[idx].imports(args) {
            let def = self.augmented_import_def(arg);
            let dst = import_obj.entry(module).or_insert(BTreeMap::new());
            let prev = dst.insert(name, def);
            assert!(
                prev.is_none(),
                "unsupported duplicate import of `{module}::{name}`"
            );
            assert!(prev.is_none());
        }
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
        let instantiate = self.gen.intrinsic(Intrinsic::InstantiateCore);
        uwriteln!(self.src.js, "let exports{iu32};");

        match self.gen.opts.instantiation {
            Some(InstantiationMode::Async) | None => {
                uwriteln!(
                    self.src.js_init,
                    "({{ exports: exports{iu32} }} = await {instantiate}(await module{}{imports}));",
                    idx.as_u32()
                )
            }

            Some(InstantiationMode::Sync) => {
                uwriteln!(
                    self.src.js_init,
                    "({{ exports: exports{iu32} }} = {instantiate}(module{}{imports}));",
                    idx.as_u32()
                )
            }
        }
    }

    fn create_resource_fn_map(
        &mut self,
        func: &Function,
        ty_func_idx: TypeFuncIndex,
        is_exports: bool,
    ) {
        let params_ty = &self.types[self.types[ty_func_idx].params];
        for ((_, ty), iface_ty) in func.params.iter().zip(params_ty.types.iter()) {
            if let Type::Id(id) = ty {
                self.connect_resource_types(*id, iface_ty, is_exports);
            }
        }
        let results_ty = &self.types[self.types[ty_func_idx].results];
        for (ty, iface_ty) in func.results.iter_types().zip(results_ty.types.iter()) {
            if let Type::Id(id) = ty {
                self.connect_resource_types(*id, iface_ty, is_exports);
            }
        }
    }

    fn lower_import(&mut self, index: LoweredIndex, import: RuntimeImportIndex) {
        let (options, trampoline, _) = self.lowering_options[index];

        let (import_index, path) = &self.component.imports[import];
        let (import_name, _) = &self.component.import_types[*import_index];
        let world_key = &self.imports[import_name];

        // nested interfaces only currently possible through mapping
        let (import_specifier, maybe_iface_member) = map_import(&self.gen.opts.map, import_name);

        let (func, func_name, iface_name) =
            match &self.resolve.worlds[self.world].imports[world_key] {
                WorldItem::Function(func) => {
                    assert_eq!(path.len(), 0);
                    (func, import_name, None)
                }
                WorldItem::Interface(i) => {
                    assert_eq!(path.len(), 1);
                    let iface = &self.resolve.interfaces[*i];
                    let func = &iface.functions[&path[0]];
                    (
                        func,
                        &path[0],
                        Some(iface.name.as_deref().unwrap_or_else(|| import_name)),
                    )
                }
                WorldItem::Type(_) => unreachable!(),
            };

        let callee_name = match func.kind {
            FunctionKind::Freestanding => {
                let callee_name = self
                    .gen
                    .local_names
                    .get_or_create(
                        &format!("import:{}-{}", import_name, &func.name),
                        &func.name,
                    )
                    .0
                    .to_string();
                callee_name
            }
            FunctionKind::Method(ty) => format!(
                "{}.prototype.{}.call",
                match &self.imports_resource_map[&ty].data {
                    ResourceData::Host { local_name, .. } => {
                        self.gen.esm_bindgen.ensure_import_binding(local_name);
                        local_name
                    }
                    ResourceData::Guest { .. } => unreachable!(),
                },
                func.item_name().to_lower_camel_case()
            ),
            FunctionKind::Static(ty) => format!(
                "{}.{}",
                match &self.imports_resource_map[&ty].data {
                    ResourceData::Host { local_name, .. } => {
                        self.gen.esm_bindgen.ensure_import_binding(local_name);
                        local_name
                    }
                    ResourceData::Guest { .. } => unreachable!(),
                },
                func.item_name().to_lower_camel_case()
            ),
            FunctionKind::Constructor(ty) => format!(
                "new {}",
                match &self.imports_resource_map[&ty].data {
                    ResourceData::Host { local_name, .. } => {
                        self.gen.esm_bindgen.ensure_import_binding(local_name);
                        local_name
                    }
                    ResourceData::Guest { .. } => unreachable!(),
                },
            ),
        };

        let nparams = self
            .resolve
            .wasm_signature(AbiVariant::GuestImport, func)
            .params
            .len();

        uwrite!(self.src.js, "\nfunction trampoline{}", trampoline.as_u32());
        self.bindgen(
            nparams,
            false,
            if import_name.is_empty() {
                None
            } else {
                Some(import_name)
            },
            &callee_name,
            options,
            func,
            AbiVariant::GuestImport,
            false,
        );
        uwriteln!(self.src.js, "");

        let (import_name, binding_name) = match func.kind {
            FunctionKind::Freestanding => (func_name.to_lower_camel_case(), callee_name),
            FunctionKind::Method(tid)
            | FunctionKind::Static(tid)
            | FunctionKind::Constructor(tid) => {
                let ty = &self.resolve.types[tid];
                (
                    ty.name.as_ref().unwrap().to_upper_camel_case(),
                    match &self.imports_resource_map[&tid].data {
                        ResourceData::Host { local_name, .. } => {
                            self.gen.esm_bindgen.ensure_import_binding(local_name);
                            local_name.to_string()
                        }
                        ResourceData::Guest { .. } => unreachable!(),
                    },
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
            false,
        );
    }

    fn ensure_import(
        &mut self,
        import_specifier: String,
        iface_name: Option<&str>,
        iface_member: Option<&str>,
        import_binding: Option<String>,
        local_name: String,
        unused: bool,
    ) {
        // add the function import to the ESM bindgen
        if let Some(_iface_name) = iface_name {
            // mapping can be used to construct virtual nested namespaces
            // which is used eg to support WASI interface groupings
            if let Some(iface_member) = iface_member {
                self.gen.esm_bindgen.add_import_binding(
                    &[
                        import_specifier,
                        iface_member.to_lower_camel_case(),
                        import_binding.unwrap().to_string(),
                    ],
                    local_name,
                    unused,
                );
            } else {
                self.gen.esm_bindgen.add_import_binding(
                    &[import_specifier, import_binding.unwrap().to_string()],
                    local_name,
                    unused,
                );
            }
        } else if let Some(import_binding) = import_binding {
            self.gen.esm_bindgen.add_import_binding(
                &[import_specifier, import_binding],
                local_name,
                unused,
            );
        } else {
            self.gen
                .esm_bindgen
                .add_import_binding(&[import_specifier], local_name, unused);
        }
    }

    fn connect_resources(&mut self, t1: TypeId, t2: TypeResourceTableIndex, is_exports: bool) {
        let imported = self
            .component
            .defined_resource_index(self.types[t2].ty)
            .is_none();

        let resource_id = crate::dealias(self.resolve, t1);

        let resource = self.types[t2].ty;
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
                self.resource_dtors.insert(resource_id, dtor.clone());
            }
        }

        let ty = &self.resolve.types[resource_id];
        let resource = ty.name.as_ref().unwrap();

        let resource_name = resource.to_upper_camel_case();

        // ensure imported resources are imported
        let local_name = if imported {
            let (world_key, iface_name) = match ty.owner {
                wit_parser::TypeOwner::World(world) => (
                    self.resolve.worlds[world]
                        .imports
                        .iter()
                        .find(|&(_, item)| *item == WorldItem::Type(t1))
                        .unwrap()
                        .0
                        .clone(),
                    None,
                ),
                wit_parser::TypeOwner::Interface(iface) => {
                    match &self.resolve.interfaces[iface].name {
                        Some(name) => (WorldKey::Interface(iface), Some(name.as_str())),
                        None => (
                            self.resolve.worlds[self.world]
                                .imports
                                .iter()
                                .find(|&(_, item)| *item == WorldItem::Interface(iface))
                                .unwrap()
                                .0
                                .clone(),
                            None,
                        ),
                    }
                }
                wit_parser::TypeOwner::None => unimplemented!(),
            };

            let import_name = self.resolve.name_world_key(&world_key);
            let (local_name, _) = self.gen.local_names.get_or_create(
                ResourceInstance {
                    resource_id,
                    import: Some(&import_name),
                },
                &resource_name,
            );

            let local_name_str = local_name.to_string();

            // nested interfaces only currently possible through mapping
            let (import_specifier, maybe_iface_member) =
                map_import(&self.gen.opts.map, &import_name);

            self.ensure_import(
                import_specifier,
                iface_name,
                maybe_iface_member.as_deref(),
                Some(resource_name),
                local_name_str.to_string(),
                true,
            );

            local_name_str
        } else {
            let (local_name, _) = self.gen.local_names.get_or_create(
                ResourceInstance {
                    resource_id,
                    import: None,
                },
                &resource_name,
            );

            local_name.to_string()
        };

        let entry = ResourceTable {
            imported,
            data: ResourceData::Host {
                id: t2,
                dtor_name: None,
                local_name,
            },
        };
        if is_exports {
            self.exports_resource_map.insert(resource_id, entry);
        } else {
            self.imports_resource_map.insert(resource_id, entry);
        }
    }

    fn connect_resource_types(&mut self, id: TypeId, iface_ty: &InterfaceType, is_exports: bool) {
        match (&self.resolve.types[id].kind, iface_ty) {
            (TypeDefKind::Flags(_), InterfaceType::Flags(_))
            | (TypeDefKind::Enum(_), InterfaceType::Enum(_)) => {}
            (TypeDefKind::Record(t1), InterfaceType::Record(t2)) => {
                let t2 = &self.types[*t2];
                for (f1, f2) in t1.fields.iter().zip(t2.fields.iter()) {
                    if let Type::Id(id) = f1.ty {
                        self.connect_resource_types(id, &f2.ty, is_exports);
                    }
                }
            }
            (
                TypeDefKind::Handle(Handle::Own(t1) | Handle::Borrow(t1)),
                InterfaceType::Own(t2) | InterfaceType::Borrow(t2),
            ) => {
                self.connect_resources(*t1, *t2, is_exports);
            }
            (TypeDefKind::Tuple(t1), InterfaceType::Tuple(t2)) => {
                let t2 = &self.types[*t2];
                for (f1, f2) in t1.types.iter().zip(t2.types.iter()) {
                    if let Type::Id(id) = f1 {
                        self.connect_resource_types(*id, f2, is_exports);
                    }
                }
            }
            (TypeDefKind::Variant(t1), InterfaceType::Variant(t2)) => {
                let t2 = &self.types[*t2];
                for (f1, f2) in t1.cases.iter().zip(t2.cases.iter()) {
                    if let Some(Type::Id(id)) = &f1.ty {
                        self.connect_resource_types(*id, f2.ty.as_ref().unwrap(), is_exports);
                    }
                }
            }
            (TypeDefKind::Option(t1), InterfaceType::Option(t2)) => {
                let t2 = &self.types[*t2];
                if let Type::Id(id) = t1 {
                    self.connect_resource_types(*id, &t2.ty, is_exports);
                }
            }
            (TypeDefKind::Result(t1), InterfaceType::Result(t2)) => {
                let t2 = &self.types[*t2];
                if let Some(Type::Id(id)) = &t1.ok {
                    self.connect_resource_types(*id, &t2.ok.unwrap(), is_exports);
                }
                if let Some(Type::Id(id)) = &t1.err {
                    self.connect_resource_types(*id, &t2.err.unwrap(), is_exports);
                }
            }
            (TypeDefKind::List(t1), InterfaceType::List(t2)) => {
                let t2 = &self.types[*t2];
                if let Type::Id(id) = t1 {
                    self.connect_resource_types(*id, &t2.element, is_exports);
                }
            }
            (TypeDefKind::Type(ty), _) => {
                if let Type::Id(id) = ty {
                    self.connect_resource_types(*id, iface_ty, is_exports);
                }
            }
            (_, _) => unreachable!(),
        }
    }

    fn bindgen(
        &mut self,
        nparams: usize,
        this_ref: bool,
        module_name: Option<&str>,
        callee: &str,
        opts: &CanonicalOptions,
        func: &Function,
        abi: AbiVariant,
        is_exports: bool,
    ) {
        let memory = opts.memory.map(|idx| format!("memory{}", idx.as_u32()));
        let realloc = opts.realloc.map(|idx| format!("realloc{}", idx.as_u32()));
        let post_return = opts
            .post_return
            .map(|idx| format!("postReturn{}", idx.as_u32()));

        self.src.js("(");
        let mut params = Vec::new();
        let mut first = true;
        for i in 0..nparams {
            if i == 0 && this_ref {
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

        let tracing_prefix = format!(
            "[module=\"{}\", function=\"{}\"]",
            module_name.unwrap_or("<no module>"),
            func.name
        );

        if self.gen.opts.tracing {
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

        if self.gen.opts.tla_compat && matches!(abi, AbiVariant::GuestExport) {
            let throw_uninitialized = self.gen.intrinsic(Intrinsic::ThrowUninitialized);
            uwrite!(
                self.src.js,
                "\
                if (!_initialized) {throw_uninitialized}();
            "
            );
        }

        let mut f = FunctionBindgen {
            resource_map: if is_exports {
                &self.exports_resource_map
            } else {
                &self.imports_resource_map
            },
            cur_resource_borrows: Vec::new(),
            intrinsics: &mut self.gen.all_intrinsics,
            valid_lifting_optimization: self.gen.opts.valid_lifting_optimization,
            sizes: &self.sizes,
            err: if func.results.throws(self.resolve).is_some() {
                match abi {
                    AbiVariant::GuestExport => ErrHandling::ThrowResultErr,
                    AbiVariant::GuestImport => ErrHandling::ResultCatchHandler,
                }
            } else {
                ErrHandling::None
            },
            block_storage: Vec::new(),
            blocks: Vec::new(),
            callee,
            memory: memory.as_ref(),
            realloc: realloc.as_ref(),
            tmp: 0,
            params,
            post_return: post_return.as_ref(),
            tracing_prefix: if self.gen.opts.tracing {
                Some(&tracing_prefix)
            } else {
                None
            },
            encoding: match opts.string_encoding {
                component::StringEncoding::Utf8 => StringEncoding::UTF8,
                component::StringEncoding::Utf16 => StringEncoding::UTF16,
                component::StringEncoding::CompactUtf16 => StringEncoding::CompactUTF16,
            },
            src: source::Source::default(),
            resolve: self.resolve,
        };
        abi::call(
            self.resolve,
            abi,
            match abi {
                AbiVariant::GuestImport => LiftLower::LiftArgsLowerResults,
                AbiVariant::GuestExport => LiftLower::LowerArgsLiftResults,
            },
            func,
            &mut f,
        );
        self.src.js(&f.src);
        self.src.js("}");
    }

    fn augmented_import_def(&self, def: core::AugmentedImport<'_>) -> String {
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
            CoreDef::Export(e) => self.core_export(e),
            CoreDef::Trampoline(i) => format!("trampoline{}", i.as_u32()),
            CoreDef::InstanceFlags(i) => {
                // SAFETY: short-lived borrow-mut.
                self.used_instance_flags.borrow_mut().insert(*i);
                format!("instanceFlags{}", i.as_u32())
            }
        }
    }

    fn core_export<T>(&self, export: &CoreExport<T>) -> String
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

    fn exports(&mut self, exports: &IndexMap<String, Export>) {
        for (export_name, export) in exports.iter() {
            let world_key = &self.exports[export_name];
            let item = &self.resolve.worlds[self.world].exports[world_key];
            match export {
                Export::LiftedFunction {
                    func: def, options, ..
                } => {
                    let func = match item {
                        WorldItem::Function(f) => f,
                        WorldItem::Interface(_) | WorldItem::Type(_) => unreachable!(),
                    };
                    let local_name = if let FunctionKind::Constructor(resource_id)
                    | FunctionKind::Method(resource_id)
                    | FunctionKind::Static(resource_id) = func.kind
                    {
                        self.gen.local_names.get(ResourceInstance {
                            resource_id,
                            import: None,
                        })
                    } else {
                        self.gen.local_names.create_once(export_name)
                    }
                    .to_string();
                    self.export_bindgen(
                        &local_name,
                        def,
                        options,
                        func,
                        export_name,
                        // exported top-level functions only reference imported resources
                        false,
                    );
                    if let FunctionKind::Constructor(ty)
                    | FunctionKind::Method(ty)
                    | FunctionKind::Static(ty) = func.kind
                    {
                        let ty = &self.resolve.types[ty];
                        self.gen.esm_bindgen.add_export_binding(
                            None,
                            local_name,
                            ty.name.as_ref().unwrap().to_upper_camel_case(),
                        );
                    } else {
                        self.gen.esm_bindgen.add_export_binding(
                            None,
                            local_name,
                            export_name.to_lower_camel_case(),
                        );
                    }
                }
                Export::Instance(iface) => {
                    let id = match item {
                        WorldItem::Interface(id) => *id,
                        WorldItem::Function(_) | WorldItem::Type(_) => unreachable!(),
                    };
                    for (func_name, export) in iface {
                        let (def, options, _) = match export {
                            Export::LiftedFunction { func, options, ty } => (func, options, ty),
                            Export::Type(_) => continue, // ignored
                            _ => unreachable!(),
                        };

                        let func = &self.resolve.interfaces[id].functions[func_name];

                        let local_name = if let FunctionKind::Constructor(resource_id)
                        | FunctionKind::Method(resource_id)
                        | FunctionKind::Static(resource_id) = func.kind
                        {
                            self.gen.local_names.get(ResourceInstance {
                                resource_id,
                                import: None,
                            })
                        } else {
                            self.gen.local_names.create_once(func_name)
                        }
                        .to_string();

                        self.export_bindgen(&local_name, def, options, func, export_name, true);

                        if let FunctionKind::Constructor(ty)
                        | FunctionKind::Method(ty)
                        | FunctionKind::Static(ty) = func.kind
                        {
                            let ty = &self.resolve.types[ty];
                            let resource = ty.name.as_ref().unwrap();
                            self.gen.esm_bindgen.add_export_binding(
                                Some(export_name),
                                local_name,
                                resource.to_upper_camel_case(),
                            );
                        } else {
                            self.gen.esm_bindgen.add_export_binding(
                                Some(export_name),
                                local_name,
                                func_name.to_lower_camel_case(),
                            );
                        }
                    }
                }

                // ignore type exports for now
                Export::Type(_) => {}

                // This can't be tested at this time so leave it unimplemented
                Export::ModuleStatic(_) => unimplemented!(),
                Export::ModuleImport(_) => unimplemented!(),
            }
        }
        self.gen.esm_bindgen.populate_export_aliases();
    }

    fn export_bindgen(
        &mut self,
        local_name: &str,
        def: &CoreDef,
        options: &CanonicalOptions,
        func: &Function,
        export_name: &String,
        exports_resource_map: bool,
    ) {
        match func.kind {
            FunctionKind::Freestanding => uwrite!(self.src.js, "\nfunction {local_name}"),
            FunctionKind::Method(_) => {
                if !self.defined_resource_classes.contains(local_name) {
                    uwriteln!(self.src.js, "\nclass {local_name} {{}}");
                    self.defined_resource_classes.insert(local_name.to_string());
                }
                let method_name = func.item_name().to_lower_camel_case();
                uwrite!(
                    self.src.js,
                    "\n{local_name}.prototype.{method_name} = function {method_name}",
                );
            }
            FunctionKind::Static(_) => {
                if !self.defined_resource_classes.contains(local_name) {
                    uwriteln!(self.src.js, "\nclass {local_name} {{}}");
                    self.defined_resource_classes.insert(local_name.to_string());
                }
                let method_name = func.item_name().to_lower_camel_case();
                uwrite!(
                    self.src.js,
                    "\n{local_name}.{method_name} = function {method_name}",
                );
            }
            FunctionKind::Constructor(ty) => {
                if self.defined_resource_classes.contains(local_name) {
                    panic!("Internal error: Resource constructor must be defined before other methods and statics");
                }
                let ty = &self.resolve.types[ty];
                let name = ty.name.as_ref().unwrap();
                if name.to_upper_camel_case() == local_name {
                    uwrite!(
                        self.src.js,
                        "
                        class {local_name} {{
                            constructor"
                    );
                } else {
                    uwrite!(
                        self.src.js,
                        "
                        const {local_name} = class {} {{
                            constructor",
                        name.to_upper_camel_case()
                    );
                }
                self.defined_resource_classes.insert(local_name.to_string());
            }
        }
        let callee = self.core_def(def);
        self.bindgen(
            func.params.len(),
            matches!(func.kind, FunctionKind::Method(_)),
            if export_name.is_empty() {
                None
            } else {
                Some(export_name)
            },
            &callee,
            options,
            func,
            AbiVariant::GuestExport,
            exports_resource_map,
        );
        match func.kind {
            FunctionKind::Freestanding => self.src.js("\n"),
            FunctionKind::Method(_) | FunctionKind::Static(_) => self.src.js(";\n"),
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
            return if let Some(hash_idx) = mapping.find('#') {
                (
                    mapping[0..hash_idx].to_string(),
                    Some(mapping[hash_idx + 1..].into()),
                )
            } else {
                (mapping.into(), None)
            };
        }
        if let Some(mapping) = map.get(impt_sans_version) {
            return if let Some(hash_idx) = mapping.find('#') {
                (
                    mapping[0..hash_idx].to_string(),
                    Some(mapping[hash_idx + 1..].into()),
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
                    return if let Some(hash_idx) = mapping.find('#') {
                        (
                            mapping[0..hash_idx].to_string(),
                            Some(mapping[hash_idx + 1..].into()),
                        )
                    } else {
                        (mapping, None)
                    };
                }
                if impt.starts_with(lhs) && impt.ends_with(rhs) {
                    let matched =
                        &impt[wildcard_idx..wildcard_idx + impt.len() - lhs.len() - rhs.len()];
                    let mapping = mapping.replace('*', matched);
                    return if let Some(hash_idx) = mapping.find('#') {
                        (
                            mapping[0..hash_idx].to_string(),
                            Some(mapping[hash_idx + 1..].into()),
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
    let registry_idx = match name.find(':') {
        Some(idx) => idx,
        None => return None,
    };
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
    format!("{}.core{i_str}.wasm", name)
}
