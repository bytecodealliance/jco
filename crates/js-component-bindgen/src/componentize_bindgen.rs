use crate::function_bindgen::{ErrHandling, FunctionBindgen};
use crate::intrinsics::{render_intrinsics, Intrinsic};
use crate::source::Source;
use crate::{uwrite, uwriteln};
use heck::*;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write;
use wasmtime_environ::component::{CanonicalOptions, Component, Export, GlobalInitializer};
use wit_parser::abi::{AbiVariant, LiftLower, WasmSignature};
use wit_parser::*;

struct JsBindgen<'a> {
    /// The source code for the "main" file that's going to be created for the
    /// component we're generating bindings for. This is incrementally added to
    /// over time and primarily contains the main `instantiate` function as well
    /// as a type-description of the input/output interfaces.
    src: Source,

    /// List of all intrinsics emitted to `src` so far.
    all_intrinsics: BTreeSet<Intrinsic>,

    resolve: &'a Resolve,
    world: WorldId,
    sizes: SizeAlign,
    component: &'a Component,
    memory: String,
    realloc: String,

    exports: Vec<(Option<String>, String, CoreFn)>,
    imports: Vec<(Option<String>, String, CoreFn)>,
}

#[derive(Debug)]
pub enum CoreTy {
    I32,
    I64,
    F32,
    F64,
}

#[derive(Debug)]
pub struct CoreFn {
    pub params: Vec<CoreTy>,
    pub ret: Option<CoreTy>,
    pub retptr: bool,
    pub retsize: u32,
    pub paramptr: bool,
}

#[derive(Debug)]
pub struct Componentization {
    pub js_bindings: String,
    pub exports: Vec<(Option<String>, String, CoreFn)>,
    pub imports: BTreeMap<String, Vec<(String, CoreFn)>>,
    pub import_wrappers: Vec<(String, String)>,
}

// TODO: bring back these validations of imports
// including using the flattened bindings
//         if export_bindings.len() > 0 {
//             // error handling
//             js_bindings.push_str(&format!(
// "class BindingsError extends Error {{
//     constructor (interfaceName, interfaceType) {{
//         super(`Export \"${{interfaceName}}\" ${{interfaceType}} not exported as expected by the world for \"{source_name}\".`);
//     }}
// }}\n"
//             ));
//             let mut seen_ifaces = HashSet::new();
//             for binding in &export_bindings {
//                 let expt_name_camel = binding.export_name.to_lower_camel_case();
//                 if let Some(name) = &binding.member_name {
//                     let name_camel = name.to_lower_camel_case();
//                     if !seen_ifaces.contains(&expt_name_camel) {
//                         seen_ifaces.insert(expt_name_camel.to_string());
//                         js_bindings.push_str(&format!(
//                             "if (typeof source_mod['{expt_name_camel}'] !== 'object') throw new BindingsError('{expt_name_camel}', 'object');\n"
//                         ));
//                     }
//                     js_bindings.push_str(&format!(
//                         "if (typeof source_mod['{expt_name_camel}']['{name_camel}'] !== 'function') throw new BindingsError('{expt_name_camel}.{name_camel}', 'function');\n"
//                     ));
//                     let lifting_name = &binding.lifting_name;
//                     js_bindings.push_str(&format!(
//                         "const {lifting_name} = source_mod.{expt_name_camel}.{name_camel};\n"
//                     ));
//                 } else {
//                     js_bindings.push_str(&format!(
//                         "if (typeof source_mod['{expt_name_camel}'] !== 'function') throw new BindingsError('{expt_name_camel}', 'function');\n"
//                     ));
//                     let lifting_name = &binding.lifting_name;
//                     js_bindings.push_str(&format!(
//                         "const {lifting_name} = source_mod.{expt_name_camel};\n"
//                     ));
//                 }
//             }
//         }

pub fn componentize_bindgen(
    component: &Component,
    resolve: &Resolve,
    id: WorldId,
    name: &str,
) -> Componentization {
    let mut bindgen = JsBindgen {
        src: Source::default(),
        all_intrinsics: BTreeSet::new(),
        resolve,
        world: id,
        sizes: SizeAlign::default(),
        component,
        memory: "$memory".to_string(),
        realloc: "$realloc".to_string(),
        exports: Vec::new(),
        imports: Vec::new(),
    };

    bindgen.sizes.fill(resolve);

    bindgen.exports_bindgen();

    bindgen.imports_bindgen();

    // consolidate import specifiers and generate wrappers
    let mut import_bindings = Vec::new();
    let mut import_wrappers = Vec::new();
    let mut imports = BTreeMap::new();
    for (iface, name, func) in bindgen.imports.drain(..) {
        // this is weird, but it is what it is for now
        let specifier = if let Some(iface) = &iface {
            iface.into()
        } else {
            name.to_string()
        };

        if !imports.contains_key(&specifier) {
            imports.insert(specifier.to_string(), Vec::new());
        }
        let impt_list = imports.get_mut(&specifier).unwrap();

        let binding_name = js_canon_name(iface.as_ref(), &name, "");
        import_bindings.push(binding_name);

        let import_name = if iface.is_some() { name } else { "".into() };

        impt_list.push((import_name, func));
    }

    let mut i = 0;
    for (specifier, impt_list) in imports.iter() {
        let mut specifier_list = Vec::new();
        for (binding, _) in impt_list.iter() {
            let binding_name = &import_bindings[i];
            let binding_camel = binding.to_lower_camel_case();
            if binding == "" {
                specifier_list.push(format!("import_{binding_name} as default"));
            } else {
                specifier_list.push(format!("import_{binding_name} as {binding_camel}"));
            }
            i += 1;
        }
        let joined_bindings = specifier_list.join(", ");
        import_wrappers.push((
            specifier.to_string(),
            format!("export {{ {joined_bindings} }} from 'internal:bindings';"),
        ));
    }

    let mut output = Source::default();

    uwrite!(
        output,
        "
            import * as $source_mod from '{name}';

            let $memory, $realloc{};
            export function $initBindings (_memory, _realloc{}) {{
                $memory = _memory;
                $realloc = _realloc;{}
            }}
        ",
        import_bindings
            .iter()
            .map(|impt| format!(", $import_{impt}"))
            .collect::<Vec<_>>()
            .join(""),
        import_bindings
            .iter()
            .map(|impt| format!(", _{impt}"))
            .collect::<Vec<_>>()
            .join(""),
        import_bindings
            .iter()
            .map(|impt| format!("\n$import_{impt} = _{impt};"))
            .collect::<Vec<_>>()
            .join(""),
    );

    let js_intrinsics = render_intrinsics(&mut bindgen.all_intrinsics, false, true);
    output.push_str(&js_intrinsics);
    output.push_str(&bindgen.src);

    Componentization {
        js_bindings: output.to_string(),
        exports: bindgen.exports,
        imports,
        import_wrappers,
    }
}

impl JsBindgen<'_> {
    fn exports_bindgen(&mut self) {
        for (name, export) in &self.component.exports {
            let item = &self.resolve.worlds[self.world].exports[name];
            match export {
                Export::LiftedFunction {
                    ty: _,
                    func: _,
                    options,
                } => {
                    let func = match item {
                        WorldItem::Function(f) => f,
                        WorldItem::Interface(_) | WorldItem::Type(_) => unreachable!(),
                    };
                    let callee = js_canon_name(None, &func.name, "$source_mod.");
                    self.export_bindgen(None, func.name.to_string(), &callee, options, func);
                }
                Export::Instance(exports) => {
                    let id = match item {
                        WorldItem::Interface(id) => *id,
                        WorldItem::Function(_) | WorldItem::Type(_) => unreachable!(),
                    };
                    for (func_name, export) in exports {
                        let options = match export {
                            Export::LiftedFunction { options, .. } => options,
                            Export::Type(_) => continue, // ignored
                            _ => unreachable!(),
                        };
                        let iface = &self.resolve.interfaces[id];
                        let iface_camel = iface.name.as_ref().unwrap().to_lower_camel_case();
                        let func = &iface.functions[func_name];
                        let callee =
                            js_canon_name(None, &func.name, &format!("$source_mod.{iface_camel}."));
                        self.export_bindgen(
                            iface.name.to_owned(),
                            func.name.to_string(),
                            &callee,
                            options,
                            func,
                        );
                    }
                }

                // ignore type exports for now
                Export::Type(_) => {}

                // This can't be tested at this time so leave it unimplemented
                Export::Module(_) => unimplemented!(),
            }
        }
    }

    fn imports_bindgen(&mut self) {
        for init in self.component.initializers.iter() {
            if let GlobalInitializer::LowerImport(import) = init {
                let (import_index, path) = &self.component.imports[import.import];
                let (import_name, _import_ty) = &self.component.import_types[*import_index];
                let (func, iface_name, name, callee_name) =
                    match &self.resolve.worlds[self.world].imports[import_name.as_str()] {
                        WorldItem::Function(f) => {
                            assert_eq!(path.len(), 0);
                            let fname = &f.name;
                            (
                                f,
                                None,
                                fname.to_string(),
                                js_canon_name(None, &fname, "$import_"),
                            )
                        }
                        WorldItem::Interface(i) => {
                            assert_eq!(path.len(), 1);
                            let iface = &self.resolve.interfaces[*i];
                            let iface_name = iface.name.as_ref().unwrap();
                            let f = &iface.functions[&path[0]];
                            let fname = &f.name;
                            (
                                f,
                                Some(iface_name.to_string()),
                                fname.to_string(),
                                js_canon_name(Some(iface_name), &fname, "$import_"),
                            )
                        }
                        WorldItem::Type(_) => unreachable!(),
                    };

                let binding_name = js_canon_name(iface_name.as_ref(), &name, "import_");

                // imports are canonicalized as exports because
                // the function bindgen as currently written still makes this assumption
                uwrite!(self.src, "\nexport function {binding_name}");
                self.bindgen(
                    func.params.len(),
                    &callee_name,
                    &import.options,
                    func,
                    AbiVariant::GuestExport,
                );
                self.src.push_str("\n");

                let sig = self.resolve.wasm_signature(AbiVariant::GuestImport, func);
                if let Some(iface_name) = iface_name {
                    self.imports
                        .push((Some(iface_name), name, self.core_fn(func, &sig)));
                } else {
                    self.imports.push((None, name, self.core_fn(func, &sig)));
                }
            }
        }
    }

    fn bindgen(
        &mut self,
        nparams: usize,
        callee: &str,
        opts: &CanonicalOptions,
        func: &Function,
        abi: AbiVariant,
    ) {
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
            intrinsics: &mut self.all_intrinsics,
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
            memory: Some(&self.memory),
            realloc: Some(&self.realloc),
            tmp: 0,
            params,
            post_return: None,
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
        self.src.push_str(&f.src);
        self.src.push_str("}");
    }

    fn export_bindgen(
        &mut self,
        iface_name: Option<String>,
        name: String,
        callee: &str,
        options: &CanonicalOptions,
        func: &Function,
    ) {
        let binding_name = js_canon_name(iface_name.as_ref(), &name, "export_");
        uwrite!(self.src, "\nexport function {binding_name}");

        // exports are canonicalized as imports because
        // the function bindgen as currently written still makes this assumption
        let sig = self.resolve.wasm_signature(AbiVariant::GuestImport, func);

        self.bindgen(
            sig.params.len(),
            callee,
            options,
            func,
            AbiVariant::GuestImport,
        );
        self.src.push_str("\n");

        // populate core function return info for splicer
        self.exports.push((
            iface_name,
            name,
            self.core_fn(
                func,
                &self.resolve.wasm_signature(AbiVariant::GuestExport, func),
            ),
        ));
    }

    fn core_fn(&self, func: &Function, sig: &WasmSignature) -> CoreFn {
        CoreFn {
            retsize: if sig.retptr {
                let mut retsize: u32 = 0;
                for ret_ty in func.results.iter_types() {
                    retsize += self.sizes.size(ret_ty) as u32;
                }
                retsize
            } else {
                0
            },
            retptr: sig.retptr,
            paramptr: sig.indirect_params,
            params: sig
                .params
                .iter()
                .map(|v| match v {
                    wit_parser::abi::WasmType::I32 => CoreTy::I32,
                    wit_parser::abi::WasmType::I64 => CoreTy::I64,
                    wit_parser::abi::WasmType::F32 => CoreTy::F32,
                    wit_parser::abi::WasmType::F64 => CoreTy::F64,
                })
                .collect(),
            ret: match sig.results.first() {
                None => None,
                Some(wit_parser::abi::WasmType::I32) => Some(CoreTy::I32),
                Some(wit_parser::abi::WasmType::I64) => Some(CoreTy::I64),
                Some(wit_parser::abi::WasmType::F32) => Some(CoreTy::F32),
                Some(wit_parser::abi::WasmType::F64) => Some(CoreTy::F64),
            },
        }
    }
}

fn js_canon_name(iface: Option<&String>, name: &str, prefix: &str) -> String {
    let camel_name = name.to_lower_camel_case();
    match iface {
        Some(iface_name) => {
            let iface_camel_name = iface_name.to_lower_camel_case();
            format!("{prefix}{iface_camel_name}${camel_name}")
        }
        None => format!("{prefix}{camel_name}"),
    }
}
