use crate::files::Files;
use crate::function_bindgen::{ErrHandling, FunctionBindgen};
use crate::identifier::is_js_identifier;
use crate::intrinsics::{render_intrinsics, Intrinsic};
use crate::source::Source;
use crate::{uwrite, uwriteln};
use heck::*;
use indexmap::IndexMap;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fmt::Write;
use std::mem;
use wasmtime_environ::component::{
    CanonicalOptions, Component, CoreDef, CoreExport, Export, ExportItem, GlobalInitializer,
    InstantiateModule, LowerImport, RuntimeInstanceIndex, StaticModuleIndex,
};
use wasmtime_environ::{EntityIndex, ModuleTranslation, PrimaryMap};
use wit_parser::abi::{AbiVariant, LiftLower};
use wit_parser::*;

// opts.name = "test".to_string();
// opts.no_typescript = true;
// opts.valid_lifting_optimization = true;
// opts.compat = false;
// opts.raw_bindgen = true;
#[derive(Default, Clone)]
pub struct ComponentizeOpts {
    pub name: String,
    /// Comma-separated list of "from-specifier=./to-specifier.js" mappings of
    /// component import specifiers to JS import specifiers.
    pub map: Option<HashMap<String, String>>,
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
    pub opts: ComponentizeOpts,

    /// List of all intrinsics emitted to `src` so far.
    all_intrinsics: BTreeSet<Intrinsic>,
}

pub fn componentize_bindgen(
    name: &str,
    component: &Component,
    modules: &PrimaryMap<StaticModuleIndex, ModuleTranslation<'_>>,
    resolve: &Resolve,
    id: WorldId,
    opts: ComponentizeOpts,
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
    instantiator.gen.src.push_str(&instantiator.src);

    let mut output = Source::default();

    let js_intrinsics = render_intrinsics(&mut bindgen.all_intrinsics, false, false);

    output.push_str(&js_intrinsics);
    output.push_str(&bindgen.src);

    let mut bytes = output.as_bytes();
    // strip leading newline
    if bytes[0] == b'\n' {
        bytes = &bytes[1..];
    }
    files.push(&format!("{name}.js"), bytes);
}

impl JsBindgen {
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
        for init in self.component.initializers.iter() {
            self.instantiation_global_initializer(init);
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
                let idx = m.index.as_u32();
                uwriteln!(self.src, "let memory{idx};");
            }
            GlobalInitializer::ExtractRealloc(r) => {
                let idx = r.index.as_u32();
                uwriteln!(self.src, "let realloc{idx};");
            }
            GlobalInitializer::ExtractPostReturn(p) => {
                let idx = p.index.as_u32();
                uwriteln!(self.src, "let postReturn{idx};");
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
            GlobalInitializer::Transcoder(_) => unimplemented!(),
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
        uwriteln!(self.src, "let exports{iu32};");
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
        let imports_vec = self
            .gen
            .imports
            .entry(import_specifier)
            .or_insert(Vec::new());
        imports_vec.push((id, callee.clone()));

        uwrite!(self.src, "\nfunction lowering{index}");
        let nparams = self
            .resolve
            .wasm_signature(AbiVariant::GuestImport, func)
            .params
            .len();
        let prev = mem::take(&mut self.src);
        self.bindgen(
            nparams,
            callee,
            &import.options,
            func,
            AbiVariant::GuestImport,
        );
        let latest = mem::replace(&mut self.src, prev);
        self.src.push_str(&latest);
    }

    fn bindgen(
        &mut self,
        nparams: usize,
        callee: String,
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

        self.src.push_str("(");
        let mut params = Vec::new();
        for i in 0..nparams {
            if i > 0 {
                self.src.push_str(", ");
            }
            let param = format!("arg{i}");
            self.src.push_str(&param);
            params.push(param);
        }
        uwriteln!(self.src, ") {{");

        let mut f = FunctionBindgen {
            intrinsics: BTreeSet::new(),
            valid_lifting_optimization: true,
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
            memory,
            realloc,
            tmp: 0,
            params,
            post_return,
            encoding: opts.string_encoding,
            src: Source::default(),
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
        for intrinsic in f.intrinsics {
            self.gen.intrinsic(intrinsic);
        }
        self.src.push_str(&f.src);
        self.src.push_str("}");
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
            return;
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
                    uwriteln!(self.src, "const {camel} = {{");
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
                    self.src.push_str("\n};\n");
                }

                // ignore type exports for now
                Export::Type(_) => {}

                // This can't be tested at this time so leave it unimplemented
                Export::Module(_) => unimplemented!(),
            }
            camel_exports.push(camel);
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
        if instance_name.is_some() {
            self.src.push_str(&name);
        } else {
            uwrite!(self.src, "\nfunction {name}");
        }
        let callee = self.core_def(def);
        self.bindgen(
            func.params.len(),
            callee,
            options,
            func,
            AbiVariant::GuestExport,
        );
        if instance_name.is_some() {
            self.src.push_str(",\n");
        } else {
            self.src.push_str("\n");
        }
    }
}
