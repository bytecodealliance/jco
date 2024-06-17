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

// IMPORTS ARE CONVERTED TO DECLARE MODULE

struct TsBindgen {
    /// The source code for the "main" file that's going to be created for the
    /// component we're generating bindings for. This is incrementally added to
    /// over time and primarily contains the main `instantiate` function as well
    /// as a type-description of the input/output interfaces.
    src: Source,

    interface_names: LocalNames,
    local_names: LocalNames,
}

pub fn ts_bindgen(resolve: &Resolve, id: WorldId, files: &mut Files) {
    let mut bindgen = TsBindgen {
        src: Source::default(),
        interface_names: LocalNames::default(),
        local_names: LocalNames::default(),
    };

    let world = &resolve.worlds[id];

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
                        // kebab name -> direct ns namespace import
                        bindgen.generate_interface(name, resolve, *id, files);
                    }
                    // namespaced ns:pkg/iface
                    // TODO: map support
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
                WorldItem::Type(tid) => {
                    let ty = &resolve.types[*tid];

                    let name = ty.name.as_ref().unwrap();

                    let mut gen = TsImport::new(resolve);
                    gen.docs(&ty.docs);
                    match &ty.kind {
                        TypeDefKind::Record(record) => {
                            gen.type_record(*tid, name, record, &ty.docs)
                        }
                        TypeDefKind::Flags(flags) => gen.type_flags(*tid, name, flags, &ty.docs),
                        TypeDefKind::Tuple(tuple) => gen.type_tuple(*tid, name, tuple, &ty.docs),
                        TypeDefKind::Enum(enum_) => gen.type_enum(*tid, name, enum_, &ty.docs),
                        TypeDefKind::Variant(variant) => {
                            gen.type_variant(*tid, name, variant, &ty.docs)
                        }
                        TypeDefKind::Option(t) => gen.type_option(*tid, name, t, &ty.docs),
                        TypeDefKind::Result(r) => gen.type_result(*tid, name, r, &ty.docs),
                        TypeDefKind::List(t) => gen.type_list(*tid, name, t, &ty.docs),
                        TypeDefKind::Type(t) => gen.type_alias(*tid, name, t, None, &ty.docs),
                        TypeDefKind::Future(_) => todo!("generate for future"),
                        TypeDefKind::Stream(_) => todo!("generate for stream"),
                        TypeDefKind::Unknown => unreachable!(),
                        TypeDefKind::Resource => todo!(),
                        TypeDefKind::Handle(_) => todo!(),
                    }
                    let output = gen.finish();
                    bindgen.src.push_str(&output);
                }
            }
        }

        for (_name, import_interfaces) in interface_imports {
            bindgen.import_interfaces(resolve, import_interfaces, files);
        }
    }

    {
        let mut world_exports: Vec<WorldExport> = Vec::new();

        for (name, export) in world.exports.iter() {
            match export {
                WorldItem::Function(f) => {
                    let export_name = match name {
                        WorldKey::Name(export_name) => export_name,
                        WorldKey::Interface(_) => unreachable!(),
                    };
                    world_exports.push(WorldExport::Func(export_name.to_lower_camel_case(), f));
                }
                WorldItem::Interface(id) => {
                    assert!(
                        matches!(name, WorldKey::Interface(_)),
                        "inline interface not supported"
                    );
                    let id = *id;
                    world_exports.push(WorldExport::Interface(id));

                    let i_face = &resolve.interfaces[id];

                    let mut gen = TsImport::new(resolve);

                    let name = i_face.name.as_ref().unwrap();

                    uwriteln!(
                        gen.src,
                        "export interface {name} {{",
                        name = name.to_upper_camel_case(),
                    );

                    for (_, func) in i_face.functions.iter() {
                        gen.ts_func(func, false, true);
                    }

                    gen.types(id);
                    gen.post_types();

                    let mut src = gen.finish();

                    uwriteln!(src, "}}");

                    bindgen.src.push_str(&src);
                }
                WorldItem::Type(_) => unimplemented!("type exports"),
            }
        }

        bindgen.process_exports(resolve, id, &world_exports, files, false);
    }

    // Add main source to files
    let camel = world.name.to_upper_camel_case();
    uwriteln!(bindgen.src, "export interface {camel} {{",);
    uwriteln!(bindgen.src, "}}");

    let name = world.name.to_kebab_case();
    files.push(&format!("{name}.d.ts"), bindgen.src.as_bytes());
}

enum WorldExport<'a> {
    Func(String, &'a Function),
    Interface(InterfaceId),
}

impl TsBindgen {
    fn import_interfaces(
        &mut self,
        resolve: &Resolve,
        ifaces: Vec<(String, InterfaceId)>,
        files: &mut Files,
    ) {
        for (_, id) in ifaces {
            let name = resolve.interfaces[id].name.as_ref().unwrap();
            self.generate_interface(name, resolve, id, files);
        }
    }

    fn process_exports(
        &mut self,
        resolve: &Resolve,
        _world: WorldId,
        exports: &[WorldExport],
        _files: &mut Files,
        declaration: bool,
    ) {
        let mut gen = TsImport::new(resolve);
        for export in exports {
            match export {
                WorldExport::Func(_name, func) => {
                    gen.ts_func(func, false, declaration);
                }
                WorldExport::Interface(id) => {
                    // let name = resolve.interfaces[*id].name.as_ref().unwrap();
                    // self.generate_interface(name, resolve, *id, _files);
                }
            }
        }
        let src = gen.finish();
        self.src.push_str(&src);
    }

    fn generate_interface(
        &mut self,
        name: &str,
        resolve: &Resolve,
        id: InterfaceId,
        files: &mut Files,
    ) -> String {
        let id_name = resolve.id_of(id).unwrap_or_else(|| name.to_string());
        let goal_name = interface_goal_name(&id_name);
        let goal_name_kebab = goal_name.to_kebab_case();
        let file_name = &format!("interfaces/{}.d.ts", goal_name_kebab);
        let (name, iface_exists) = self.interface_names.get_or_create(file_name, &goal_name);

        let camel = name.to_upper_camel_case();

        let (local_name, local_exists) = self.local_names.get_or_create(file_name, &goal_name);
        let local_name = local_name.to_upper_camel_case();

        let package_name = interface_module_name(resolve, id);

        if !local_exists {
            uwriteln!(
                self.src,
                "import {{ {} }} from '{package_name}';",
                if camel == local_name {
                    camel.to_string()
                } else {
                    format!("{camel} as {local_name}")
                },
            );
        }

        if iface_exists {
            return local_name;
        }

        let mut gen = TsImport::new(resolve);

        uwriteln!(gen.src, "declare module \"{package_name}\" {{");
        for (_, func) in resolve.interfaces[id].functions.iter() {
            gen.ts_func(func, false, true);
        }

        gen.types(id);
        gen.post_types();

        let mut src = gen.finish();

        uwriteln!(src, "}}");

        files.push(file_name, src.as_bytes());

        local_name
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

    fn types(&mut self, iface_id: InterfaceId) {
        let iface = &self.resolve().interfaces[iface_id];
        for (name, id) in iface.types.iter() {
            let ty = &self.resolve().types[*id];
            match &ty.kind {
                TypeDefKind::Record(record) => self.type_record(*id, name, record, &ty.docs),
                TypeDefKind::Flags(flags) => self.type_flags(*id, name, flags, &ty.docs),
                TypeDefKind::Tuple(tuple) => self.type_tuple(*id, name, tuple, &ty.docs),
                TypeDefKind::Enum(enum_) => self.type_enum(*id, name, enum_, &ty.docs),
                TypeDefKind::Variant(variant) => self.type_variant(*id, name, variant, &ty.docs),
                TypeDefKind::Option(t) => self.type_option(*id, name, t, &ty.docs),
                TypeDefKind::Result(r) => self.type_result(*id, name, r, &ty.docs),
                TypeDefKind::List(t) => self.type_list(*id, name, t, &ty.docs),
                TypeDefKind::Type(t) => self.type_alias(*id, name, t, Some(iface_id), &ty.docs),
                TypeDefKind::Future(_) => todo!("generate for future"),
                TypeDefKind::Stream(_) => todo!("generate for stream"),
                TypeDefKind::Unknown => unreachable!(),
                TypeDefKind::Resource => {}
                TypeDefKind::Handle(_) => todo!(),
            }
        }
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
                            self.needs_ty_option = true;
                            self.src.push_str("Option<");
                            self.print_ty(t);
                            self.src.push_str(">");
                        } else {
                            self.print_ty(t);
                            self.src.push_str(" | undefined");
                        }
                    }
                    TypeDefKind::Result(r) => {
                        self.needs_ty_result = true;
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

        iface.docs(&func.docs);

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

        let end_character = if declaration { ';' } else { ',' };

        iface.src.push_str("(");

        let param_start = match &func.kind {
            FunctionKind::Freestanding => 0,
            FunctionKind::Method(_) => 1,
            FunctionKind::Static(_) => 0,
            FunctionKind::Constructor(_) => 0,
        };

        for (i, (name, ty)) in func.params[param_start..].iter().enumerate() {
            if i > 0 {
                iface.src.push_str(", ");
            }
            let mut param_name = name.to_lower_camel_case();
            if RESERVED_KEYWORDS
                .binary_search(&param_name.as_str())
                .is_ok()
            {
                param_name = format!("{}_", param_name);
            }
            iface.src.push_str(&param_name);
            iface.src.push_str(": ");
            iface.print_ty(ty);
        }

        iface.src.push_str(")");
        if matches!(func.kind, FunctionKind::Constructor(_)) {
            iface.src.push_str("\n");
            return;
        }
        iface.src.push_str(": ");

        if let Some((ok_ty, _)) = func.results.throws(iface.resolve) {
            iface.print_optional_ty(ok_ty);
        } else {
            match func.results.len() {
                0 => iface.src.push_str("void"),
                1 => iface.print_ty(func.results.iter_types().next().unwrap()),
                _ => {
                    iface.src.push_str("[");
                    for (i, ty) in func.results.iter_types().enumerate() {
                        if i != 0 {
                            iface.src.push_str(", ");
                        }
                        iface.print_ty(ty);
                    }
                    iface.src.push_str("]");
                }
            }
        }
        iface.src.push_str(format!("{}\n", end_character).as_str());
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

    fn resolve(&self) -> &'a Resolve {
        self.resolve
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
            self.needs_ty_option = true;
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
        self.needs_ty_result = true;
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

struct TsExport<'a> {
    src: Source,
    resolve: &'a Resolve,
    needs_ty_option: bool,
    needs_ty_result: bool,
    local_names: LocalNames,
}

impl<'a> TsExport<'a> {
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
}
