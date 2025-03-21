use crate::files::Files;
use crate::function_bindgen::{array_ty, as_nullable, maybe_null};
use crate::names::{is_js_identifier, maybe_quote_id, LocalNames, RESERVED_KEYWORDS};
use crate::source::Source;
use crate::{dealias, uwrite, uwriteln};
use anyhow::bail;
use heck::*;
use indexmap::map::Entry;
use indexmap::IndexMap;
use std::fmt::Write;
use wit_parser::*;

struct TsStubgen<'a> {
    resolve: &'a Resolve,
    files: &'a mut Files,
    world: &'a World,
}

pub fn ts_stubgen(resolve: &Resolve, id: WorldId, files: &mut Files) -> anyhow::Result<()> {
    let world = &resolve.worlds[id];
    let mut bindgen = TsStubgen {
        resolve,
        files,
        world,
    };

    let mut world_types: Vec<TypeId> = Vec::new();

    {
        let mut import_interface: IndexMap<String, InterfaceId> = IndexMap::new();

        for (name, import) in world.imports.iter() {
            match import {
                WorldItem::Function(_) => match name {
                    // Happens with `using` in world.
                    WorldKey::Name(name) => {
                        bail!("Function imported by name not implemented {name}");
                    }
                    WorldKey::Interface(id) => {
                        let import_specifier = resolve.id_of(*id).unwrap();
                        match import_interface.entry(import_specifier) {
                            Entry::Vacant(entry) => {
                                entry.insert(*id);
                            }
                            Entry::Occupied(_) => {
                                unreachable!(
                                    "multiple imports of the same interface: {import_specifier}",
                                    import_specifier = resolve.id_of(*id).unwrap()
                                );
                            }
                        }
                    }
                },
                WorldItem::Interface { .. } => match name {
                    // TODO: Is this even possible?
                    WorldKey::Name(name) => {
                        bail!("Interface imported by name not implemented {name}");
                    }
                    WorldKey::Interface(id) => {
                        let import_specifier = resolve.id_of(*id).unwrap();
                        match import_interface.entry(import_specifier) {
                            Entry::Vacant(entry) => {
                                entry.insert(*id);
                            }
                            Entry::Occupied(_) => {
                                unreachable!(
                                    "multiple imports of the same interface: {import_specifier}",
                                    import_specifier = resolve.id_of(*id).unwrap()
                                );
                            }
                        }
                    }
                },

                // `use` statement in world will be considered `WorldItem::Type`
                // type declaration (record, enum, etc. ) in world will also be considered `WorldItem::Type`
                WorldItem::Type(tid) => {
                    world_types.push(*tid);
                }
            }
        }

        bindgen.import_interfaces(import_interface.values().copied());
    }

    {
        let mut export_interfaces: Vec<ExportInterface> = Vec::new();
        let mut export_functions: Vec<ExportFunction> = Vec::new();

        for (name, export) in world.exports.iter() {
            match export {
                WorldItem::Function(f) => {
                    let export_name = match name {
                        WorldKey::Name(export_name) => export_name,
                        WorldKey::Interface(_) => {
                            unreachable!("world function export with interface")
                        }
                    };
                    let export_name = export_name.to_lower_camel_case();
                    export_functions.push(ExportFunction {
                        export_name,
                        func: f,
                    });
                }
                WorldItem::Interface { id, .. } => {
                    let id = *id;
                    if let WorldKey::Name(name) = name {
                        export_interfaces.push(ExportInterface {
                            name: name.clone(),
                            id,
                        })
                    } else {
                        let interface = &resolve.interfaces[id];
                        let name = interface.name.as_ref().expect("interface has name").clone();
                        export_interfaces.push(ExportInterface {
                            name: name.clone(),
                            id,
                        })
                    }
                }

                WorldItem::Type(_) => {
                    unreachable!(
                        "type export not supported. only functions and interfaces can be exported."
                    )
                }
            }
        }

        bindgen.process_exports(&world_types, &export_functions, &export_interfaces);

        Ok(())
    }
}

struct ExportInterface {
    name: String,
    id: InterfaceId,
}

struct ExportFunction<'a> {
    export_name: String,
    func: &'a Function,
}

impl<'a> TsStubgen<'a> {
    fn import_interfaces(&mut self, ifaces: impl Iterator<Item = InterfaceId>) {
        for id in ifaces {
            let name = self.resolve.interfaces[id].name.as_ref().unwrap();
            self.generate_interface(name, id);
        }
    }

    fn process_exports(
        &mut self,
        types: &[TypeId],
        funcs: &[ExportFunction],
        interfaces: &[ExportInterface],
    ) {
        let mut gen = TsInterface::new(self.resolve);

        // Type defs must be first, because they can generate imports.
        for tid in types {
            let tdef = &self.resolve.types[*tid];
            match tdef.kind {
                TypeDefKind::Resource => {}
                _ => {
                    gen.type_def(*tid, None, None);
                }
            }
        }

        let mut resources: IndexMap<TypeId, ResourceExport> = IndexMap::new();

        struct ResourceExport<'a> {
            ident: String,
            ident_static: String,
            ident_instance: String,
            functions: Vec<&'a Function>,
        }

        for iface in interfaces {
            let ExportInterface { name, id } = iface;
            let id = *id;
            let iface = &self.resolve.interfaces[id];

            uwriteln!(
                gen.src,
                "export interface {} {{",
                AsUpperCamelCase(name.as_str())
            );

            for (_name, func) in iface.functions.iter() {
                match func.kind {
                    FunctionKind::Freestanding => {
                        gen.ts_import_func(func, false);
                    }
                    FunctionKind::Method(tid)
                    | FunctionKind::Static(tid)
                    | FunctionKind::Constructor(tid) => match resources.entry(tid) {
                        Entry::Occupied(mut e) => {
                            let resource = e.get_mut();
                            resource.functions.push(func);
                        }
                        Entry::Vacant(e) => {
                            let ident = {
                                let resource = &self.resolve.types[tid];
                                resource.name.as_ref().unwrap().to_upper_camel_case()
                            };
                            let ident_static = format!("{}Static", ident);
                            let ident_instance = format!("{}Instance", ident);
                            let resource = e.insert(ResourceExport {
                                ident,
                                ident_static,
                                ident_instance,
                                functions: vec![func],
                            });
                            uwriteln!(gen.src, "{}: {}", resource.ident, resource.ident_static);
                        }
                    },
                }
            }

            uwriteln!(gen.src, "}}");
            gen.types(id);
        }

        let mut world_src = gen.finish();

        {
            let src = &mut world_src;

            if !resources.is_empty() {
                uwriteln!(src, "")
            }

            // Replace ident with ident_base in each of the signatures.

            for (_, resource) in resources {
                let ResourceExport {
                    ident,
                    ident_static,
                    ident_instance,
                    functions,
                } = resource;

                let (method_funcs, static_func): (Vec<&Function>, Vec<&Function>) = functions
                    .iter()
                    .partition(|f| matches!(f.kind, FunctionKind::Method(_)));

                uwriteln!(src, "export interface {ident_static} {{");
                for func in static_func {
                    match func.kind {
                        FunctionKind::Static(_) => {
                            let signature = with_printer(self.resolve, |mut p| {
                                p.ts_func_signature(func);
                            });
                            let signature = signature.replace(&ident, &ident_instance);
                            let f_name = AsLowerCamelCase(func.item_name());
                            uwriteln!(src, "{f_name}{signature},");
                        }
                        FunctionKind::Constructor(_) => {
                            let params = with_printer(self.resolve, |mut p| {
                                p.ts_func_params(func);
                            });
                            let params = params.replace(&ident, &ident_instance);
                            uwriteln!(src, "new{params}: {ident_instance},",);
                        }
                        _ => unreachable!("non static resource function"),
                    }
                }
                uwriteln!(src, "}}");

                uwriteln!(src, "export interface {ident_instance} {{");
                for func in method_funcs {
                    let params = with_printer(self.resolve, |mut p| {
                        p.ts_func_signature(func);
                    });
                    let params = params.replace(&ident, &ident_instance);
                    let f_name = AsLowerCamelCase(func.item_name());
                    uwriteln!(src, "{f_name}{params},");
                }
                uwriteln!(src, "}}");
            }
        }

        let camel_world = AsUpperCamelCase(self.world.name.as_str());
        let kebab_world = AsKebabCase(self.world.name.as_str());

        uwriteln!(world_src, "");
        uwriteln!(world_src, "export interface {camel_world}World {{",);
        for ExportInterface { name, .. } in interfaces {
            let lower_camel = AsLowerCamelCase(name);
            let upper_camel = AsUpperCamelCase(name);
            uwriteln!(world_src, "{lower_camel}: {upper_camel},",);
        }

        for func in funcs {
            match func.func.kind {
                FunctionKind::Freestanding => {
                    let signature = with_printer(self.resolve, |mut p| {
                        p.ts_func_signature(func.func);
                    });

                    uwriteln!(
                        world_src,
                        "{export_name}{signature},",
                        export_name = func.export_name,
                    );
                }
                // TODO: Is this even possible?
                FunctionKind::Method(_)
                | FunctionKind::Static(_)
                | FunctionKind::Constructor(_) => {
                    unreachable!("cannot export resource in world");
                }
            }
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

        let mut gen = TsInterface::new(self.resolve);

        uwriteln!(gen.src, "declare module \"{package_name}\" {{");

        gen.types(id);

        for (_, func) in self.resolve.interfaces[id].functions.iter() {
            gen.ts_import_func(func, true);
        }

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
struct TsInterface<'a> {
    src: Source,
    resolve: &'a Resolve,
    needs_ty_option: bool,
    needs_ty_result: bool,
    local_names: LocalNames,
    // Resources are aggregated, because the only way to get metadata for resource is by looking up their functions.
    resources: IndexMap<&'a str, ResourceImport<'a>>,
}

impl<'a> TsInterface<'a> {
    fn new(resolve: &'a Resolve) -> Self {
        TsInterface {
            src: Source::default(),
            resources: IndexMap::default(),
            local_names: LocalNames::default(),
            resolve,
            needs_ty_option: false,
            needs_ty_result: false,
        }
    }

    fn finish(mut self) -> Source {
        let mut printer = Printer {
            resolve: self.resolve,
            src: &mut self.src,
            needs_ty_option: &mut self.needs_ty_option,
            needs_ty_result: &mut self.needs_ty_result,
        };

        for (name, resource) in self.resources.iter() {
            uwriteln!(printer.src, "export class {} {{", AsUpperCamelCase(name));
            printer.resource_import(resource);
            uwriteln!(printer.src, "}}")
        }

        self.post_types();

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
            self.type_def(*id, Some(name), Some(iface_id));
        }
    }

    fn type_def(&mut self, id: TypeId, name: Option<&str>, parent_id: Option<InterfaceId>) {
        let ty = &self.resolve.types[id];
        let name = name.unwrap_or_else(|| ty.name.as_ref().expect("type name"));
        let mut printer = self.as_printer();
        match &ty.kind {
            TypeDefKind::Record(record) => printer.type_record(id, name, record, &ty.docs),
            TypeDefKind::Flags(flags) => printer.type_flags(id, name, flags, &ty.docs),
            TypeDefKind::Tuple(tuple) => printer.type_tuple(id, name, tuple, &ty.docs),
            TypeDefKind::Enum(enum_) => printer.type_enum(id, name, enum_, &ty.docs),
            TypeDefKind::Variant(variant) => printer.type_variant(id, name, variant, &ty.docs),
            TypeDefKind::Option(t) => printer.type_option(id, name, t, &ty.docs),
            TypeDefKind::Result(r) => printer.type_result(id, name, r, &ty.docs),
            TypeDefKind::List(t) => printer.type_list(id, name, t, &ty.docs),
            TypeDefKind::Type(t) => self
                .as_printer()
                .type_alias(id, name, t, parent_id, &ty.docs),
            TypeDefKind::Future(_) => todo!("generate for future"),
            TypeDefKind::Stream(_) => todo!("generate for stream"),
            TypeDefKind::Handle(_) => todo!("generate for handle"),
            // Resources are handled by Self::ts_func
            TypeDefKind::Resource => {}
            TypeDefKind::Unknown => unreachable!(),
        }
    }

    fn ts_import_func(&mut self, func: &'a Function, declaration: bool) {
        // Resource conversion is delayed until because we need to aggregate all resource functions
        // before creating the class.
        if let FunctionKind::Method(ty) | FunctionKind::Static(ty) | FunctionKind::Constructor(ty) =
            func.kind
        {
            let ty = &self.resolve.types[ty];
            let resource = ty.name.as_ref().unwrap();
            match self.resources.entry(resource) {
                Entry::Occupied(mut e) => {
                    e.get_mut().push_func(func);
                }
                Entry::Vacant(e) => {
                    let r = e.insert(Default::default());
                    r.push_func(func);
                }
            }
            return;
        };

        self.as_printer().docs(&func.docs);

        let name = func.item_name().to_lower_camel_case();

        if declaration {
            match func.kind {
                FunctionKind::Freestanding => {
                    if is_js_identifier(&name) {
                        uwrite!(self.src, "export function {name}",);
                    } else {
                        let (local_name, _) = self.local_names.get_or_create(&name, &name);
                        uwriteln!(self.src, "export {{ {local_name} as {name} }};",);
                        uwrite!(self.src, "declare function {local_name}",);
                    };
                }
                _ => unreachable!("resource functions should be delayed"),
            }
        } else {
            if is_js_identifier(&name) {
                self.src.push_str(&name);
            } else {
                uwrite!(self.src, "'{name}'");
            }
        }

        self.as_printer().ts_func_signature(func);

        let end_character = if declaration { ";" } else { "," };
        self.src.push_str(end_character);
        self.src.push_str("\n");
    }

    fn post_types(&mut self) {
        if self.needs_ty_option {
            self.src
                .push_str("export type Option<T> = { tag: 'none' } | { tag: 'some', val: T };\n");
        }
        if self.needs_ty_result {
            self.src.push_str(
                "export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };\n",
            );
        }
    }
}

#[derive(Debug, Default)]
struct ResourceImport<'a> {
    constructor: Option<&'a Function>,
    method_funcs: Vec<&'a Function>,
    static_funcs: Vec<&'a Function>,
}

impl<'a> ResourceImport<'a> {
    fn push_func(&mut self, func: &'a Function) {
        match func.kind {
            FunctionKind::Method(_) => {
                self.method_funcs.push(func);
            }
            FunctionKind::Static(_) => self.static_funcs.push(func),
            FunctionKind::Constructor(_) => {
                assert!(
                    self.constructor.is_none(),
                    "wit resources can only have one constructor"
                );
                self.constructor = Some(func);
            }
            FunctionKind::Freestanding => {
                unreachable!("resource cannot have freestanding function")
            }
        }
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

struct Printer<'a> {
    resolve: &'a Resolve,
    src: &'a mut Source,
    needs_ty_option: &'a mut bool,
    needs_ty_result: &'a mut bool,
}

fn with_printer(resolve: &Resolve, f: impl FnOnce(Printer)) -> String {
    let mut src = Source::default();
    let mut needs_ty_option = false;
    let mut needs_ty_result = false;

    let printer = Printer {
        resolve,
        src: &mut src,
        needs_ty_option: &mut needs_ty_option,
        needs_ty_result: &mut needs_ty_result,
    };

    f(printer);

    src.into()
}

impl<'a> Printer<'a> {
    fn resource_import(&mut self, resource: &ResourceImport) {
        if let Some(func) = resource.constructor {
            self.docs(&func.docs);
            self.src.push_str("constructor");
            self.ts_func_signature(func);
            self.src.push_str("\n");
        }

        for func in resource.method_funcs.iter() {
            self.docs(&func.docs);
            let name = func.item_name().to_lower_camel_case();
            if is_js_identifier(&name) {
                uwrite!(self.src, "{name}");
            } else {
                uwrite!(self.src, "'{name}'",);
            }
            self.ts_func_signature(func);
            self.src.push_str(";\n");
        }

        for func in resource.static_funcs.iter() {
            self.docs(&func.docs);
            let name = func.item_name().to_lower_camel_case();
            if is_js_identifier(&name) {
                uwrite!(self.src, "static {name}");
            } else {
                uwrite!(self.src, "static '{name}'");
            }
            self.ts_func_signature(func);
            self.src.push_str(";\n");
        }
    }

    fn docs_raw(&mut self, docs: &str) {
        self.src.push_str("/**\n");
        for line in docs.lines() {
            uwriteln!(self.src, " * {}", line);
        }
        self.src.push_str(" */\n");
    }

    fn docs(&mut self, docs: &Docs) {
        if let Some(docs) = &docs.contents {
            self.docs_raw(docs);
        }
    }

    fn ts_func_signature(&mut self, func: &Function) {
        self.ts_func_params(func);

        if matches!(func.kind, FunctionKind::Constructor(_)) {
            return;
        }

        self.src.push_str(": ");

        if let Some((ok_ty, _)) = func.results.throws(self.resolve) {
            self.print_optional_ty(ok_ty);
        } else {
            match func.results.len() {
                0 => self.src.push_str("void"),
                1 => self.print_ty(func.results.iter_types().next().unwrap()),
                _ => {
                    self.src.push_str("[");
                    for (i, ty) in func.results.iter_types().enumerate() {
                        if i != 0 {
                            self.src.push_str(", ");
                        }
                        self.print_ty(ty);
                    }
                    self.src.push_str("]");
                }
            }
        }
    }

    fn ts_func_params(&mut self, func: &Function) {
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
            self.print_ty(ty);
        }

        self.src.push_str(")");
    }

    fn type_record(&mut self, _id: TypeId, name: &str, record: &Record, docs: &Docs) {
        self.docs(docs);
        uwriteln!(self.src, "export interface {} {{", AsUpperCamelCase(name));
        for field in record.fields.iter() {
            self.docs(&field.docs);
            let (option_str, ty) =
                as_nullable(self.resolve, &field.ty).map_or(("", &field.ty), |ty| ("?", ty));
            uwrite!(
                self.src,
                "{}{}: ",
                maybe_quote_id(&field.name.to_lower_camel_case()),
                option_str,
            );
            self.print_ty(ty);
            self.src.push_str(",\n");
        }
        self.src.push_str("}\n");
    }

    fn type_tuple(&mut self, _id: TypeId, name: &str, tuple: &Tuple, docs: &Docs) {
        self.docs(docs);
        uwrite!(self.src, "export type {} = ", name.to_upper_camel_case());
        self.print_tuple(tuple);
        self.src.push_str(";\n");
    }

    fn type_flags(&mut self, _id: TypeId, name: &str, flags: &Flags, docs: &Docs) {
        self.docs(docs);
        uwriteln!(
            self.src,
            "export interface {} {{",
            name.to_upper_camel_case()
        );
        for flag in flags.flags.iter() {
            self.docs(&flag.docs);
            uwriteln!(
                self.src,
                "{}?: boolean,",
                AsLowerCamelCase(flag.name.as_str())
            );
        }
        self.src.push_str("}\n");
    }

    fn type_variant(&mut self, _id: TypeId, name: &str, variant: &Variant, docs: &Docs) {
        self.docs(docs);
        uwrite!(self.src, "export type {} = ", AsUpperCamelCase(name));
        for (i, case) in variant.cases.iter().enumerate() {
            if i > 0 {
                self.src.push_str(" | ");
            }

            uwrite!(
                self.src,
                "{}{}",
                AsUpperCamelCase(name),
                AsUpperCamelCase(case.name.as_str()),
            );
        }
        self.src.push_str(";\n");
        for case in variant.cases.iter() {
            self.docs(&case.docs);
            uwriteln!(
                self.src,
                "export interface {}{} {{",
                AsUpperCamelCase(name),
                AsUpperCamelCase(case.name.as_str())
            );
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
        uwrite!(self.src, "export type {name} = ");
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
        uwrite!(self.src, "export type {name} = Result<");
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
            let orig_id = dealias(self.resolve, id);
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
        } else {
            self.docs(docs);
            uwrite!(self.src, "export type {type_name} = ");
            self.print_ty(ty);
            self.src.push_str(";\n");
        }
    }

    fn type_list(&mut self, _id: TypeId, name: &str, ty: &Type, docs: &Docs) {
        self.docs(docs);

        uwrite!(self.src, "export type {} = ", AsUpperCamelCase(name));
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
                            self.src.push_str(&name.to_upper_camel_case());
                        } else {
                            panic!("anonymous resource handle");
                        }
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
