use crate::files::Files;
use crate::function_bindgen::{ErrHandling, FunctionBindgen};
use crate::identifier::{maybe_quote_id, maybe_quote_member};
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

struct JsBindgen<'a> {
    /// The source code for the "main" file that's going to be created for the
    /// component we're generating bindings for. This is incrementally added to
    /// over time and primarily contains the main `instantiate` function as well
    /// as a type-description of the input/output interfaces.
    src: Source,

    /// JS output imports map from imported specifier, to a list of bindings
    imports: BTreeMap<String, BTreeMap<String, String>>,

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
        .map(|key| match parse_world_key(key) {
            Some((ns, package_name, _)) => {
                map_import(&opts.map, &key[0..ns.len() + package_name.len() + 1]).unwrap_or_else(
                    || key[ns.len() + 1..ns.len() + package_name.len() + 1].to_string(),
                )
            }
            None => map_import(&opts.map, key).unwrap_or_else(|| key.to_string()),
        })
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

        if self.opts.instantiation {
            uwrite!(
                output,
                "\
                    {}
                    export async function instantiate(compileCore, imports, instantiateCore = WebAssembly.instantiate) {{
                        {}
                        {}\
                        {};
                    }}
                ",
                &js_intrinsics as &str,
                &compilation_promises as &str,
                &self.src.js_init as &str,
                &self.src.js as &str,
            );
        } else {
            // Import statements render first in JS instance mode
            for (specifier, bindings) in &self.imports {
                uwrite!(output, "import {{");
                let mut first = true;
                for (external, local) in bindings {
                    if first {
                        output.push_str(" ");
                    } else {
                        output.push_str(", ");
                    }
                    uwrite!(output, "{} as {}", external, local);
                    first = false;
                }
                if !first {
                    output.push_str(" ");
                }
                uwrite!(output, "}} from '{}';\n", specifier);
            }

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
        // Determine the `Interface` that this import corresponds to. At this
        // time `wit-component` only supports root-level imports of instances
        // where instances export functions.
        let (import_index, path) = &self.component.imports[import.import];
        let (import_name, _) = &self.component.import_types[*import_index];

        let world_item = &self.imports[import_name];

        let (func, import_specifier, interface_name) = match parse_world_key(import_name) {
            Some((ns, package_name, export)) => {
                // namespaces must either be explicitly mapped to URLs
                // or, if no map entry is provided by the user, a rewrite into "kebab name" is
                // automatically performed with the default convention of using the package name as the import
                // and the package name and interface name as the export kebab name itself
                // if there is no other export using the interface name, the interface name is exported directly as
                // an additional alias
                let mapped_import_name = map_import(
                    &self.gen.opts.map,
                    &import_name[0..ns.len() + package_name.len() + 1],
                );
                match &self.resolve.worlds[self.world].imports[world_item] {
                    WorldItem::Function(f) => {
                        assert_eq!(path.len(), 0);
                        (
                            f,
                            mapped_import_name.unwrap_or_else(|| package_name.to_string()),
                            "".to_string(),
                        )
                    }
                    WorldItem::Interface(i) => {
                        assert_eq!(path.len(), 1);
                        let func = &self.resolve.interfaces[*i].functions[&path[0]];
                        (
                            func,
                            mapped_import_name.unwrap_or_else(|| package_name.to_string()),
                            format!("{package_name}-{export}"),
                        )
                    }
                    WorldItem::Type(_) => unreachable!(),
                }
            }
            None => {
                let mapped_import_name = map_import(&self.gen.opts.map, import_name);
                match &self.resolve.worlds[self.world].imports[world_item] {
                    WorldItem::Function(f) => {
                        assert_eq!(path.len(), 0);
                        (
                            f,
                            mapped_import_name.unwrap_or_else(|| import_name.to_string()),
                            "default".to_string(),
                        )
                    }
                    WorldItem::Interface(i) => {
                        assert_eq!(path.len(), 1);
                        let func = &self.resolve.interfaces[*i].functions[&path[0]];
                        (
                            func,
                            mapped_import_name.unwrap_or_else(|| import_name.to_string()),
                            "*".to_string(),
                        )
                    }
                    WorldItem::Type(_) => unreachable!(),
                }
            }
        };

        let func_or_interface_id = (if interface_name == "*" {
            &func.name
        } else {
            interface_name.as_str()
        })
        .to_lower_camel_case();

        let index = import.index.as_u32();
        let callee = format!("lowering{index}Callee");

        let imports_map = self
            .gen
            .imports
            .entry(import_specifier.to_string())
            .or_insert(BTreeMap::new());

        let local_name = if interface_name == "*" {
            callee.to_string()
        } else {
            format!("interface{index}")
        };

        let entry = imports_map.entry(func_or_interface_id.to_string());
        let vacant_interface = matches!(entry, Entry::Vacant(_));
        let local_name = entry.or_insert(local_name);

        // instance imports are otherwise hoisted
        if self.gen.opts.instantiation {
            if vacant_interface {
                uwriteln!(
                    self.src.js,
                    "const {local_name} = imports{}{};",
                    maybe_quote_member(&import_specifier),
                    maybe_quote_member(&func_or_interface_id),
                );
            }
        }

        // in the interface case we must lower the interface function
        if interface_name != "*" {
            let fn_id = func.name.to_lower_camel_case();
            uwrite!(
                self.src.js,
                "const lowering{index}Callee = {local_name}{};",
                maybe_quote_member(&fn_id)
            );
        }

        uwrite!(self.src.js, "\nfunction lowering{index}");
        let nparams = self
            .resolve
            .wasm_signature(AbiVariant::GuestImport, func)
            .params
            .len();
        self.bindgen(
            nparams,
            &callee,
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

        let mut camel_exports = BTreeMap::new();
        let mut camel_aliases = BTreeMap::new();
        for (export_name, export) in exports.iter() {
            let world_key = &self.exports[export_name];
            let item = &self.resolve.worlds[self.world].exports[world_key];
            let (camel_name, maybe_camel_alias) =
                if let Some((_, package_name, export)) = parse_world_key(export_name) {
                    (
                        format!("{package_name}-{export}").to_lower_camel_case(),
                        Some(export.to_lower_camel_case()),
                    )
                } else {
                    (export_name.to_lower_camel_case(), None)
                };
            match export {
                Export::LiftedFunction {
                    ty: _,
                    func,
                    options,
                } => {
                    self.export_bindgen(
                        export_name,
                        None,
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
                    uwriteln!(self.src.js, "const {camel_name} = {{");
                    for (func_name, export) in iface {
                        let (func, options) = match export {
                            Export::LiftedFunction { func, options, .. } => (func, options),
                            Export::Type(_) => continue, // ignored
                            _ => unreachable!(),
                        };
                        self.export_bindgen(
                            func_name,
                            Some(export_name),
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
                camel_aliases.insert(camel_alias, camel_name.to_string());
            }
            camel_exports.insert(camel_name, export);
        }
        // only promote aliases which aren't collisions against existing exports
        for (alias, name) in &camel_aliases {
            if !camel_exports.contains_key(alias) {
                camel_exports.insert(alias.to_string(), camel_exports.get(name).unwrap().clone());
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
        uwriteln!(
            self.src.js,
            "{} }}",
            camel_exports
                .iter()
                .map(|(name, _)| {
                    let name = name.to_string();
                    if let Some(original_name) = camel_aliases.get(&name) {
                        if self.gen.opts.instantiation {
                            format!("{name}: {original_name}")
                        } else {
                            format!("{original_name} as {name}")
                        }
                    } else {
                        name
                    }
                })
                .collect::<Vec<String>>()
                .join(", ")
        );
        camel_exports
            .iter()
            .map(|(name, &import)| (name.clone(), import.clone()))
            .collect()
    }

    fn export_bindgen(
        &mut self,
        name: &str,
        instance_name: Option<&str>,
        def: &CoreDef,
        options: &CanonicalOptions,
        func: &Function,
    ) {
        let name = name.to_lower_camel_case();
        if instance_name.is_some() {
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
        if instance_name.is_some() {
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

fn map_import(map: &Option<HashMap<String, String>>, impt: &str) -> Option<String> {
    if let Some(map) = map.as_ref() {
        for (key, mapping) in map {
            if key == impt {
                return Some(mapping.into());
            }
            if let Some(wildcard_idx) = key.find('*') {
                let lhs = &key[0..wildcard_idx];
                let rhs = &key[wildcard_idx + 1..];
                if impt.starts_with(lhs) && impt.ends_with(rhs) {
                    let matched =
                        &impt[wildcard_idx..wildcard_idx + impt.len() - lhs.len() - rhs.len()];
                    return Some(mapping.replace('*', matched));
                }
            }
        }
        if let Some(mapping) = map.get(impt) {
            return Some(mapping.into());
        }
    }
    None
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
