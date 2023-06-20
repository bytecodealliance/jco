use crate::files::Files;
use crate::function_bindgen::{ErrHandling, FunctionBindgen};
use crate::identifier::{is_js_identifier, maybe_quote_id, maybe_quote_member};
use crate::intrinsics::{render_intrinsics, Intrinsic};
use crate::source;
use crate::{uwrite, uwriteln};
use base64::{engine::general_purpose, Engine as _};
use heck::*;
use indexmap::IndexMap;
use std::collections::btree_map::Entry;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fmt::Write;
use std::mem;
use wasmtime_environ::component::{
    CanonicalOptions, Component, CoreDef, CoreExport, Export, ExportItem, GlobalInitializer,
    InstantiateModule, LowerImport, RuntimeInstanceIndex, StaticModuleIndex, Transcoder,
};
use wasmtime_environ::{EntityIndex, ModuleTranslation, PrimaryMap};
use wit_parser::abi::{AbiVariant, LiftLower};
use wit_parser::*;

#[derive(Default, Clone)]
pub struct TranspileOpts {
    pub name: String,
    /// Disables generation of `*.d.ts` files and instead only generates `*.js`
    /// source files.
    pub no_typescript: bool,
    /// Provide a custom JS instantiation API for the component instead
    /// of the direct importable native ESM output.
    pub instantiation: bool,
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
}

pub enum Binding {
    Interface(BTreeMap<String, Binding>),
    Function(String),
}

#[derive(Default)]
struct LocalNames {
    // map from exact name to generated local name
    local_names: HashMap<String, String>,
}

impl<'a> LocalNames {
    fn get_or_create(&'a mut self, unique_id: &str, goal_name: &str) -> &'a str {
        if !self.local_names.contains_key(unique_id) {
            let goal_name = if let Some(last_char) = goal_name.rfind('/') {
                &goal_name[last_char + 1..]
            } else {
                &goal_name
            };
            let mut goal = if is_js_identifier(goal_name) {
                goal_name.to_string()
            } else {
                goal_name.to_lower_camel_case().replace(':', "$")
            };
            if self.local_names.values().any(|v| v == &goal) {
                let mut idx = 1;
                loop {
                    let valid_name_suffixed = format!("{goal}${}", idx.to_string());
                    if !self.local_names.values().any(|v| v == &valid_name_suffixed) {
                        goal = valid_name_suffixed;
                        break;
                    }
                    idx += 1;
                }
            }
            self.local_names
                .insert(unique_id.to_string(), goal.to_string());
        }
        self.local_names.get(unique_id).unwrap()
    }
}

struct JsBindgen<'a> {
    local_names: LocalNames,

    /// The source code for the "main" file that's going to be created for the
    /// component we're generating bindings for. This is incrementally added to
    /// over time and primarily contains the main `instantiate` function as well
    /// as a type-description of the input/output interfaces.
    src: Source,

    /// JS output imports map from imported specifier, to a list of bindings
    imports: BTreeMap<String, Binding>,

    /// Core module count
    core_module_cnt: usize,

    /// Various options for code generation.
    opts: &'a TranspileOpts,

    /// List of all intrinsics emitted to `src` so far.
    all_intrinsics: BTreeSet<Intrinsic>,
}

pub fn transpile_bindgen(
    name: &str,
    component: &Component,
    modules: &PrimaryMap<StaticModuleIndex, ModuleTranslation<'_>>,
    resolve: &Resolve,
    id: WorldId,
    opts: TranspileOpts,
    files: &mut Files,
) -> (Vec<String>, Vec<(String, Export)>) {
    let mut bindgen = JsBindgen {
        local_names: LocalNames::default(),
        src: Source::default(),
        imports: BTreeMap::new(),
        core_module_cnt: 0,
        opts: &opts,
        all_intrinsics: BTreeSet::new(),
    };
    bindgen.core_module_cnt = modules.len();

    // bindings is the actual `instantiate` method itself, created by this
    // structure.

    // populate reverse map from import names to world items
    let mut imports = BTreeMap::new();
    let mut exports = BTreeMap::new();
    for (key, _) in &resolve.worlds[id].imports {
        let name = match key {
            WorldKey::Name(name) => name.to_string(),
            WorldKey::Interface(iface) => match resolve.id_of(*iface) {
                Some(name) => name.to_string(),
                None => continue,
            },
        };
        imports.insert(name, key.clone());
    }
    for (key, _) in &resolve.worlds[id].exports {
        let name = match key {
            WorldKey::Name(name) => name.to_string(),
            WorldKey::Interface(iface) => match resolve.id_of(*iface) {
                Some(name) => name.to_string(),
                None => continue,
            },
        };
        exports.insert(name, key.clone());
    }

    let mut instantiator = Instantiator {
        src: Source::default(),
        sizes: SizeAlign::default(),
        gen: &mut bindgen,
        modules,
        instances: Default::default(),
        resolve,
        world: id,
        component,
        imports,
        exports,
    };
    instantiator.sizes.fill(resolve);
    let exports = instantiator.instantiate();
    let imports = instantiator
        .imports
        .keys()
        .map(|key| map_import(&instantiator.gen.opts.map, key).0)
        .collect();
    instantiator.gen.src.js(&instantiator.src.js);
    instantiator.gen.src.js_init(&instantiator.src.js_init);

    bindgen.finish_component(name, files);

    (imports, exports)
}

impl<'a> JsBindgen<'a> {
    fn finish_component(&mut self, name: &str, files: &mut Files) {
        let mut output = source::Source::default();
        let mut compilation_promises = source::Source::default();

        // Setup the compilation data and compilation promises
        let mut removed = BTreeSet::new();
        for i in 0..self.core_module_cnt {
            let local_name = format!("module{}", i);
            let mut name_idx = core_file_name(name, i as u32);
            if self.opts.instantiation {
                uwriteln!(
                    compilation_promises,
                    "const {local_name} = compileCore('{name_idx}');"
                );
            } else {
                if files.get_size(&name_idx).unwrap() < self.opts.base64_cutoff {
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
        }

        let js_intrinsics = render_intrinsics(
            &mut self.all_intrinsics,
            self.opts.no_nodejs_compat,
            self.opts.instantiation,
        );

        let mut iface_imports = Vec::new();

        if self.opts.instantiation {
            uwrite!(
                output,
                "\
                    {}
                    export async function instantiate(compileCore, imports, instantiateCore = WebAssembly.instantiate) {{
                        {}
                ",
                &js_intrinsics as &str,
                &compilation_promises as &str,
            );
        }

        for (specifier, binding) in &self.imports {
            if self.opts.instantiation {
                uwrite!(output, "const ");
            } else {
                uwrite!(output, "import ");
            }
            match binding {
                Binding::Interface(bindings) => {
                    if !self.opts.instantiation && bindings.len() == 1 {
                        let (import_name, import) = bindings.iter().next().unwrap();
                        if import_name == "default" {
                            let local_name = match import {
                                Binding::Interface(iface) => {
                                    let iface_local_name =
                                        self.local_names.get_or_create(specifier, specifier);
                                    iface_imports.push((iface_local_name.to_string(), iface));
                                    iface_local_name
                                }
                                Binding::Function(local_name) => local_name,
                            };
                            uwriteln!(output, "{local_name} from '{specifier}';");
                            continue;
                        }
                    }
                    uwrite!(output, "{{");
                    let mut first = true;
                    for (external_name, import) in bindings {
                        if first {
                            output.push_str(" ");
                            first = false;
                        } else {
                            output.push_str(", ");
                        }
                        let local_name = match import {
                            Binding::Interface(iface) => {
                                let iface_local_name = self.local_names.get_or_create(
                                    &format!("{specifier}#{external_name}"),
                                    external_name,
                                );
                                iface_imports.push((iface_local_name.to_string(), iface));
                                iface_local_name
                            }
                            Binding::Function(local_name) => local_name,
                        };
                        if external_name == local_name {
                            uwrite!(output, "{external_name}");
                        } else {
                            if self.opts.instantiation {
                                uwrite!(output, "{external_name}: {local_name}");
                            } else {
                                uwrite!(output, "{external_name} as {local_name}");
                            }
                        }
                    }
                    if !first {
                        output.push_str(" ");
                    }
                    if self.opts.instantiation {
                        uwriteln!(output, "}} = imports{};", maybe_quote_member(specifier));
                    } else {
                        uwriteln!(output, "}} from '{specifier}';");
                    }
                }
                Binding::Function(local_name) => {
                    uwriteln!(output, "import {local_name} from '{specifier}';");
                }
            }
        }

        // render interface import member getters
        for (iface_local_name, iface_imports) in iface_imports {
            uwrite!(output, "const {{");
            let mut first = true;
            for (member_name, binding) in iface_imports {
                let Binding::Function(local_name) = binding else {
                    continue;
                };
                if first {
                    output.push_str(" ");
                    first = false;
                } else {
                    output.push_str(",\n");
                }
                if member_name == local_name {
                    output.push_str(local_name);
                } else {
                    uwrite!(output, "{member_name}: {local_name}");
                }
            }
            if !first {
                output.push_str(" ");
            }
            uwriteln!(output, "}} = {iface_local_name};");
        }

        if self.opts.instantiation {
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
        return intrinsic.name().to_string();
    }
}

/// Helper structure used to generate the `instantiate` method of a component.
///
/// This is the main structure for parsing the output of Wasmtime.
struct Instantiator<'a, 'b> {
    src: Source,
    gen: &'a mut JsBindgen<'b>,
    modules: &'a PrimaryMap<StaticModuleIndex, ModuleTranslation<'a>>,
    instances: PrimaryMap<RuntimeInstanceIndex, StaticModuleIndex>,
    resolve: &'a Resolve,
    world: WorldId,
    sizes: SizeAlign,
    component: &'a Component,
    exports: BTreeMap<String, WorldKey>,
    imports: BTreeMap<String, WorldKey>,
}

impl Instantiator<'_, '_> {
    fn instantiate(&mut self) -> Vec<(String, Export)> {
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

        for init in self.component.initializers.iter() {
            self.instantiation_global_initializer(init);
        }

        if self.gen.opts.instantiation {
            let js_init = mem::take(&mut self.src.js_init);
            self.src.js.push_str(&js_init);
        }

        let exports = self.exports(&self.component.exports);

        exports
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
            GlobalInitializer::LowerImport(i) => {
                self.lower_import(i);
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

            // This is only used for a "degenerate component" which internally
            // has a function that always traps. While this should be trivial to
            // implement (generate a JS function that always throws) there's no
            // way to test this at this time so leave this unimplemented.
            GlobalInitializer::AlwaysTrap(_) => unimplemented!(),

            // This is only used when the component exports core wasm modules,
            // but that's not possible to test right now so leave these as
            // unimplemented.
            GlobalInitializer::SaveStaticModule(_) => unimplemented!(),
            GlobalInitializer::SaveModuleImport(_) => unimplemented!(),

            // This is required when strings pass between components within a
            // component and may change encodings. This is left unimplemented
            // for now since it can't be tested and additionally JS doesn't
            // support multi-memory which transcoders rely on anyway.
            GlobalInitializer::Transcoder(Transcoder {
                index: _,
                op: _,
                from: _,
                from64: _,
                to: _,
                to64: _,
                signature: _,
            }) => unimplemented!(),
        }
    }

    fn instantiate_static_module(&mut self, idx: StaticModuleIndex, args: &[CoreDef]) {
        let module = &self.modules[idx].module;

        // Build a JS "import object" which represents `args`. The `args` is a
        // flat representation which needs to be zip'd with the list of names to
        // correspond to the JS wasm embedding API. This is one of the major
        // differences between Wasmtime's and JS's embedding API.
        let mut import_obj = BTreeMap::new();
        assert_eq!(module.imports().len(), args.len());
        for ((module, name, _), arg) in module.imports().zip(args) {
            let def = self.core_def(arg);
            let dst = import_obj.entry(module).or_insert(BTreeMap::new());
            let prev = dst.insert(name, def);
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
            imports.push_str("}");
        }

        let i = self.instances.push(idx);
        let iu32 = i.as_u32();
        let instantiate = self.gen.intrinsic(Intrinsic::InstantiateCore);
        uwriteln!(self.src.js, "let exports{iu32};");
        uwriteln!(
            self.src.js_init,
            "({{ exports: exports{iu32} }} = await {instantiate}(await module{}{imports}));",
            idx.as_u32()
        );
    }

    fn lower_import(&mut self, import: &LowerImport) {
        let (import_index, path) = &self.component.imports[import.import];
        let (import_name, _) = &self.component.import_types[*import_index];
        let world_key = &self.imports[import_name];

        // nested interfaces only currently possible through mapping
        let (import_specifier, mut maybe_iface_member) =
            map_import(&self.gen.opts.map, &import_name);

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
                        Some(iface.name.as_ref().unwrap_or_else(|| import_name)),
                    )
                }
                WorldItem::Type(_) => unreachable!(),
            };

        let callee_name = self
            .gen
            .local_names
            .get_or_create(&format!("import:{func_name}"), func_name)
            .to_string();

        if let Some(_iface_name) = iface_name {
            // iface_name unused, could be used for generation

            let iface = match self.gen.imports.entry(import_specifier.to_string()) {
                Entry::Vacant(entry) => entry.insert(Binding::Interface(BTreeMap::new())),
                Entry::Occupied(_) => self.gen.imports.get_mut(&import_specifier).unwrap(),
            };
            let Binding::Interface(ref mut iface_map) = iface else {
                panic!("Import {} cannot be both a function and interface", import_specifier)
            };

            // mapping can be used to construct virtual nested namespaces
            // which is used eg to support WASI interface groupings
            if let Some(iface_member) = maybe_iface_member.take() {
                let (import_name, member_name, local_binding) = (
                    iface_member.to_string(),
                    func_name.to_lower_camel_case(),
                    callee_name.to_string(),
                );

                match iface_map.entry(import_name) {
                    Entry::Vacant(entry) => {
                        entry.insert(Binding::Interface(BTreeMap::from([(
                            member_name,
                            Binding::Function(local_binding),
                        )])));
                    }
                    Entry::Occupied(mut entry) => {
                        let entry = entry.get_mut();
                        match entry {
                            Binding::Interface(iface) => {
                                iface.insert(member_name, Binding::Function(local_binding))
                            }
                            Binding::Function(_) => {
                                panic!("Import is both a function and an interface")
                            }
                        };
                    }
                };
            } else {
                match iface_map.entry(func_name.to_lower_camel_case()) {
                    Entry::Vacant(entry) => {
                        entry.insert(Binding::Function(callee_name.to_string()));
                    }
                    Entry::Occupied(_) => {
                        panic!("Duplicate binding entry for {}", callee_name.to_string());
                    }
                };
            }
        } else {
            self.gen.imports.insert(
                import_specifier.to_string(),
                Binding::Function(callee_name.to_string()),
            );
        }

        let index = import.index.as_u32();
        uwrite!(self.src.js, "\nfunction lowering{index}");
        let nparams = self
            .resolve
            .wasm_signature(AbiVariant::GuestImport, func)
            .params
            .len();
        self.bindgen(
            nparams,
            &callee_name,
            &import.options,
            func,
            AbiVariant::GuestImport,
        );
        uwriteln!(self.src.js, "");
    }

    fn bindgen(
        &mut self,
        nparams: usize,
        callee: &str,
        opts: &CanonicalOptions,
        func: &Function,
        abi: AbiVariant,
    ) {
        let memory = match opts.memory {
            Some(idx) => Some(format!("memory{}", idx.as_u32())),
            None => None,
        };
        let realloc = match opts.realloc {
            Some(idx) => Some(format!("realloc{}", idx.as_u32())),
            None => None,
        };
        let post_return = match opts.post_return {
            Some(idx) => Some(format!("postReturn{}", idx.as_u32())),
            None => None,
        };

        self.src.js("(");
        let mut params = Vec::new();
        for i in 0..nparams {
            if i > 0 {
                self.src.js(", ");
            }
            let param = format!("arg{i}");
            self.src.js(&param);
            params.push(param);
        }
        uwriteln!(self.src.js, ") {{");

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
            encoding: opts.string_encoding,
            src: source::Source::default(),
        };
        self.resolve.call(
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

    fn core_def(&self, def: &CoreDef) -> String {
        match def {
            CoreDef::Export(e) => self.core_export(e),
            CoreDef::Lowered(i) => format!("lowering{}", i.as_u32()),
            CoreDef::AlwaysTrap(_) => unimplemented!(),
            CoreDef::InstanceFlags(_) => unimplemented!(),
            CoreDef::Transcoder(_) => unimplemented!(),
        }
    }

    fn core_export<T>(&self, export: &CoreExport<T>) -> String
    where
        T: Into<EntityIndex> + Copy,
    {
        let name = match &export.item {
            ExportItem::Index(idx) => {
                let module = &self.modules[self.instances[export.instance]].module;
                let idx = (*idx).into();
                module
                    .exports
                    .iter()
                    .filter_map(|(name, i)| if *i == idx { Some(name) } else { None })
                    .next()
                    .unwrap()
            }
            ExportItem::Name(s) => s,
        };
        let i = export.instance.as_u32() as usize;
        format!("exports{i}{}", maybe_quote_member(name))
    }

    fn exports(&mut self, exports: &IndexMap<String, Export>) -> Vec<(String, Export)> {
        if exports.is_empty() {
            if self.gen.opts.instantiation {
                self.src.js("return {}");
            }
            return Vec::new();
        }

        let mut canon_exports = BTreeMap::new();
        let mut camel_aliases = BTreeMap::new();
        for (export_name, export) in exports.iter() {
            let world_key = &self.exports[export_name];
            let item = &self.resolve.worlds[self.world].exports[world_key];
            let (canon_name, maybe_camel_alias, local_name) =
                if let Some((_, _, export)) = parse_world_key(export_name) {
                    let local_name = ns_to_local_name(export_name);
                    let local_name = self
                        .gen
                        .local_names
                        .get_or_create(&format!("export:{export_name}"), &local_name);
                    (
                        export_name.to_string(),
                        Some(export.to_lower_camel_case()),
                        local_name.to_string(),
                    )
                } else {
                    let export_name_camel = export_name.to_lower_camel_case();
                    let local_name = self
                        .gen
                        .local_names
                        .get_or_create(&format!("export:{export_name}"), &export_name_camel);
                    (export_name_camel, None, local_name.to_string())
                };
            match export {
                Export::LiftedFunction {
                    ty: _,
                    func,
                    options,
                } => {
                    self.export_bindgen(
                        &local_name,
                        false,
                        func,
                        options,
                        match item {
                            WorldItem::Function(f) => f,
                            WorldItem::Interface(_) | WorldItem::Type(_) => unreachable!(),
                        },
                    );
                }
                Export::Instance(iface) => {
                    let id = match item {
                        WorldItem::Interface(id) => *id,
                        WorldItem::Function(_) | WorldItem::Type(_) => unreachable!(),
                    };
                    uwriteln!(self.src.js, "const {local_name} = {{");
                    for (func_name, export) in iface {
                        let (func, options) = match export {
                            Export::LiftedFunction { func, options, .. } => (func, options),
                            Export::Type(_) => continue, // ignored
                            _ => unreachable!(),
                        };
                        self.export_bindgen(
                            &func_name.to_lower_camel_case(),
                            true,
                            func,
                            options,
                            &self.resolve.interfaces[id].functions[func_name],
                        );
                    }
                    uwriteln!(self.src.js, "\n}};");
                }

                // ignore type exports for now
                Export::Type(_) => {}

                // This can't be tested at this time so leave it unimplemented
                Export::Module(_) => unimplemented!(),
            }
            if let Some(camel_alias) = maybe_camel_alias {
                camel_aliases.insert(camel_alias, canon_name.to_string());
            }
            canon_exports.insert(canon_name, (local_name, export));
        }
        // only promote aliases which aren't collisions against existing exports
        for (alias, name) in &camel_aliases {
            if !canon_exports.contains_key(alias) {
                canon_exports.insert(alias.to_string(), canon_exports.get(name).unwrap().clone());
            }
        }
        uwrite!(
            self.src.js,
            "\n{} {{ ",
            if self.gen.opts.instantiation {
                "return"
            } else {
                "export"
            }
        );
        uwrite!(
            self.src.js,
            "{} }}",
            canon_exports
                .iter()
                .map(|(name, (local_name, _))| {
                    let export_name_maybe_quoted = maybe_quote_id(name);
                    if local_name == &export_name_maybe_quoted {
                        local_name.to_string()
                    } else if self.gen.opts.instantiation {
                        format!("{}: {local_name}", export_name_maybe_quoted)
                    } else {
                        format!("{local_name} as {}", export_name_maybe_quoted)
                    }
                })
                .collect::<Vec<String>>()
                .join(", ")
        );
        canon_exports
            .iter()
            .map(|(name, &(_, import))| (name.clone(), import.clone()))
            .collect()
    }

    fn export_bindgen(
        &mut self,
        name: &str,
        on_interface: bool,
        def: &CoreDef,
        options: &CanonicalOptions,
        func: &Function,
    ) {
        if on_interface {
            self.src.js.push_str(&name);
        } else {
            uwrite!(self.src.js, "\nfunction {name}");
        }
        let callee = self.core_def(def);
        self.bindgen(
            func.params.len(),
            &callee,
            options,
            func,
            AbiVariant::GuestExport,
        );
        if on_interface {
            self.src.js(",\n");
        } else {
            self.src.js("\n");
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

fn ns_to_local_name(ns_name: &str) -> String {
    ns_name.to_lower_camel_case().replace(':', "$")
}

fn map_import(map: &Option<HashMap<String, String>>, impt: &str) -> (String, Option<String>) {
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
        for (key, mapping) in map {
            if let Some(wildcard_idx) = key.find('*') {
                let lhs = &key[0..wildcard_idx];
                let rhs = &key[wildcard_idx + 1..];
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
                        (mapping.into(), None)
                    };
                }
            }
        }
    }
    (impt.to_string(), None)
}

pub fn parse_world_key<'a>(name: &'a str) -> Option<(&'a str, &'a str, &'a str)> {
    let registry_idx = match name.find(':') {
        Some(idx) => idx,
        None => return None,
    };
    let ns = &name[0..registry_idx];
    match name.rfind('/') {
        Some(sep_idx) => Some((ns, &name[registry_idx + 1..sep_idx], &name[sep_idx + 1..])),
        // interface is a namespace, function is a default export
        None => Some((ns, &name[registry_idx + 1..], "".as_ref())),
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
