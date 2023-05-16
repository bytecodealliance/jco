use crate::files::Files;
use crate::function_bindgen::{ErrHandling, FunctionBindgen};
use crate::identifier::is_js_identifier;
use crate::intrinsics::{render_intrinsics, Intrinsic};
use crate::source;
use crate::{uwrite, uwriteln};
use base64::{engine::general_purpose, Engine as _};
use heck::*;
use indexmap::IndexMap;
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

struct JsBindgen {
    /// The source code for the "main" file that's going to be created for the
    /// component we're generating bindings for. This is incrementally added to
    /// over time and primarily contains the main `instantiate` function as well
    /// as a type-description of the input/output interfaces.
    src: Source,

    /// JS output imports map from imported specifier, to a list of bindings
    imports: HashMap<String, Vec<(String, String)>>,

    /// Core module count
    core_module_cnt: usize,

    /// Various options for code generation.
    pub opts: TranspileOpts,

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
) {
    let mut bindgen = JsBindgen {
        src: Source::default(),
        imports: HashMap::new(),
        core_module_cnt: 0,
        opts,
        all_intrinsics: BTreeSet::new(),
    };
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
        component,
    };
    instantiator.sizes.fill(resolve);
    instantiator.instantiate();
    instantiator.gen.src.js(&instantiator.src.js);
    instantiator.gen.src.js_init(&instantiator.src.js_init);

    bindgen.finish_component(name, files);
}

impl JsBindgen {
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

    fn map_import(&self, impt: &str) -> String {
        if let Some(map) = self.opts.map.as_ref() {
            for (key, mapping) in map {
                if key == impt {
                    return mapping.into();
                }
                if let Some(wildcard_idx) = key.find('*') {
                    let lhs = &key[0..wildcard_idx];
                    let rhs = &key[wildcard_idx + 1..];
                    if impt.starts_with(lhs) && impt.ends_with(rhs) {
                        let matched =
                            &impt[wildcard_idx..wildcard_idx + impt.len() - lhs.len() - rhs.len()];
                        return mapping.replace('*', matched);
                    }
                }
            }
            if let Some(mapping) = map.get(impt) {
                return mapping.into();
            }
        }
        impt.into()
    }

    fn intrinsic(&mut self, intrinsic: Intrinsic) -> String {
        self.all_intrinsics.insert(intrinsic);
        return intrinsic.name().to_string();
    }
}

/// Helper structure used to generate the `instantiate` method of a component.
///
/// This is the main structure for parsing the output of Wasmtime.
struct Instantiator<'a> {
    src: Source,
    gen: &'a mut JsBindgen,
    modules: &'a PrimaryMap<StaticModuleIndex, ModuleTranslation<'a>>,
    instances: PrimaryMap<RuntimeInstanceIndex, StaticModuleIndex>,
    resolve: &'a Resolve,
    world: WorldId,
    sizes: SizeAlign,
    component: &'a Component,
}

impl Instantiator<'_> {
    fn instantiate(&mut self) {
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
            self.src.js("return ");
        }

        self.exports(&self.component.exports);
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
                index,
                op,
                from,
                from64,
                to,
                to64,
                signature,
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
                if is_js_identifier(module) {
                    imports.push_str(module);
                } else {
                    uwrite!(imports, "'{module}'");
                }
                imports.push_str(": {\n");
                for (name, val) in names {
                    if is_js_identifier(name) {
                        imports.push_str(name);
                    } else {
                        uwrite!(imports, "'{name}'");
                    }
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
        let (import_name, _import_ty) = &self.component.import_types[*import_index];
        let func = match &self.resolve.worlds[self.world].imports[import_name.as_str()] {
            WorldItem::Function(f) => {
                assert_eq!(path.len(), 0);
                f
            }
            WorldItem::Interface(i) => {
                assert_eq!(path.len(), 1);
                &self.resolve.interfaces[*i].functions[&path[0]]
            }
            WorldItem::Type(_) => unreachable!(),
        };

        let index = import.index.as_u32();
        let callee = format!("lowering{index}Callee");

        let import_specifier = self.gen.map_import(import_name);

        let id = func.name.to_lower_camel_case();

        // instance imports are otherwise hoisted
        if self.gen.opts.instantiation {
            uwriteln!(
                self.src.js,
                "const {callee} = imports{}.{};",
                if is_js_identifier(&import_specifier) {
                    format!(".{}", import_specifier)
                } else {
                    format!("['{}']", import_specifier)
                },
                id
            );
        } else {
            let imports_vec = self
                .gen
                .imports
                .entry(import_specifier)
                .or_insert(Vec::new());
            imports_vec.push((id, callee.clone()));
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
        if is_js_identifier(name) {
            format!("exports{i}.{name}")
        } else {
            format!("exports{i}['{name}']")
        }
    }

    fn exports(&mut self, exports: &IndexMap<String, Export>) {
        if exports.is_empty() {
            if self.gen.opts.instantiation {
                self.src.js("{}");
            }
            return;
        }

        if self.gen.opts.instantiation {
            uwriteln!(self.src.js, "{{");
        }

        let mut camel_exports = Vec::new();
        for (name, export) in exports {
            let item = &self.resolve.worlds[self.world].exports[name];
            let camel = name.to_lower_camel_case();
            match export {
                Export::LiftedFunction {
                    ty: _,
                    func,
                    options,
                } => {
                    self.export_bindgen(
                        name,
                        None,
                        func,
                        options,
                        match item {
                            WorldItem::Function(f) => f,
                            WorldItem::Interface(_) | WorldItem::Type(_) => unreachable!(),
                        },
                    );
                }
                Export::Instance(exports) => {
                    let id = match item {
                        WorldItem::Interface(id) => *id,
                        WorldItem::Function(_) | WorldItem::Type(_) => unreachable!(),
                    };
                    if self.gen.opts.instantiation {
                        uwriteln!(self.src.js, "{camel}: {{");
                    } else {
                        uwriteln!(self.src.js, "const {camel} = {{");
                    }
                    for (func_name, export) in exports {
                        let (func, options) = match export {
                            Export::LiftedFunction { func, options, .. } => (func, options),
                            Export::Type(_) => continue, // ignored
                            _ => unreachable!(),
                        };
                        self.export_bindgen(
                            func_name,
                            Some(name),
                            func,
                            options,
                            &self.resolve.interfaces[id].functions[func_name],
                        );
                    }
                    self.src.js("\n}");
                    if self.gen.opts.instantiation {
                        self.src.js(",\n");
                    } else {
                        self.src.js(";\n");
                    }
                }

                // ignore type exports for now
                Export::Type(_) => {}

                // This can't be tested at this time so leave it unimplemented
                Export::Module(_) => unimplemented!(),
            }
            camel_exports.push(camel);
        }
        if self.gen.opts.instantiation {
            self.src.js("}");
        } else {
            uwriteln!(self.src.js, "\nexport {{ {} }}", camel_exports.join(", "));
        }
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
        if self.gen.opts.instantiation || instance_name.is_some() {
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
        if self.gen.opts.instantiation || instance_name.is_some() {
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

fn core_file_name(name: &str, idx: u32) -> String {
    let i_str = if idx == 0 {
        String::from("")
    } else {
        (idx + 1).to_string()
    };
    format!("{}.core{i_str}.wasm", name)
}
