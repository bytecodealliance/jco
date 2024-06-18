use crate::files::Files;
use crate::function_bindgen::{array_ty, as_nullable, maybe_null};
use crate::names::{is_js_identifier, maybe_quote_id, LocalNames, RESERVED_KEYWORDS};
use crate::source::Source;
use crate::transpile_bindgen::parse_world_key;
use crate::{dealias, uwrite, uwriteln};
use heck::*;
use std::collections::btree_map::Entry;
use std::collections::BTreeMap;
use std::fmt::Write;
use wit_parser::*;

struct TsStubgen<'a> {
    resolve: &'a Resolve,
    files: &'a mut Files,
    world: &'a World,
}

// TODO:
// Type export generation (what do resources look like???)
// Result/Option in guest if needed? (Maybe just always include it?)
// Include imports in guest file module?

pub fn ts_stubgen(resolve: &Resolve, id: WorldId, files: &mut Files) {
    let world = &resolve.worlds[id];
    let mut bindgen = TsStubgen {
        resolve,
        files,
        world,
    };

    {
        let mut funcs = Vec::new();
        let mut interface_imports: BTreeMap<String, Vec<(String, InterfaceId)>> = BTreeMap::new();

        for (name, import) in world.imports.iter() {
            match import {
                WorldItem::Function(f) => match name {
                    WorldKey::Name(name) => funcs.push((name.to_string(), f)),
                    WorldKey::Interface(id) => funcs.push((resolve.id_of(*id).unwrap(), f)),
                },
                WorldItem::Interface(id) => match name {
                    WorldKey::Name(name) => {
                        bindgen.generate_interface(name, *id);
                    }
                    WorldKey::Interface(id) => {
                        let import_specifier = resolve.id_of(*id).unwrap();
                        let (_, _, iface) = parse_world_key(&import_specifier).unwrap();
                        let iface = iface.to_string();
                        match interface_imports.entry(import_specifier) {
                            Entry::Vacant(entry) => {
                                entry.insert(vec![("*".into(), *id)]);
                            }
                            Entry::Occupied(ref mut entry) => {
                                entry.get_mut().push((iface, *id));
                            }
                        }
                    }
                },
                // TODO: Confirm this is true
                WorldItem::Type(_) => {
                    unreachable!("types cannot be imported")
                }
            }
        }

        for (_name, import_interfaces) in interface_imports {
            bindgen.import_interfaces(import_interfaces);
        }
    }

    {
        let mut export_interfaces: Vec<InterfaceId> = Vec::new();
        let mut export_functions: Vec<ExportFunction> = Vec::new();
        let mut export_types: Vec<TypeId> = Vec::new();

        for (name, export) in world.exports.iter() {
            match export {
                WorldItem::Function(f) => {
                    let export_name = match name {
                        WorldKey::Name(export_name) => export_name,
                        WorldKey::Interface(_) => unreachable!(),
                    };
                    let export_name = export_name.to_lower_camel_case();
                    export_functions.push(ExportFunction {
                        export_name,
                        func: f,
                    });
                }
                WorldItem::Interface(id) => {
                    assert!(
                        matches!(name, WorldKey::Interface(_)),
                        "inline interface not supported"
                    );
                    let id = *id;
                    export_interfaces.push(id);
                }
                WorldItem::Type(type_id) => {
                    export_types.push(*type_id);
                }
            }
        }

        bindgen.process_exports(world, &export_functions, &export_interfaces);
    }
}

struct ExportFunction<'a> {
    export_name: String,
    func: &'a Function,
}

impl<'a> TsStubgen<'a> {
    fn import_interfaces(&mut self, ifaces: Vec<(String, InterfaceId)>) {
        for (_, id) in ifaces {
            let name = self.resolve.interfaces[id].name.as_ref().unwrap();
            self.generate_interface(name, id);
        }
    }

    fn process_exports(
        &mut self,
        world: &World,
        funcs: &[ExportFunction],
        interfaces: &[InterfaceId],
    ) {
        let mut world_src = Source::default();

        for id in interfaces {
            let id = *id;
            let i_face = &self.resolve.interfaces[id];

            let mut gen = TsImport::new(self.resolve);

            let name = i_face.name.as_ref().unwrap();

            uwriteln!(
                gen.src,
                "export interface {name} {{",
                name = name.to_upper_camel_case(),
            );

            for (_, func) in i_face.functions.iter() {
                gen.ts_func(func, false, false);
            }

            gen.types(id);

            let mut src = gen.finish();

            uwriteln!(src, "}}");

            world_src.push_str(&src);
        }

        let camel_world = world.name.to_upper_camel_case();
        let kebab_world = world.name.to_kebab_case();

        uwriteln!(world_src, "export interface {camel_world}Guest {{",);
        for id in interfaces {
            let name = self.resolve.interfaces[*id]
                .name
                .as_ref()
                .expect("non-inline interface");
            let lower_camel = name.to_lower_camel_case();
            let upper_camel = name.to_upper_camel_case();
            uwriteln!(world_src, "{lower_camel}: {upper_camel},",);
        }

        for func in funcs {
            let mut gen = TsImport::new(self.resolve);
            gen.ts_func_signature(func.func);
            let signature = gen.src;

            uwriteln!(
                world_src,
                "{export_name}{signature},",
                export_name = func.export_name,
                signature = signature.as_ref()
            );
        }

        uwriteln!(world_src, "}}");

        self.files
            .push(&format!("{kebab_world}.d.ts"), world_src.as_bytes());
    }

    fn generate_interface(&mut self, name: &str, id: InterfaceId) {
        let id_name = self.resolve.id_of(id).unwrap_or_else(|| name.to_string());
        let goal_name = interface_goal_name(&id_name);
        let goal_name_kebab = goal_name.to_kebab_case();
        let file_name = &format!("interfaces/{}.d.ts", goal_name_kebab);

        let package_name = interface_module_name(self.resolve, id);

        let mut gen = TsImport::new(self.resolve);

        uwriteln!(gen.src, "declare module \"{package_name}\" {{");
        for (_, func) in self.resolve.interfaces[id].functions.iter() {
            gen.ts_func(func, false, true);
        }

        gen.types(id);
        gen.post_types();

        let mut src = gen.finish();

        uwriteln!(src, "}}");

        self.files.push(file_name, src.as_bytes());
    }
}

/// Used to generate a `*.d.ts` file for each imported and exported interface for
/// a component.
///
/// This generated source does not contain any actual JS runtime code, it's just
/// typescript definitions.
struct TsImport<'a> {
    src: Source,
    resolve: &'a Resolve,
    needs_ty_option: bool,
    needs_ty_result: bool,
    local_names: LocalNames,
    resources: BTreeMap<String, TsImport<'a>>,
}

impl<'a> TsImport<'a> {
    fn new(resolve: &'a Resolve) -> Self {
        TsImport {
            src: Source::default(),
            resources: BTreeMap::new(),
            local_names: LocalNames::default(),
            resolve,
            needs_ty_option: false,
            needs_ty_result: false,
        }
    }

    fn finish(mut self) -> Source {
        for (resource, source) in self.resources {
            uwriteln!(
                self.src,
                "\nexport class {} {{",
                resource.to_upper_camel_case()
            );
            self.src.push_str(&source.src);
            uwriteln!(self.src, "}}")
        }
        self.src
    }

    fn as_printer(&mut self) -> Printer {
        Printer {
            resolve: self.resolve,
            src: &mut self.src,
            needs_ty_option: &mut self.needs_ty_option,
            needs_ty_result: &mut self.needs_ty_result,
        }
    }

    fn types(&mut self, iface_id: InterfaceId) {
        let iface = &self.resolve.interfaces[iface_id];
        for (name, id) in iface.types.iter() {
            let ty = &self.resolve.types[*id];
            match &ty.kind {
                TypeDefKind::Record(record) => {
                    self.as_printer().type_record(*id, name, record, &ty.docs)
                }
                TypeDefKind::Flags(flags) => {
                    self.as_printer().type_flags(*id, name, flags, &ty.docs)
                }
                TypeDefKind::Tuple(tuple) => {
                    self.as_printer().type_tuple(*id, name, tuple, &ty.docs)
                }
                TypeDefKind::Enum(enum_) => self.as_printer().type_enum(*id, name, enum_, &ty.docs),
                TypeDefKind::Variant(variant) => {
                    self.as_printer().type_variant(*id, name, variant, &ty.docs)
                }
                TypeDefKind::Option(t) => self.as_printer().type_option(*id, name, t, &ty.docs),
                TypeDefKind::Result(r) => self.as_printer().type_result(*id, name, r, &ty.docs),
                TypeDefKind::List(t) => self.as_printer().type_list(*id, name, t, &ty.docs),
                TypeDefKind::Type(t) => {
                    self.as_printer()
                        .type_alias(*id, name, t, Some(iface_id), &ty.docs)
                }
                TypeDefKind::Future(_) => todo!("generate for future"),
                TypeDefKind::Stream(_) => todo!("generate for stream"),
                TypeDefKind::Unknown => unreachable!(),
                TypeDefKind::Resource => {}
                TypeDefKind::Handle(_) => todo!(),
            }
        }
    }

    fn ts_func(&mut self, func: &Function, default: bool, declaration: bool) {
        let iface = if let FunctionKind::Method(ty)
        | FunctionKind::Static(ty)
        | FunctionKind::Constructor(ty) = func.kind
        {
            let ty = &self.resolve.types[ty];
            let resource = ty.name.as_ref().unwrap();
            if !self.resources.contains_key(resource) {
                self.resources
                    .insert(resource.to_string(), TsImport::new(self.resolve));
            }
            self.resources.get_mut(resource).unwrap()
        } else {
            self
        };

        iface.as_printer().docs(&func.docs);

        let out_name = if default {
            "default".to_string()
        } else {
            func.item_name().to_lower_camel_case()
        };

        if declaration {
            match func.kind {
                FunctionKind::Freestanding => {
                    if is_js_identifier(&out_name) {
                        iface.src.push_str(&format!("export function {out_name}"));
                    } else {
                        let (local_name, _) = iface.local_names.get_or_create(&out_name, &out_name);
                        iface
                            .src
                            .push_str(&format!("export {{ {local_name} as {out_name} }};\n"));
                        iface
                            .src
                            .push_str(&format!("declare function {local_name}"));
                    };
                }
                FunctionKind::Method(_) => {
                    if is_js_identifier(&out_name) {
                        iface.src.push_str(&out_name);
                    } else {
                        iface.src.push_str(&format!("'{out_name}'"));
                    }
                }
                FunctionKind::Static(_) => {
                    if is_js_identifier(&out_name) {
                        iface.src.push_str(&format!("static {out_name}"))
                    } else {
                        iface.src.push_str(&format!("static '{out_name}'"))
                    }
                }
                FunctionKind::Constructor(_) => iface.src.push_str("constructor"),
            }
        } else {
            if is_js_identifier(&out_name) {
                iface.src.push_str(&out_name);
            } else {
                iface.src.push_str(&format!("'{out_name}'"));
            }
        }

        iface.ts_func_signature(func);

        match func.kind {
            // Constructor doesn't need end character
            FunctionKind::Constructor(_) => {}
            _ => {
                let end_character = if declaration { ';' } else { ',' };
                iface.src.push_str(format!("{}\n", end_character).as_str());
            }
        }
    }

    fn ts_func_signature(&mut self, func: &Function) {
        self.src.push_str("(");

        let param_start = match &func.kind {
            FunctionKind::Freestanding => 0,
            FunctionKind::Method(_) => 1,
            FunctionKind::Static(_) => 0,
            FunctionKind::Constructor(_) => 0,
        };

        for (i, (name, ty)) in func.params[param_start..].iter().enumerate() {
            if i > 0 {
                self.src.push_str(", ");
            }
            let mut param_name = name.to_lower_camel_case();
            if RESERVED_KEYWORDS
                .binary_search(&param_name.as_str())
                .is_ok()
            {
                param_name = format!("{}_", param_name);
            }
            self.src.push_str(&param_name);
            self.src.push_str(": ");
            self.as_printer().print_ty(ty);
        }

        self.src.push_str(")");
        if matches!(func.kind, FunctionKind::Constructor(_)) {
            self.src.push_str("\n");
            return;
        }
        self.src.push_str(": ");

        match func.results.len() {
            0 => self.src.push_str("void"),
            1 => self
                .as_printer()
                .print_ty(func.results.iter_types().next().unwrap()),
            _ => {
                self.src.push_str("[");
                for (i, ty) in func.results.iter_types().enumerate() {
                    if i != 0 {
                        self.src.push_str(", ");
                    }
                    self.as_printer().print_ty(ty);
                }
                self.src.push_str("]");
            }
        }
    }

    fn post_types(&mut self) {
        let needs_ty_option =
            self.needs_ty_option || self.resources.iter().any(|(_, r)| r.needs_ty_option);
        let needs_ty_result =
            self.needs_ty_result || self.resources.iter().any(|(_, r)| r.needs_ty_result);
        if needs_ty_option {
            self.src
                .push_str("export type Option<T> = { tag: 'none' } | { tag: 'some', val: T };\n");
        }
        if needs_ty_result {
            self.src.push_str(
                "export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };\n",
            );
        }
    }

    // fn needs_ty_option(&self) -> bool {
    //     self.needs_ty_option || self.resources.values().any(|r| r.needs_ty_option())
    // }

    // fn needs_ty_result(&self) -> bool {
    //     self.needs_ty_result || self.resources.values().any(|r| r.needs_ty_result())
    // }
}

fn interface_goal_name(iface_name: &str) -> String {
    let iface_name_sans_version = match iface_name.find('@') {
        Some(version_idx) => &iface_name[0..version_idx],
        None => iface_name,
    };
    iface_name_sans_version
        .replace(['/', ':'], "-")
        .to_kebab_case()
}

// "golem:api/host@0.2.0";
fn interface_module_name(resolve: &Resolve, id: InterfaceId) -> String {
    let i = &resolve.interfaces[id];
    let i_name = i.name.as_ref().expect("interface name");
    match i.package {
        Some(package) => {
            let package_name = &resolve.packages[package].name;
            let mut s = String::new();
            uwrite!(
                s,
                "{}:{}/{}",
                package_name.namespace,
                package_name.name,
                i_name
            );

            if let Some(version) = package_name.version.as_ref() {
                uwrite!(s, "@{}", version);
            }

            s
        }
        None => i_name.to_string(),
    }
}

struct Printer<'a> {
    resolve: &'a Resolve,
    src: &'a mut Source,
    needs_ty_option: &'a mut bool,
    needs_ty_result: &'a mut bool,
}

impl<'a> Printer<'a> {
    fn docs_raw(&mut self, docs: &str) {
        self.src.push_str("/**\n");
        for line in docs.lines() {
            self.src.push_str(&format!(" * {}\n", line));
        }
        self.src.push_str(" */\n");
    }

    fn docs(&mut self, docs: &Docs) {
        if let Some(docs) = &docs.contents {
            self.docs_raw(docs);
        }
    }

    fn type_record(&mut self, _id: TypeId, name: &str, record: &Record, docs: &Docs) {
        self.docs(docs);
        self.src.push_str(&format!(
            "export interface {} {{\n",
            name.to_upper_camel_case()
        ));
        for field in record.fields.iter() {
            self.docs(&field.docs);
            let (option_str, ty) =
                as_nullable(self.resolve, &field.ty).map_or(("", &field.ty), |ty| ("?", ty));
            self.src.push_str(&format!(
                "{}{}: ",
                maybe_quote_id(&field.name.to_lower_camel_case()),
                option_str
            ));
            self.print_ty(ty);
            self.src.push_str(",\n");
        }
        self.src.push_str("}\n");
    }

    fn type_tuple(&mut self, _id: TypeId, name: &str, tuple: &Tuple, docs: &Docs) {
        self.docs(docs);
        self.src
            .push_str(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_tuple(tuple);
        self.src.push_str(";\n");
    }

    fn type_flags(&mut self, _id: TypeId, name: &str, flags: &Flags, docs: &Docs) {
        self.docs(docs);
        self.src.push_str(&format!(
            "export interface {} {{\n",
            name.to_upper_camel_case()
        ));
        for flag in flags.flags.iter() {
            self.docs(&flag.docs);
            let name = flag.name.to_lower_camel_case();
            self.src.push_str(&format!("{name}?: boolean,\n"));
        }
        self.src.push_str("}\n");
    }

    fn type_variant(&mut self, _id: TypeId, name: &str, variant: &Variant, docs: &Docs) {
        self.docs(docs);
        self.src
            .push_str(&format!("export type {} = ", name.to_upper_camel_case()));
        for (i, case) in variant.cases.iter().enumerate() {
            if i > 0 {
                self.src.push_str(" | ");
            }
            self.src
                .push_str(&format!("{}_{}", name, case.name).to_upper_camel_case());
        }
        self.src.push_str(";\n");
        for case in variant.cases.iter() {
            self.docs(&case.docs);
            self.src.push_str(&format!(
                "export interface {} {{\n",
                format!("{}_{}", name, case.name).to_upper_camel_case()
            ));
            self.src.push_str("tag: '");
            self.src.push_str(&case.name);
            self.src.push_str("',\n");
            if let Some(ty) = case.ty {
                self.src.push_str("val: ");
                self.print_ty(&ty);
                self.src.push_str(",\n");
            }
            self.src.push_str("}\n");
        }
    }

    fn type_option(&mut self, _id: TypeId, name: &str, payload: &Type, docs: &Docs) {
        self.docs(docs);
        let name = name.to_upper_camel_case();
        self.src.push_str(&format!("export type {name} = "));
        if maybe_null(self.resolve, payload) {
            *self.needs_ty_option = true;
            self.src.push_str("Option<");
            self.print_ty(payload);
            self.src.push_str(">");
        } else {
            self.print_ty(payload);
            self.src.push_str(" | undefined");
        }
        self.src.push_str(";\n");
    }

    fn type_result(&mut self, _id: TypeId, name: &str, result: &Result_, docs: &Docs) {
        self.docs(docs);
        let name = name.to_upper_camel_case();
        *self.needs_ty_result = true;
        self.src.push_str(&format!("export type {name} = Result<"));
        self.print_optional_ty(result.ok.as_ref());
        self.src.push_str(", ");
        self.print_optional_ty(result.err.as_ref());
        self.src.push_str(">;\n");
    }

    fn type_enum(&mut self, _id: TypeId, name: &str, enum_: &Enum, docs: &Docs) {
        // The complete documentation for this enum, including documentation for variants.
        let mut complete_docs = String::new();

        if let Some(docs) = &docs.contents {
            complete_docs.push_str(docs);
            // Add a gap before the `# Variants` section.
            complete_docs.push('\n');
        }

        writeln!(complete_docs, "# Variants").unwrap();

        for case in enum_.cases.iter() {
            writeln!(complete_docs).unwrap();
            writeln!(complete_docs, "## `\"{}\"`", case.name).unwrap();

            if let Some(docs) = &case.docs.contents {
                writeln!(complete_docs).unwrap();
                complete_docs.push_str(docs);
            }
        }

        self.docs_raw(&complete_docs);

        self.src
            .push_str(&format!("export type {} = ", name.to_upper_camel_case()));
        for (i, case) in enum_.cases.iter().enumerate() {
            if i != 0 {
                self.src.push_str(" | ");
            }
            self.src.push_str(&format!("'{}'", case.name));
        }
        self.src.push_str(";\n");
    }

    fn type_alias(
        &mut self,
        id: TypeId,
        name: &str,
        ty: &Type,
        parent_id: Option<InterfaceId>,
        docs: &Docs,
    ) {
        let owner_not_parent = match ty {
            Type::Id(type_def_id) => {
                let ty = &self.resolve.types[*type_def_id];
                match ty.owner {
                    TypeOwner::Interface(i) => {
                        if let Some(parent_id) = parent_id {
                            if parent_id != i {
                                Some(i)
                            } else {
                                None
                            }
                        } else {
                            Some(i)
                        }
                    }
                    _ => None,
                }
            }
            _ => None,
        };

        let type_name = name.to_upper_camel_case();

        if let Some(owner_id) = owner_not_parent {
            let orig_id = dealias(&self.resolve, id);
            let orig_name = self.resolve.types[orig_id]
                .name
                .as_ref()
                .unwrap()
                .to_upper_camel_case();

            let package_name = interface_module_name(self.resolve, owner_id);

            if orig_name == type_name {
                uwriteln!(
                    self.src,
                    "import type {{ {type_name} }} from \"{package_name}\";",
                );
            } else {
                uwriteln!(
                    self.src,
                    "import type {{ {orig_name} as {type_name} }} from \"{package_name}\";",
                );
            }
            // TODO: Is this necessary?
            // self.src.push_str(&format!("export {{ {} }};\n", type_name));
        } else {
            self.docs(docs);
            self.src.push_str(&format!("export type {} = ", type_name));
            self.print_ty(ty);
            self.src.push_str(";\n");
        }
    }

    fn type_list(&mut self, _id: TypeId, name: &str, ty: &Type, docs: &Docs) {
        self.docs(docs);
        self.src
            .push_str(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_list(ty);
        self.src.push_str(";\n");
    }

    fn print_ty(&mut self, ty: &Type) {
        match ty {
            Type::Bool => self.src.push_str("boolean"),
            Type::U8
            | Type::S8
            | Type::U16
            | Type::S16
            | Type::U32
            | Type::S32
            | Type::F32
            | Type::F64 => self.src.push_str("number"),
            Type::U64 | Type::S64 => self.src.push_str("bigint"),
            Type::Char => self.src.push_str("string"),
            Type::String => self.src.push_str("string"),
            Type::Id(id) => {
                let ty = &self.resolve.types[*id];
                if let Some(name) = &ty.name {
                    return self.src.push_str(&name.to_upper_camel_case());
                }
                match &ty.kind {
                    TypeDefKind::Type(t) => self.print_ty(t),
                    TypeDefKind::Tuple(t) => self.print_tuple(t),
                    TypeDefKind::Record(_) => panic!("anonymous record"),
                    TypeDefKind::Flags(_) => panic!("anonymous flags"),
                    TypeDefKind::Enum(_) => panic!("anonymous enum"),
                    TypeDefKind::Option(t) => {
                        if maybe_null(self.resolve, t) {
                            *self.needs_ty_option = true;
                            self.src.push_str("Option<");
                            self.print_ty(t);
                            self.src.push_str(">");
                        } else {
                            self.print_ty(t);
                            self.src.push_str(" | undefined");
                        }
                    }
                    TypeDefKind::Result(r) => {
                        *self.needs_ty_result = true;
                        self.src.push_str("Result<");
                        self.print_optional_ty(r.ok.as_ref());
                        self.src.push_str(", ");
                        self.print_optional_ty(r.err.as_ref());
                        self.src.push_str(">");
                    }
                    TypeDefKind::Variant(_) => panic!("anonymous variant"),
                    TypeDefKind::List(v) => self.print_list(v),
                    TypeDefKind::Future(_) => todo!("anonymous future"),
                    TypeDefKind::Stream(_) => todo!("anonymous stream"),
                    TypeDefKind::Unknown => unreachable!(),
                    TypeDefKind::Resource => todo!(),
                    TypeDefKind::Handle(h) => {
                        let ty = match h {
                            Handle::Own(r) => r,
                            Handle::Borrow(r) => r,
                        };
                        let ty = &self.resolve.types[*ty];
                        if let Some(name) = &ty.name {
                            return self.src.push_str(&name.to_upper_camel_case());
                        }
                        panic!("anonymous resource handle");
                    }
                }
            }
        }
    }

    fn print_optional_ty(&mut self, ty: Option<&Type>) {
        match ty {
            Some(ty) => self.print_ty(ty),
            None => self.src.push_str("void"),
        }
    }

    fn print_list(&mut self, ty: &Type) {
        match array_ty(self.resolve, ty) {
            Some("Uint8Array") => self.src.push_str("Uint8Array"),
            Some(ty) => self.src.push_str(ty),
            None => {
                self.print_ty(ty);
                self.src.push_str("[]");
            }
        }
    }

    fn print_tuple(&mut self, tuple: &Tuple) {
        self.src.push_str("[");
        for (i, ty) in tuple.types.iter().enumerate() {
            if i > 0 {
                self.src.push_str(", ");
            }
            self.print_ty(ty);
        }
        self.src.push_str("]");
    }
}
