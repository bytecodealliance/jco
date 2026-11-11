use std::collections::btree_map::Entry;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fmt::Write;
use std::rc::Rc;

use anyhow::{Context as _, Result};
use heck::{ToKebabCase, ToLowerCamelCase, ToUpperCamelCase};
use log::debug;
use wit_bindgen_core::wit_parser::{
    Case, Docs, Enum, Flags, Function, FunctionKind, Handle, InterfaceId, PackageName, Record,
    Resolve, Result_, Stability, Tuple, Type, TypeDef, TypeDefKind, TypeId, TypeOwner, Variant,
    World, WorldId, WorldItem, WorldKey,
};

use crate::files::Files;
use crate::function_bindgen::{as_nullable, js_array_ty, maybe_null};
use crate::names::{
    LocalNames, RESERVED_KEYWORDS, is_valid_js_identifier, js_string_literal, maybe_quote_id,
    static_member_name,
};
use crate::source::Source;
use crate::transpile_bindgen::{AsyncMode, InstantiationMode, TranspileOpts, parse_world_key};
use crate::{
    FunctionIdentifier, TypeGenerationConfig, dealias, feature_gate_allowed, get_thrown_type,
    requires_async_porcelain, uwrite, uwriteln,
};

/// TypeScript declaration for the `Option<T>` helper type alias used to
/// represent WIT `option<T>` values that cannot be flattened to `T | undefined`.
/// It is declared as `name`, which is `Option` unless a WIT type of the module
/// has that name (see [`ModuleNames::option_alias`]).
///
/// This is always emitted at the top level of a module (or `.d.ts` file), never
/// inside an `export interface { ... }` block, since a type-alias declaration is
/// not a valid interface member
/// (see https://github.com/bytecodealliance/jco/issues/1708).
fn ts_option_type_alias(name: &str) -> String {
    format!("export type {name}<T> = {{ tag: 'none' }} | {{ tag: 'some', val: T }};\n")
}

/// TypeScript declaration for the `Result<T, E>` helper type alias used to
/// represent WIT `result<T, E>` values. Emitted at the top level for the same
/// reason as [`ts_option_type_alias`].
///
/// An arm without a payload (e.g. the `ok` arm of `result<_, E>`) is typed with `void`.
/// With `optional_payloads`, the `val` of such an arm is optional, so that
/// `{ tag: 'ok' }` is a complete value.
// TODO(breaking): declare the payloads as optional unconditionally at the next
// major release. The conditional types that this takes stay unresolved for the
// type parameters of generic code, which then can no longer narrow a
// `Result<T, E>` by its tag, so existing generic helpers would stop compiling.
fn ts_result_type_alias(name: &str, optional_payloads: bool) -> String {
    if optional_payloads {
        format!(
            "export type {name}<T, E> = \
             ([T] extends [void] ? {{ tag: 'ok', val?: T }} : {{ tag: 'ok', val: T }}) | \
             ([E] extends [void] ? {{ tag: 'err', val?: E }} : {{ tag: 'err', val: E }});\n"
        )
    } else {
        format!("export type {name}<T, E> = {{ tag: 'ok', val: T }} | {{ tag: 'err', val: E }};\n")
    }
}

/// The names that the declarations of one generated module bind.
///
/// A WIT type may be named after a global that the generated declarations
/// refer to, such as `array`, `promise` or `symbol`, or after one of the helper
/// type aliases. Its declaration shadows that name in the whole module.
#[derive(Default)]
struct ModuleNames {
    /// The declared names, each in the form in which it is declared.
    declared: BTreeSet<String>,
    /// The names of variant case interfaces (see [`variant_case_name`]) that
    /// are not declared, because a WIT type or another variant case of the
    /// module has the same name. Such a case is inlined in its variant's union.
    inlined_variant_cases: BTreeSet<String>,
}

impl ModuleNames {
    /// The names bound by the declarations of `types`, the named types of an
    /// interface or of a world.
    fn of_types<'t>(
        resolve: &Resolve,
        types: impl Iterator<Item = (&'t str, TypeId)>,
        variants_inline_cases: bool,
    ) -> Self {
        let mut declared = BTreeSet::new();
        let mut variant_cases: BTreeMap<String, usize> = BTreeMap::new();
        for (name, id) in types {
            declared.insert(name.to_upper_camel_case());
            if let TypeDefKind::Variant(variant) = &resolve.types[id].kind
                && !variants_inline_cases
            {
                for case in &variant.cases {
                    *variant_cases
                        .entry(variant_case_name(name, &case.name))
                        .or_default() += 1;
                }
            }
        }

        let mut inlined_variant_cases = BTreeSet::new();
        for (case_name, count) in variant_cases {
            if count > 1 || declared.contains(&case_name) {
                inlined_variant_cases.insert(case_name);
            } else {
                declared.insert(case_name);
            }
        }
        ModuleNames {
            declared,
            inlined_variant_cases,
        }
    }

    /// A reference to the global `name`, which goes through `globalThis` if a
    /// declaration of the module shadows the global.
    fn global(&self, name: &str) -> String {
        if self.declared.contains(name) {
            format!("globalThis.{name}")
        } else {
            name.to_string()
        }
    }

    /// The name of a helper type alias that is declared as `goal` unless the
    /// module already declares that name.
    fn helper_alias(&self, goal: &str) -> String {
        let mut name = goal.to_string();
        while self.declared.contains(&name) {
            name.push('_');
        }
        name
    }

    /// The name of the `Option<T>` helper type alias.
    fn option_alias(&self) -> String {
        self.helper_alias("Option")
    }

    /// The name of the `Result<T, E>` helper type alias.
    fn result_alias(&self) -> String {
        self.helper_alias("Result")
    }
}

/// The name of the interface declared for the case `case` of the variant `variant`.
fn variant_case_name(variant: &str, case: &str) -> String {
    format!("{variant}_{case}").to_upper_camel_case()
}

struct TsBindgen {
    /// The source code for the "main" file that's going to be created for the
    /// component we're generating bindings for. This is incrementally added to
    /// over time and primarily contains the main `instantiate` function as well
    /// as a type-description of the input/output interfaces.
    src: Source,

    interface_names: LocalNames,
    local_names: LocalNames,

    /// Stems of the declaration files of the world's interfaces.
    interface_file_stems: Rc<InterfaceFileStems>,
    /// The names bound by the declarations of the world's own types.
    world_names: Rc<ModuleNames>,
    /// The interfaces that the world exports.
    exported_interfaces: Rc<BTreeSet<InterfaceId>>,
    /// Whether the bindings throw the error of a result as it is, rather than
    /// as the payload of an error.
    raw_result_errors: bool,
    /// Whether the `val` of a `result` arm without a payload is optional.
    optional_result_payloads: bool,
    type_generation: TypeGenerationConfig,
    /// Declaration files of the import side of interfaces.
    import_side_files: BTreeSet<String>,
    /// Unversioned compatibility paths already assigned to an interface.
    legacy_interface_files: BTreeSet<String>,
    /// The export-side declarations of interfaces, keyed by the declaration
    /// file that the import side of the same interface has or would have.
    export_side_declarations: BTreeMap<String, ExportSideDeclaration>,

    /// The names under which the world's own types are declared, in order.
    world_type_names: Vec<String>,
    /// Ambient module declarations of the functions that a guest world
    /// imports. A guest imports each as the default export of the module
    /// named after the import.
    guest_import_modules: Source,

    /// TypeScript definitions which will become the import object
    import_object: Source,
    /// TypeScript definitions which will become the export object
    export_object: Source,

    /// Whether the world's exported freestanding functions require the
    /// top-level `Option<T>` / `Result<T, E>` helper type aliases.
    ///
    /// These helper aliases must always be emitted at the top level, never
    /// inside the `export interface {World} { ... }` wrapper used in
    /// instantiation mode (see https://github.com/bytecodealliance/jco/issues/1708).
    needs_ty_option: bool,
    needs_ty_result: bool,

    /// Whether to generate types for a guest module.
    ///
    /// For guest types, ambient modules are generated and imported using `ns:pkg/iface`.
    /// For host types, concrete modules are generated and imported using `./interfaces/{id}.js`.
    is_guest: bool,
    flags_as_bigint: bool,
    variants_inline_cases: bool,
    use_namespace_objects: bool,
    enum_values_screaming_snake_case: bool,

    async_imports: HashSet<String>,
    async_exports: HashSet<String>,

    /// A set of all interface files that are referenced by the generated
    /// definitions. This is used to generate `/// <reference path="..." />`
    /// directives at the top of the file.
    references: BTreeSet<String>,
}

/// The export-side declaration of an interface.
struct ExportSideDeclaration {
    /// The ID of the interface, or the name it is exported under if it has none.
    id_name: String,
    /// The stem of the declaration file, relative to the directory of
    /// export-side declarations.
    file_stem: String,
}

/// Directory of the declarations of interfaces, relative to the world's declaration.
const INTERFACES_DIR: &str = "interfaces";

/// Directory of the export-side declarations of interfaces, relative to [`INTERFACES_DIR`].
const EXPORTS_DIR: &str = "exports";

/// The name of the ambient module that declares the export side of an
/// interface for a guest.
///
/// A guest imports an interface by its ID, so the declarations of what the
/// guest must provide for the same interface need a module name of their own.
fn guest_export_module(id_name: &str) -> String {
    format!("jco:exports/{id_name}")
}

/// Information related to a generated type (import, function, etc)
#[derive(Debug, Clone, PartialEq, Eq, Default)]
struct GeneratedTypeMeta {
    /// Whether this type was generated as an export (or when `false`, an import)
    is_export: bool,
}

#[allow(unused)]
impl GeneratedTypeMeta {
    #[must_use]
    fn is_import(&self) -> bool {
        !self.is_export
    }
    #[must_use]
    fn is_export(&self) -> bool {
        self.is_export
    }
}

/// Used to generate a `*.d.ts` file for each imported and exported interface for
/// a component.
///
/// This generated source does not contain any actual JS runtime code, it's just
/// typescript definitions.
struct TsInterface<'a> {
    src: Source,
    is_root: bool,
    is_guest: bool,
    flags_as_bigint: bool,
    variants_inline_cases: bool,
    use_namespace_objects: bool,
    enum_values_screaming_snake_case: bool,
    resolve: &'a Resolve,
    /// Stems of the declaration files of the world's interfaces.
    interface_file_stems: Rc<InterfaceFileStems>,
    /// The names bound by the declarations of the module being generated.
    names: Rc<ModuleNames>,
    /// JSDoc tags for the item that is declared next, such as its stability.
    doc_tags: Vec<String>,
    /// The interface whose functions throw the errors of their results as
    /// classes that the interface exports (see [`crate::result_error_class`]),
    /// if this declares the side of one that a host calls.
    error_class_interface: Option<InterfaceId>,
    /// The error classes that the declared functions throw, by name.
    error_classes: BTreeMap<String, crate::ResultErrorClass>,
    /// Whether the bindings throw the error of a result as it is, rather than
    /// as the payload of an error.
    raw_result_errors: bool,
    /// Whether the `val` of a `result` arm without a payload is optional.
    optional_result_payloads: bool,
    type_generation: TypeGenerationConfig,
    /// The documentation comment of the class, if this declares the functions of a resource.
    class_docs: Source,
    /// The name that identifies the resource to the type checker,
    /// if this declares the functions of a resource.
    resource_brand: String,
    /// Whether the functions declared here are only ever implemented by the host.
    ///
    /// The host may return the result of such a function directly even if the
    /// function is async, as the generated bindings await whatever it returns.
    host_implemented: bool,
    /// Whether this declares the export side of an interface.
    is_export_side: bool,
    /// The interfaces that the world exports.
    exported_interfaces: Rc<BTreeSet<InterfaceId>>,
    has_constructor: bool,
    needs_ty_option: bool,
    needs_ty_result: bool,
    needs_module_end: bool,
    local_names: LocalNames,
    resources: BTreeMap<String, (GeneratedTypeMeta, TsInterface<'a>)>,
    references: BTreeSet<String>,
}

#[allow(clippy::too_many_arguments)]
pub fn ts_bindgen(
    name: &str,
    resolve: &Resolve,
    id: WorldId,
    opts: &TranspileOpts,
    call_tracking: bool,
    optional_result_payloads: bool,
    type_generation: TypeGenerationConfig,
    files: &mut Files,
) -> Result<()> {
    let (async_imports, async_exports) = match opts.async_mode.clone() {
        None | Some(AsyncMode::Sync) => (Default::default(), Default::default()),
        Some(AsyncMode::JavaScriptPromiseIntegration { imports, exports }) => {
            (imports.into_iter().collect(), exports.into_iter().collect())
        }
    };

    let mut bindgen = TsBindgen {
        src: Source::default(),
        interface_names: LocalNames::default(),
        local_names: LocalNames::default(),
        interface_file_stems: Rc::new(interface_file_stems(resolve, id)),
        world_names: Rc::new(ModuleNames::of_types(
            resolve,
            resolve.worlds[id]
                .imports
                .values()
                .filter_map(|item| match item {
                    WorldItem::Type { id, .. } => {
                        let name = resolve.types[*id].name.as_deref()?;
                        Some((name, *id))
                    }
                    _ => None,
                }),
            opts.variants_inline_cases,
        )),
        exported_interfaces: Rc::new(
            resolve.worlds[id]
                .exports
                .values()
                .filter_map(|item| match item {
                    WorldItem::Interface { id, .. } => Some(*id),
                    _ => None,
                })
                .collect(),
        ),
        raw_result_errors: opts.no_component_error_wrapping,
        optional_result_payloads,
        type_generation,
        import_side_files: BTreeSet::new(),
        legacy_interface_files: BTreeSet::new(),
        export_side_declarations: BTreeMap::new(),
        world_type_names: Vec::new(),
        guest_import_modules: Source::default(),
        import_object: Source::default(),
        export_object: Source::default(),
        needs_ty_option: false,
        needs_ty_result: false,
        is_guest: opts.guest,
        flags_as_bigint: opts.flags_as_bigint,
        variants_inline_cases: opts.variants_inline_cases,
        use_namespace_objects: opts.use_namespace_objects,
        enum_values_screaming_snake_case: opts.enum_values_screaming_snake_case,
        async_imports,
        async_exports,
        references: Default::default(),
    };

    let world = &resolve.worlds[id];
    let package = resolve
        .packages
        .get(
            world
                .package
                .context("unexpectedly missing package in world")?,
        )
        .context("unexpectedly missing package in world for ID")?;

    let id_name = package.name.interface_id(&world.name);
    if bindgen.is_guest {
        uwriteln!(bindgen.src, "declare module '{id_name}' {{");
    } else {
        uwriteln!(bindgen.src, "// world {id_name}");
    }

    {
        let mut funcs = Vec::new();
        let mut interface_imports = BTreeMap::new();
        for (name, import) in world.imports.iter() {
            match import {
                WorldItem::Function(f) => {
                    if !feature_gate_allowed(resolve, package, &f.stability, &f.name)
                        .context("failed to check feature gate for imported function")?
                    {
                        debug!(
                            "skipping imported function [{}] feature gate due to feature gate visibility",
                            f.name
                        );
                        continue;
                    }

                    match name {
                        WorldKey::Name(name) => funcs.push((name.to_string(), f)),
                        WorldKey::Interface(id) => funcs.push((resolve.id_of(*id).unwrap(), f)),
                    }
                }
                WorldItem::Interface { id, stability, .. } => {
                    let iface_name = &resolve.interfaces[*id]
                        .name
                        .as_deref()
                        .unwrap_or("<unnamed>");
                    if !feature_gate_allowed(resolve, package, stability, iface_name)
                        .context("failed to check feature gate for imported interface")?
                    {
                        let import_specifier = resolve.id_of(*id).unwrap();
                        let (_, _, iface) = parse_world_key(&import_specifier).unwrap();
                        debug!(
                            "skipping imported interface [{iface}] feature gate due to feature gate visibility"
                        );
                        continue;
                    }

                    match name {
                        WorldKey::Name(name) => {
                            // kebab name -> direct ns namespace import
                            bindgen.world_import_interface(
                                resolve,
                                name,
                                *id,
                                files,
                                opts.instantiation_mode.is_some(),
                            );
                        }

                        // namespaced ns:pkg/iface
                        // TODO: map support
                        WorldKey::Interface(id) => {
                            let import_specifier = resolve.id_of(*id).unwrap();
                            let (_, _, iface) = parse_world_key(&import_specifier).unwrap();
                            let iface = iface.to_string();
                            match interface_imports.entry(import_specifier) {
                                Entry::Vacant(entry) => {
                                    entry.insert(vec![("*".into(), id)]);
                                }
                                Entry::Occupied(ref mut entry) => {
                                    entry.get_mut().push((iface, id));
                                }
                            }
                        }
                    }
                }

                WorldItem::Type { id, .. } => {
                    let ty = &resolve.types[*id];
                    let name = ty.name.as_ref().unwrap();

                    if !feature_gate_allowed(resolve, package, &ty.stability, name)
                        .context("failed to check feature gate for imported type")?
                    {
                        debug!(
                            "skipping imported type [{name}] feature gate due to feature gate visibility"
                        );
                        continue;
                    }

                    let mut generator = TsInterface::new(
                        resolve,
                        true,
                        opts.guest,
                        opts.flags_as_bigint,
                        opts.variants_inline_cases,
                        opts.use_namespace_objects,
                        opts.enum_values_screaming_snake_case,
                    )
                    .with_type_generation(type_generation)
                    .with_interface_file_stems(&bindgen.interface_file_stems)
                    .with_names(&bindgen.world_names);
                    generator.stability(&ty.stability);

                    match &ty.kind {
                        TypeDefKind::Record(record) => {
                            generator.type_record(*id, name, record, &ty.docs)
                        }
                        TypeDefKind::Flags(flags) => {
                            generator.type_flags(*id, name, flags, &ty.docs)
                        }
                        TypeDefKind::Tuple(tuple) => {
                            generator.type_tuple(*id, name, tuple, &ty.docs)
                        }
                        TypeDefKind::Enum(enum_) => generator.type_enum(*id, name, enum_, &ty.docs),
                        TypeDefKind::Variant(variant) => {
                            generator.type_variant(*id, name, variant, &ty.docs)
                        }
                        TypeDefKind::Option(t) => generator.type_option(*id, name, t, &ty.docs),
                        TypeDefKind::Result(r) => generator.type_result(*id, name, r, &ty.docs),
                        TypeDefKind::List(t) => generator.type_list(*id, name, t, &ty.docs),
                        TypeDefKind::FixedLengthList(t, len) => {
                            generator.type_fixed_size_list(*id, name, t, len, &ty.docs)
                        }
                        TypeDefKind::Type(t) => generator.type_alias(name, t, None, &ty.docs),
                        TypeDefKind::Future(t) => generator.type_future(name, t, &ty.docs),
                        TypeDefKind::Stream(t) => generator.type_stream(name, t, &ty.docs),
                        TypeDefKind::Unknown => unreachable!("(async impl) generate for unknown"),
                        TypeDefKind::Resource => {
                            generator.type_resource(*id, ty, GeneratedTypeMeta { is_export: false })
                        }
                        TypeDefKind::Handle(_) => todo!("type generation for handle"),
                        TypeDefKind::Map(key, value) => {
                            generator.type_map(*id, name, key, value, &ty.docs)
                        }
                    }
                    // The helper type aliases that the type refers to are declared
                    // once for the world, after all of its declarations.
                    bindgen.needs_ty_option |= generator.needs_ty_option;
                    bindgen.needs_ty_result |= generator.needs_ty_result;

                    let (src, references) = generator.finish();
                    bindgen.src.push_str(&src);
                    bindgen.references.extend(references);
                    bindgen.world_type_names.push(name.to_upper_camel_case());
                }
            }
        }
        // kebab import funcs (always default imports)
        for (name, func) in funcs {
            bindgen.import_funcs(
                resolve,
                &name,
                func,
                files,
                opts.instantiation_mode.is_some(),
            );
            if opts.guest && opts.instantiation_mode.is_none() {
                bindgen.guest_import_func_module(resolve, &id_name, &name, func);
            }
        }
        // namespace imports are grouped by namespace / kebab name
        // kebab name imports are direct
        for (name, import_interfaces) in interface_imports {
            bindgen.world_import_interfaces(
                resolve,
                name.as_ref(),
                import_interfaces,
                files,
                opts.instantiation_mode.is_some(),
            );
        }
    }

    let mut funcs = Vec::new();
    let mut has_result_export = false;
    let export_aliases = interface_export_aliases(resolve, world);

    for (name, export) in world.exports.iter() {
        match export {
            WorldItem::Function(f) => {
                let export_name = match name {
                    WorldKey::Name(export_name) => export_name,
                    WorldKey::Interface(_) => {
                        unreachable!("unexpected interface export during export processing")
                    }
                };

                if !feature_gate_allowed(resolve, package, &f.stability, &f.name)
                    .context("failed to check feature gate for export")?
                {
                    debug!(
                        "skipping exported interface [{export_name}] feature gate due to feature gate visibility"
                    );
                    continue;
                }

                has_result_export |= get_thrown_type(resolve, f.result).is_some();
                funcs.push((export_name.to_lower_camel_case(), f));
            }

            WorldItem::Interface { id, stability, .. } => {
                let iface_id: String;
                let (export_name, iface_name): (&str, &str) = match name {
                    WorldKey::Name(export_name) => (export_name, export_name),
                    WorldKey::Interface(interface) => {
                        iface_id = resolve.id_of(*interface).unwrap();
                        let (_, _, iface) = parse_world_key(&iface_id).unwrap();
                        (iface_id.as_ref(), iface)
                    }
                };

                if !feature_gate_allowed(resolve, package, stability, iface_name)
                    .context("failed to check feature gate for export")?
                {
                    debug!(
                        "skipping exported interface [{export_name}] feature gate due to feature gate visibility"
                    );
                    continue;
                }

                let instantiation = opts.instantiation_mode.is_some();
                has_result_export |= resolve.interfaces[*id]
                    .functions
                    .values()
                    .any(|func| get_thrown_type(resolve, func.result).is_some());
                bindgen.export_interface(resolve, export_name, *id, files, instantiation);
                // Also export the interface under its short name, when the bindings do
                let alt_export_name = iface_name.to_lower_camel_case();
                if alt_export_name != export_name
                    && export_aliases
                        .get(&alt_export_name)
                        .is_some_and(|owner| owner == export_name)
                {
                    bindgen.export_interface(resolve, &alt_export_name, *id, files, instantiation);
                } else if !instantiation {
                    // The interface still has declarations of its own, which the
                    // exports of the world do not refer to.
                    bindgen.generate_interface(
                        export_name,
                        resolve,
                        *id,
                        files,
                        GeneratedTypeMeta { is_export: true },
                    );
                }
            }
            WorldItem::Type { .. } => unimplemented!("type exports"),
        }
    }
    if !funcs.is_empty() {
        bindgen.export_funcs(
            resolve,
            id,
            &funcs,
            files,
            opts.instantiation_mode.is_none(),
        );
    }

    // The globals that the declarations of the world refer to, which a type of
    // the world may shadow.
    let promise = bindgen.world_names.global("Promise");
    let error = bindgen.world_names.global("Error");
    let record = bindgen.world_names.global("Record");
    let camel = world.name.to_upper_camel_case();
    let call_tracking_members = if call_tracking {
        "readonly calls: {
            /** Start a generated export without changing its result representation. */
            start<Args extends unknown[], Result>(fn: (...args: Args) => Result, ...args: Args): { readonly result: Result; readonly finished: Promise<{ readonly status: 'completed' } | { readonly status: 'stopped' } | { readonly status: 'trapped'; readonly error: Error }> };
            /** Start an exported resource constructor. */
            start<Args extends unknown[], Result>(fn: new (...args: Args) => Result, ...args: Args): { readonly result: Result; readonly finished: Promise<{ readonly status: 'completed' } | { readonly status: 'stopped' } | { readonly status: 'trapped'; readonly error: Error }> };
            /** Start an exported method with its receiver. */
            startWithThis<Receiver, Args extends unknown[], Result>(receiver: Receiver, fn: (this: Receiver, ...args: Args) => Result, ...args: Args): { readonly result: Result; readonly finished: Promise<{ readonly status: 'completed' } | { readonly status: 'stopped' } | { readonly status: 'trapped'; readonly error: Error }> };
        };"
        .replace("Promise<", &format!("{promise}<"))
        .replace("readonly error: Error ", &format!("readonly error: {error} "))
    } else {
        String::new()
    };
    let component_error = if has_result_export && !opts.no_component_error_wrapping {
        "/** Test whether a value is a declared WIT result error from this instance. */
        isComponentError(value: unknown): value is Error & { readonly payload: unknown };"
            .replace("value is Error ", &format!("value is {error} "))
    } else {
        String::new()
    };

    // Generate a type definition for the import object to type-check
    // all imports to the component.
    //
    // With the current representation of a "world" this is an import object
    // per-imported-interface where the type of that field is defined by the
    // interface bindgen.
    if opts.instantiation_mode.is_some() {
        uwriteln!(bindgen.src, "export interface ImportObject {{");
        bindgen.src.push_str(&bindgen.import_object);
        uwriteln!(bindgen.src, "}}");
    }

    // Generate a type definition for the export object from instantiating
    // the component.
    if opts.instantiation_mode.is_some() {
        uwriteln!(bindgen.src, "export interface {camel} {{",);
        bindgen.src.push_str(&bindgen.export_object);
        uwriteln!(
            bindgen.src,
            "/** Permanently stop this instance and dispose guest-owned host resources. */"
        );
        uwriteln!(
            bindgen.src,
            "readonly _util: {{ stop(): void; whenIdle(): {promise}<void>; {call_tracking_members} {component_error} }};"
        );
        uwriteln!(bindgen.src, "}}");
    } else {
        bindgen.src.push_str(&bindgen.export_object);
        if !opts.guest {
            uwriteln!(
                bindgen.src,
                "/** Permanently stop this instance and dispose guest-owned host resources. */"
            );
            uwriteln!(
                bindgen.src,
                "export const _util: {{ stop(): void; whenIdle(): {promise}<void>; {call_tracking_members} {component_error} }};"
            );
        }
    }

    // Emitted here, after the `export interface {World}` block above, so the
    // aliases land at the top level rather than inside that interface.
    if bindgen.needs_ty_option {
        let alias = ts_option_type_alias(&bindgen.world_names.option_alias());
        bindgen.src.push_str(&alias);
    }
    if bindgen.needs_ty_result {
        let alias = ts_result_type_alias(
            &bindgen.world_names.result_alias(),
            bindgen.optional_result_payloads,
        );
        bindgen.src.push_str(&alias);
    }

    if opts.tla_compat && opts.instantiation_mode.is_none() {
        uwriteln!(
            bindgen.src,
            "
            export const $init: {promise}<void>;"
        );
    }

    // Generate the TypeScript definition of the `instantiate` function
    // which is the main workhorse of the generated bindings.
    if opts.asmjs {
        if let Some(mode) = &opts.instantiation_mode {
            uwriteln!(
                bindgen.src,
                "
                /**
                 * Instantiates this component with the provided imports and
                 * returns a map of all the exports of the component.
                 *
                 * This function is intended to be similar to the
                 * `WebAssembly.instantiate` function, but simplified
                 * for `wasm2js` (asm.js) output. The `imports` argument
                 * is the \"import object\" for transpiled core wasm,
                 * except here it uses component-model-layer types instead of
                 * core wasm integers/numbers/etc.
                 */
                export function instantiate(
                    imports: ImportObject,
                ): {};
                ",
                match mode {
                    InstantiationMode::Async => format!("{promise}<{camel}>"),
                    InstantiationMode::Sync => camel,
                }
            );
        }
    } else {
        if opts.instantiation_mode.is_some() {
            uwriteln!(
                bindgen.src,
                "
                /**
                 * Options accepted by `instantiate`.
                 */
                export interface InstantiateOptions {{
                    /**
                     * Called with each trap of this instance as it happens, in whichever
                     * task: including one a guest left running, which no call of the host's
                     * would otherwise fail for. Not called for stopping the instance, which
                     * it may do itself.
                     */
                    onTrap?: (error: WebAssembly.RuntimeError) => void;
                    /** Runtime overrides for this instance. */
                    shim?: {{
                        /** Platform globals used instead of those on `globalThis`. */
                        globals?: {{
                            /**
                             * The WebAssembly implementation used by this instance,
                             * including by the default `instantiateCore`. Defaults to
                             * `globalThis.WebAssembly`.
                             */
                            WebAssembly?: typeof WebAssembly;
                        }};
                    }};
                }}
                ",
            );
        }
        match opts.instantiation_mode {
            Some(InstantiationMode::Async) => {
                uwriteln!(
                bindgen.src,
                "
                /**
                 * Instantiates this component with the provided imports and
                 * returns a map of all the exports of the component.
                 *
                 * This function is intended to be similar to the
                 * `WebAssembly.Instantiate` constructor. The second `imports`
                 * argument is the \"import object\" for wasm, except here it
                 * uses component-model-layer types instead of core wasm
                 * integers/numbers/etc.
                 *
                 * The first argument to this function, `getCoreModule`, is
                 * used to compile core wasm modules within the component.
                 * Components are composed of core wasm modules and this callback
                 * will be invoked per core wasm module. The caller of this
                 * function is responsible for reading the core wasm module
                 * identified by `path` and returning its compiled
                 * `WebAssembly.Module` object. This would use the
                 * `WebAssembly.Module` constructor on the web, for example.
                 *
                 * The optional `options` argument configures instantiation; see
                 * `InstantiateOptions`.
                 */
                export function instantiate(
                    getCoreModule: (path: string) => WebAssembly.Module,
                    imports: ImportObject,
                    instantiateCore?: (module: WebAssembly.Module, imports: {record}<string, any>) => WebAssembly.Instance,
                    options?: InstantiateOptions
                ): {camel};
                export function instantiate(
                    getCoreModule: (path: string) => WebAssembly.Module | {promise}<WebAssembly.Module>,
                    imports: ImportObject,
                    instantiateCore?: (module: WebAssembly.Module, imports: {record}<string, any>) => WebAssembly.Instance | {promise}<WebAssembly.Instance>,
                    options?: InstantiateOptions
                ): {camel} | {promise}<{camel}>;
                ",
                );
            }

            Some(InstantiationMode::Sync) => {
                uwriteln!(
                    bindgen.src,
                    "
                    /**
                     * Instantiates this component with the provided imports and
                     * returns a map of all the exports of the component.
                     *
                     * This function is intended to be similar to the
                     * `WebAssembly.Instantiate` constructor. The second `imports`
                     * argument is the \"import object\" for wasm, except here it
                     * uses component-model-layer types instead of core wasm
                     * integers/numbers/etc.
                     *
                     * The first argument to this function, `getCoreModule`, is
                     * used to compile core wasm modules within the component.
                     * Components are composed of core wasm modules and this callback
                     * will be invoked per core wasm module. The caller of this
                     * function is responsible for reading the core wasm module
                     * identified by `path` and returning its compiled
                     * `WebAssembly.Module` object. This would use the
                     * `WebAssembly.Module` constructor on the web, for example.
                     *
                     * The optional `options` argument configures instantiation; see
                     * `InstantiateOptions`.
                     */
                    export function instantiate(
                        getCoreModule: (path: string) => WebAssembly.Module,
                        imports: ImportObject,
                        instantiateCore?: (module: WebAssembly.Module, imports: {record}<string, any>) => WebAssembly.Instance,
                        options?: InstantiateOptions
                    ): {camel};
                    ",
                )
            }

            None => {}
        }
    }

    if bindgen.is_guest {
        uwriteln!(bindgen.src, "}}");
        let import_modules = std::mem::take(&mut bindgen.guest_import_modules);
        bindgen.src.push_str(&import_modules);
    }

    bindgen.keep_import_side_paths_of_exports(files);

    let filename = format!("{name}.d.ts");
    files.push(
        &filename,
        generate_references(&bindgen.references).as_bytes(),
    );
    files.push(&filename, bindgen.src.as_bytes());

    Ok(())
}

impl TsBindgen {
    /// Declare the export side of each interface that the world only exports
    /// at the path, and for guests in the module, of its import side too.
    ///
    /// The declaration of such an interface used to be there, where code written
    /// against earlier output still looks for it.
    fn keep_import_side_paths_of_exports(&mut self, files: &mut Files) {
        for (import_side_file_name, declaration) in &self.export_side_declarations {
            if self.import_side_files.contains(import_side_file_name) {
                continue;
            }
            let ExportSideDeclaration { id_name, file_stem } = declaration;
            let mut src = Source::default();
            if self.is_guest {
                self.references.insert(format!("./{import_side_file_name}"));
                uwriteln!(
                    src,
                    "/// <reference path=\"./{EXPORTS_DIR}/{file_stem}.d.ts\" />"
                );
                uwriteln!(src, "declare module '{id_name}' {{");
                uwriteln!(src, "export * from '{}';", guest_export_module(id_name));
                uwriteln!(src, "}}");
            } else {
                uwriteln!(src, "/** @module Interface {id_name} **/");
                uwriteln!(src, "export * from './{EXPORTS_DIR}/{file_stem}.js';");
            }
            files.push(import_side_file_name, src.as_bytes());
        }
    }

    fn world_import_interface(
        &mut self,
        resolve: &Resolve,
        name: &str,
        id: InterfaceId,
        files: &mut Files,
        instantiation: bool,
    ) {
        if instantiation {
            // in case an imported type is used as an exported type
            let local_name = self.import_interface(
                name,
                resolve,
                id,
                files,
                GeneratedTypeMeta { is_export: false },
            );
            uwriteln!(
                self.import_object,
                "{}: typeof {local_name},",
                maybe_quote_id(name)
            );
        } else {
            // Generate a type-only export (`export type *` instead of `export *`).
            // so that users can use the interface types, even though there is no runtime code.
            let id_name = resolve.id_of(id).unwrap_or_else(|| name.to_string());
            let import_path = self.generate_interface(
                &id_name,
                resolve,
                id,
                files,
                GeneratedTypeMeta { is_export: false },
            );
            // Alias under the import's own name: a named interface may be
            // imported under one or more plain labels via the component model
            // `implements` feature, in which case each label gets its own
            // alias of the shared interface module.
            uwriteln!(
                self.src,
                "export type * as {} from '{import_path}'; // import {}",
                name.to_upper_camel_case(),
                id_name
            );
        }
    }

    fn world_import_interfaces(
        &mut self,
        resolve: &Resolve,
        import_name: &str,
        ifaces: Vec<(String, &InterfaceId)>,
        files: &mut Files,
        instantiation: bool,
    ) {
        if instantiation {
            if ifaces.len() == 1 {
                let (iface_name, id) = ifaces.first().unwrap();
                if iface_name == "*" {
                    uwrite!(self.import_object, "{}: ", maybe_quote_id(import_name));
                    let name = resolve.interfaces[**id].name.as_ref().unwrap();
                    let local_name = self.import_interface(
                        name,
                        resolve,
                        **id,
                        files,
                        GeneratedTypeMeta { is_export: false },
                    );
                    uwriteln!(self.import_object, "typeof {local_name},",);
                    return;
                }
            }
            uwriteln!(self.import_object, "{}: {{", maybe_quote_id(import_name));
            for (iface_name, &id) in ifaces {
                let name = resolve.interfaces[id].name.as_ref().unwrap();
                let local_name = self.import_interface(
                    name,
                    resolve,
                    id,
                    files,
                    GeneratedTypeMeta { is_export: false },
                );
                uwriteln!(
                    self.import_object,
                    "{}: typeof {local_name},",
                    iface_name.to_lower_camel_case()
                );
            }
            uwriteln!(self.import_object, "}},");
        } else {
            // Generate a type-only export (`export type *` instead of `export *`).
            // so that users can use the interface types, even though there is no runtime code.
            for (_, &id) in ifaces {
                let id_name = resolve.id_of(id).unwrap();
                let import_path = self.generate_interface(
                    &id_name,
                    resolve,
                    id,
                    files,
                    GeneratedTypeMeta { is_export: false },
                );
                uwriteln!(
                    self.src,
                    "export type * as {} from '{import_path}'; // import {}",
                    id_name.to_upper_camel_case(),
                    id_name
                );
            }
        }
    }

    fn import_funcs(
        &mut self,
        resolve: &Resolve,
        import_name: &str,
        func: &Function,
        _files: &mut Files,
        instantiation: bool,
    ) {
        uwriteln!(self.import_object, "{}: {{", maybe_quote_id(import_name));
        let mut generator = TsInterface::new(
            resolve,
            false,
            self.is_guest,
            self.flags_as_bigint,
            self.variants_inline_cases,
            self.use_namespace_objects,
            self.enum_values_screaming_snake_case,
        )
        .with_type_generation(self.type_generation)
        .with_interface_file_stems(&self.interface_file_stems)
        .with_names(&self.world_names);
        generator.host_implemented =
            !self.is_guest && self.type_generation.async_imports_may_return_sync;
        generator.ts_func(
            func,
            true,
            false,
            false,
            &GeneratedTypeMeta { is_export: false },
        );
        // Only the declarations for instantiation include the import object,
        // which then needs the helper type aliases that its functions refer to.
        if instantiation {
            self.needs_ty_option |= generator.needs_ty_option;
            self.needs_ty_result |= generator.needs_ty_result;
        }
        let (src, references) = generator.finish();
        self.import_object.push_str(&src);
        self.references.extend(references);
        uwriteln!(self.import_object, "}},");
    }

    /// Declare the ambient module of a function that a guest world imports.
    ///
    /// The function is the default export of the module named after the
    /// import. Its signature may name the world's own types and the helper type
    /// aliases, which the module imports from the world's module.
    fn guest_import_func_module(
        &mut self,
        resolve: &Resolve,
        world_module: &str,
        import_name: &str,
        func: &Function,
    ) {
        let mut generator = TsInterface::new(
            resolve,
            false,
            self.is_guest,
            self.flags_as_bigint,
            self.variants_inline_cases,
            self.use_namespace_objects,
            self.enum_values_screaming_snake_case,
        )
        .with_type_generation(self.type_generation)
        .with_interface_file_stems(&self.interface_file_stems)
        .with_names(&self.world_names);
        generator.ts_func(
            func,
            true,
            true,
            false,
            &GeneratedTypeMeta { is_export: false },
        );

        let mut imported_names = self.world_type_names.clone();
        if generator.needs_ty_option {
            self.needs_ty_option = true;
            imported_names.push(self.world_names.option_alias());
        }
        if generator.needs_ty_result {
            self.needs_ty_result = true;
            imported_names.push(self.world_names.result_alias());
        }

        let (src, references) = generator.finish();
        self.references.extend(references);

        uwriteln!(
            self.guest_import_modules,
            "declare module '{import_name}' {{"
        );
        if !imported_names.is_empty() {
            uwriteln!(
                self.guest_import_modules,
                "import type {{ {} }} from '{world_module}';",
                imported_names.join(", ")
            );
        }
        self.guest_import_modules.push_str(&src);
        uwriteln!(self.guest_import_modules, "}}");
    }

    fn export_interface(
        &mut self,
        resolve: &Resolve,
        export_name: &str,
        id: InterfaceId,
        files: &mut Files,
        instantiation: bool,
    ) {
        // Labeled exports use camel case at runtime, independently of the
        // optional short aliases of namespaced interfaces.
        let binding_name = if export_name.contains(':') {
            export_name.to_string()
        } else {
            export_name.to_lower_camel_case()
        };
        if instantiation {
            let local_name = self.import_interface(
                export_name,
                resolve,
                id,
                files,
                GeneratedTypeMeta { is_export: true },
            );
            uwriteln!(
                self.export_object,
                "{}: typeof {local_name},",
                maybe_quote_id(&binding_name)
            );
        } else if binding_name != maybe_quote_id(&binding_name) {
            // TODO: TypeScript doesn't currently support
            // non-identifier exports
            // tracking in https://github.com/microsoft/TypeScript/issues/40594
        } else {
            let id_name = resolve.id_of(id).unwrap_or_else(|| binding_name.clone());
            let file_name = self.generate_interface(
                &binding_name,
                resolve,
                id,
                files,
                GeneratedTypeMeta { is_export: true },
            );
            uwriteln!(
                self.export_object,
                "export * as {binding_name} from '{file_name}'; // export {id_name}"
            );
        }
    }

    fn export_funcs(
        &mut self,
        resolve: &Resolve,
        world: WorldId,
        funcs: &[(String, &Function)],
        _files: &mut Files,
        declaration: bool,
    ) {
        let mut generator = TsInterface::new(
            resolve,
            false,
            self.is_guest,
            self.flags_as_bigint,
            self.variants_inline_cases,
            self.use_namespace_objects,
            self.enum_values_screaming_snake_case,
        )
        .with_type_generation(self.type_generation)
        .with_interface_file_stems(&self.interface_file_stems)
        .with_names(&self.world_names);
        generator.raw_result_errors = self.raw_result_errors;
        let id_name = &resolve.worlds[world].name;

        for (_, func) in funcs {
            let requires_async_porcelain = requires_async_porcelain(
                FunctionIdentifier::Fn(func),
                id_name,
                &self.async_exports,
            );

            // Figure out whether we need ancillary types
            for ty in func.parameter_and_result_types() {
                if let Type::Id(typedef_id) = ty {
                    let typedef_id = dealias(resolve, typedef_id);
                    // For all complex func/param types that are used in this function, output
                    // the relevant type definitions
                    let result_ty_def = &resolve.types[typedef_id];
                    match &result_ty_def.kind {
                        TypeDefKind::Option(_) => {
                            generator.needs_ty_option = true;
                        }
                        TypeDefKind::Result(_) => {
                            generator.needs_ty_result = true;
                        }
                        _ => {}
                    }
                }
            }

            // Generate the function type definition
            generator.ts_func(
                func,
                false,
                declaration,
                requires_async_porcelain,
                &GeneratedTypeMeta { is_export: true },
            );
        }

        // Record whether the `Option`/`Result` helper type aliases are needed,
        // but do NOT emit them into `export_object`. In instantiation mode
        // `export_object` is wrapped in an `export interface {World} { ... }`,
        // and a type-alias declaration is not a valid interface member. The
        // aliases are emitted at the top level by the world generator instead
        // (see https://github.com/bytecodealliance/jco/issues/1708).
        self.needs_ty_option |= generator.needs_ty_option
            || generator.resources.iter().any(|(_, r)| r.1.needs_ty_option);
        self.needs_ty_result |= generator.needs_ty_result
            || generator.resources.iter().any(|(_, r)| r.1.needs_ty_result);

        let (src, references) = generator.finish();
        self.export_object.push_str(&src);
        self.references.extend(references);
    }

    /// Adds an import for the given interface to the generated source code,
    /// returning the local name of the imported interface.
    fn import_interface(
        &mut self,
        name: &str,
        resolve: &Resolve,
        id: InterfaceId,
        files: &mut Files,
        type_meta: GeneratedTypeMeta,
    ) -> String {
        let id_name = resolve.id_of(id).unwrap_or_else(|| name.to_string());
        let goal_name = if type_meta.is_export() {
            format!("{}-exports", interface_goal_name(&id_name))
        } else {
            interface_goal_name(&id_name)
        };
        let file_name = self.generate_interface(name, resolve, id, files, type_meta);

        let (local_name, local_exists) = self.local_names.get_or_create(&file_name, &goal_name);
        let local_name = local_name.to_upper_camel_case();
        if !local_exists {
            uwriteln!(
                self.src,
                "import type * as {local_name} from '{file_name}'; // {id_name}"
            );
        }

        local_name
    }

    /// Generates a definition file for the given interface, if it doesn't already
    /// exist, and returns the import specifier for the interface.
    ///
    /// For host types, the import specifier is `./interfaces/{file}.js`.
    /// For guest types, the import specifier is the interface ID (e.g. `ns:pkg/iface`).
    ///
    /// By default, the import and export sides are declared separately,
    /// as what a caller of the interface sees differs from what an
    /// implementation of it provides. The export-side declaration file is in the
    /// `exports` directory, and for guest types its module is named by
    /// [`guest_export_module`]. The shared compatibility layout keeps the first
    /// declaration at the import-side path for both directions.
    fn generate_interface(
        &mut self,
        name: &str,
        resolve: &Resolve,
        interface_id: InterfaceId,
        files: &mut Files,
        type_meta: GeneratedTypeMeta,
    ) -> String {
        let id_name = resolve
            .id_of(interface_id)
            .unwrap_or_else(|| name.to_string());
        let goal_name = interface_goal_name(&id_name);
        let interface_stem =
            interface_file_stem(&self.interface_file_stems, interface_id, &id_name);
        let import_side_file_name = format!("{INTERFACES_DIR}/{interface_stem}.d.ts");
        let (file_stem, module_name) =
            if type_meta.is_export() && self.type_generation.separate_interfaces() {
                self.export_side_declarations
                    .entry(import_side_file_name)
                    .or_insert_with(|| ExportSideDeclaration {
                        id_name: id_name.clone(),
                        file_stem: interface_stem.clone(),
                    });
                (
                    format!("{INTERFACES_DIR}/{EXPORTS_DIR}/{interface_stem}"),
                    guest_export_module(&id_name),
                )
            } else {
                self.import_side_files.insert(import_side_file_name);
                (
                    format!("{INTERFACES_DIR}/{interface_stem}"),
                    id_name.clone(),
                )
            };
        let file_name = format!("{file_stem}.d.ts");
        let (_name, iface_exists) = self.interface_names.get_or_create(&file_name, &goal_name);

        if !iface_exists {
            let mut generator = TsInterface::new(
                resolve,
                false,
                self.is_guest,
                self.flags_as_bigint,
                self.variants_inline_cases,
                self.use_namespace_objects,
                self.enum_values_screaming_snake_case,
            )
            .with_type_generation(self.type_generation)
            .with_interface_file_stems(&self.interface_file_stems)
            .with_names(&Rc::new(ModuleNames::of_types(
                resolve,
                resolve.interfaces[interface_id]
                    .types
                    .iter()
                    .map(|(name, id)| (name.as_str(), *id)),
                self.variants_inline_cases,
            )));
            generator.host_implemented = !self.is_guest
                && type_meta.is_import()
                && self.type_generation.async_imports_may_return_sync;
            generator.is_export_side =
                type_meta.is_export() && self.type_generation.separate_interfaces();
            generator.exported_interfaces = Rc::clone(&self.exported_interfaces);
            generator.raw_result_errors = self.raw_result_errors;
            generator.optional_result_payloads = self.optional_result_payloads;
            if !self.is_guest
                && type_meta.is_export()
                && !self.raw_result_errors
                && self.type_generation.typed_error_classes
            {
                generator.error_class_interface = Some(interface_id);
            }
            if self.is_guest {
                generator.begin_guest_module(&module_name);
            } else {
                generator.begin_host_module(&id_name);
            }

            // Generate function definitions
            let async_funcs = if type_meta.is_export() {
                &self.async_exports
            } else {
                &self.async_imports
            };

            let iface = &resolve.interfaces[interface_id];
            let package_id = iface.package.expect("missing package on interface");
            let package = resolve
                .packages
                .get(package_id)
                .expect("unexpectedly missing package");

            for (_, func) in iface.functions.iter() {
                // Ensure that the function  the world item for stability guarantees and exclude if they do not match
                if !feature_gate_allowed(resolve, package, &func.stability, &func.name)
                    .expect("failed to check feature gate for function")
                {
                    continue;
                }

                let func_name = func.name.clone();

                let canonicalized_fn_name = match resolve.canonicalized_id_of(interface_id) {
                    Some(canon_iface_name) => {
                        format!("{}#{func_name}", canon_iface_name.trim_start_matches("$"))
                    }
                    // NOTE: we can't get canonicalized interface names for anonymous interfaces
                    // so we use the function name bare
                    None => func_name,
                };

                let requires_async_porcelain = requires_async_porcelain(
                    FunctionIdentifier::CanonFnName(&canonicalized_fn_name),
                    &id_name,
                    async_funcs,
                );

                generator.ts_func(func, false, true, requires_async_porcelain, &type_meta);
            }

            generator.types(interface_id);
            generator.post_types();

            let (src, references) = generator.finish();
            files.push(&file_name, generate_references(&references).as_bytes());
            files.push(&file_name, src.as_bytes());
        }

        // The shared layout retains the unversioned path for the first interface
        // encountered, as earlier generators did. World declarations still use the
        // versioned paths so distinct versions no longer share incorrect types.
        if !self.type_generation.separate_interfaces() {
            let legacy_stem = interface_goal_name(&id_name);
            let legacy_file = format!("{INTERFACES_DIR}/{legacy_stem}.d.ts");
            if legacy_stem != interface_stem
                && !self
                    .interface_file_stems
                    .values()
                    .any(|stem| stem == &legacy_stem)
                && self.legacy_interface_files.insert(legacy_file.clone())
            {
                let alias = if self.is_guest {
                    format!("/// <reference path=\"./{interface_stem}.d.ts\" />\n")
                } else {
                    format!("export * from './{interface_stem}.js';\n")
                };
                files.push(&legacy_file, alias.as_bytes());
            }
        }

        if self.is_guest {
            self.references.insert(format!("./{file_name}"));
            module_name
        } else {
            format!("./{file_stem}.js")
        }
    }
}

impl<'a> TsInterface<'a> {
    fn new(
        resolve: &'a Resolve,
        is_root: bool,
        is_guest: bool,
        flags_as_bigint: bool,
        variants_inline_cases: bool,
        use_namespace_objects: bool,
        enum_values_screaming_snake_case: bool,
    ) -> Self {
        TsInterface {
            is_root,
            interface_file_stems: Rc::default(),
            names: Rc::default(),
            doc_tags: Vec::new(),
            error_class_interface: None,
            error_classes: BTreeMap::new(),
            raw_result_errors: false,
            optional_result_payloads: false,
            type_generation: TypeGenerationConfig::default(),
            class_docs: Source::default(),
            resource_brand: String::new(),
            host_implemented: false,
            is_export_side: false,
            exported_interfaces: Rc::default(),
            is_guest,
            flags_as_bigint,
            variants_inline_cases,
            use_namespace_objects,
            enum_values_screaming_snake_case,
            src: Source::default(),
            resources: BTreeMap::new(),
            local_names: LocalNames::default(),
            resolve,
            has_constructor: false,
            needs_ty_option: false,
            needs_ty_result: false,
            needs_module_end: false,
            references: Default::default(),
        }
    }

    /// Set the stems of the declaration files of the world's interfaces.
    fn with_interface_file_stems(mut self, stems: &Rc<InterfaceFileStems>) -> Self {
        self.interface_file_stems = Rc::clone(stems);
        self
    }

    /// Set the names bound by the declarations of the module that this
    /// generator's output is part of.
    fn with_names(mut self, names: &Rc<ModuleNames>) -> Self {
        self.names = Rc::clone(names);
        self
    }

    /// Open the module that holds the declarations for a host.
    fn begin_host_module(&mut self, id_name: &str) {
        uwriteln!(self.src, "/** @module Interface {id_name} **/");
    }

    /// Open the ambient module that holds the declarations for a guest.
    fn begin_guest_module(&mut self, module_name: &str) {
        uwriteln!(self.src, "declare module '{module_name}' {{");
        self.needs_module_end = true;
    }

    fn finish(mut self) -> (Source, BTreeSet<String>) {
        for (resource, (meta, source)) in self.resources {
            let generates_disposable_resource =
                (self.is_guest && meta.is_import()) || (!self.is_guest && meta.is_export());
            let (impl_phrase, extra_members) = if generates_disposable_resource {
                // Guest imports and host exports are resource consumers. Their generated
                // wrappers own component-model handles and support deterministic cleanup.
                (
                    format!(" implements {}", self.names.global("Disposable")),
                    vec![format!(
                        "[{}.dispose](): void;",
                        self.names.global("Symbol")
                    )],
                )
            } else {
                (String::new(), vec![])
            };

            self.src.push_str("\n");
            self.src.push_str(&source.class_docs);
            uwriteln!(
                self.src,
                "export class {class_name}{impl_phrase} {{",
                class_name = resource.to_upper_camel_case(),
            );
            if generates_disposable_resource && self.type_generation.nominal_resources {
                // The bindings accept only instances of the class they generate, so the
                // class is declared with a member that no other object has: TypeScript
                // then no longer takes an object of a matching shape, or another resource
                // with the same functions, for an instance of it. The type of the member
                // names the resource up to the semver compatible track of its package,
                // so that a resource is still accepted in place of the same resource of
                // a compatible version. A private member would not allow that, as
                // TypeScript tells private members of separate declarations apart.
                uwriteln!(self.src, "/**");
                uwriteln!(
                    self.src,
                    " * Identifies the resource to the type checker. This member does not exist at runtime."
                );
                uwriteln!(self.src, " */");
                uwriteln!(
                    self.src,
                    "readonly $brand: {};",
                    js_string_literal(&source.resource_brand).replace('"', "'")
                );
            }
            if !source.has_constructor {
                uwriteln!(self.src, "/**");
                uwriteln!(self.src, " * This type does not have a public constructor.");
                uwriteln!(self.src, " */");
                uwriteln!(self.src, "private constructor();");
            }
            self.src.push_str(&source.src);
            for extra_member in extra_members {
                uwriteln!(self.src, "{}", extra_member);
            }
            uwriteln!(self.src, "}}")
        }
        for class in self.error_classes.into_values() {
            let payload_ty = class.payload_type_name.to_upper_camel_case();
            uwriteln!(self.src, "\n/**");
            uwriteln!(
                self.src,
                " * The error that the functions of this interface throw for an error of the type `{}`.",
                class.payload_type_name
            );
            uwriteln!(self.src, " */");
            uwriteln!(
                self.src,
                "export class {} extends {} {{",
                class.name,
                self.names.global("Error")
            );
            uwriteln!(self.src, "constructor(payload: {payload_ty});");
            uwriteln!(self.src, "readonly payload: {payload_ty};");
            uwriteln!(self.src, "}}");
        }
        if self.src.is_empty() {
            // If there are no types, we still need to emit an empty module
            // to satisfy the TypeScript compiler.
            uwriteln!(self.src, "export {{}};");
        }
        if self.needs_module_end {
            uwriteln!(self.src, "}}");
        }
        (self.src, self.references)
    }

    /// Write a documentation comment with the text `docs`, followed by the
    /// tags of the stability that [`Self::stability`] set for the item, if any.
    fn docs_raw(&mut self, docs: &str) {
        let doc_tags = std::mem::take(&mut self.doc_tags);
        self.src.push_str("/**\n");
        for line in docs.lines() {
            self.src.push_str(&format!(" * {line}\n"));
        }
        if !docs.is_empty() && !doc_tags.is_empty() {
            self.src.push_str(" *\n");
        }
        for tag in doc_tags {
            self.src.push_str(&format!(" * {tag}\n"));
        }
        self.src.push_str(" */\n");
    }

    fn docs(&mut self, docs: &Docs) {
        match &docs.contents {
            Some(docs) => self.docs_raw(docs),
            None if !self.doc_tags.is_empty() => self.docs_raw(""),
            None => {}
        }
    }

    /// The lines of the JSDoc tag for the result of an async function that a
    /// host calls and that returns a `future`.
    ///
    /// The bindings return a promise of the future, and keep the promise from
    /// resolving to the value of the future instead. TypeScript cannot express
    /// this: it types an `await` as unwrapping every promise at once.
    fn future_result_tag(
        &self,
        func: &Function,
        requires_async_porcelain: bool,
        meta: &GeneratedTypeMeta,
    ) -> Vec<String> {
        let is_host_call = !self.is_guest && meta.is_export();
        let returns_promise = requires_async_porcelain || func.kind.is_async();
        let returns_future = matches!(
            func.result,
            Some(Type::Id(id))
                if matches!(
                    self.resolve.types[dealias(self.resolve, id)].kind,
                    TypeDefKind::Future(_)
                )
        );
        if !(is_host_call && returns_promise && returns_future) {
            return Vec::new();
        }
        vec![
            "@returns A promise of the future, not of its value: \
             each `await` unwraps one of the two layers."
                .to_string(),
            "TypeScript types the first `await` as the value already, \
             whereas `.then()` is typed layer by layer."
                .to_string(),
        ]
    }

    /// The JSDoc tag for what a function throws on account of the error of
    /// its `result`, if it returns one.
    ///
    /// The side that calls the function catches the error. The side that
    /// implements the function throws to return it.
    fn throws_tag(&mut self, func: &Function, meta: &GeneratedTypeMeta) -> Option<String> {
        let (_, err) = get_thrown_type(self.resolve, func.result)?;

        let err_ty = match err {
            Some(err) => {
                // The type is only named in a comment, which must not make the
                // module declare the helper type aliases that it refers to.
                let needs_ty = (self.needs_ty_option, self.needs_ty_result);
                let src = std::mem::take(&mut self.src);
                self.print_ty(err);
                (self.needs_ty_option, self.needs_ty_result) = needs_ty;
                std::mem::replace(&mut self.src, src).to_string()
            }
            None => "undefined".to_string(),
        };

        let is_caller = self.is_guest == meta.is_import();
        if !is_caller {
            return Some(format!(
                "@throws {{{err_ty}}} To return the error of the result, throw it, \
                 or an `Error` that has it as its `payload`."
            ));
        }
        if !self.is_guest && self.raw_result_errors {
            return Some(format!("@throws {{{err_ty}}} The error of the result."));
        }
        let class = self
            .error_class_interface
            .and_then(|interface| crate::result_error_class(self.resolve, interface, func));
        let thrown_ty = match class {
            Some(class) => {
                let name = class.name.clone();
                self.error_classes.insert(name.clone(), class);
                name
            }
            None => format!("{} & {{ payload: {err_ty} }}", self.names.global("Error")),
        };
        Some(format!(
            "@throws {{{thrown_ty}}} The error of the result, as the `payload` of the thrown error."
        ))
    }

    /// Set the stability of the item that is declared next. The next
    /// documentation comment carries it as JSDoc tags.
    fn stability(&mut self, stability: &Stability) {
        self.doc_tags = stability_tags(stability);
    }

    fn types(&mut self, iface_id: InterfaceId) {
        let iface = &self.resolve.interfaces[iface_id];

        for (name, id) in iface.types.iter() {
            let ty = &self.resolve.types[*id];
            self.stability(&ty.stability);
            match &ty.kind {
                TypeDefKind::Record(record) => self.type_record(*id, name, record, &ty.docs),
                TypeDefKind::Flags(flags) => self.type_flags(*id, name, flags, &ty.docs),
                TypeDefKind::Tuple(tuple) => self.type_tuple(*id, name, tuple, &ty.docs),
                TypeDefKind::Enum(enum_) => self.type_enum(*id, name, enum_, &ty.docs),
                TypeDefKind::Variant(variant) => self.type_variant(*id, name, variant, &ty.docs),
                TypeDefKind::Option(t) => self.type_option(*id, name, t, &ty.docs),
                TypeDefKind::Result(r) => self.type_result(*id, name, r, &ty.docs),
                TypeDefKind::List(t) => self.type_list(*id, name, t, &ty.docs),
                TypeDefKind::FixedLengthList(t, len) => {
                    self.type_fixed_size_list(*id, name, t, len, &ty.docs)
                }
                TypeDefKind::Type(t) => self.type_alias(name, t, Some(iface_id), &ty.docs),
                TypeDefKind::Future(t) => self.type_future(name, t, &ty.docs),
                TypeDefKind::Stream(t) => self.type_stream(name, t, &ty.docs),
                TypeDefKind::Unknown => unreachable!("unexpectedly unknown type def"),
                TypeDefKind::Resource => self.type_resource(
                    *id,
                    ty,
                    GeneratedTypeMeta {
                        is_export: self.is_export_side,
                    },
                ),
                TypeDefKind::Handle(_) => todo!("types for handle"),
                TypeDefKind::Map(key, value) => self.type_map(*id, name, key, value, &ty.docs),
            }
            // A declaration without a documentation comment leaves the tags unused.
            self.doc_tags.clear();
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
            // TODO: `error-context`s should probably be represented by a native always-provided type
            Type::ErrorContext => self.src.push_str("number"),
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
                            self.src
                                .push_str(&format!("{}<", self.names.option_alias()));
                            self.print_ty(t);
                            self.src.push_str(">");
                        } else {
                            self.print_ty(t);
                            self.src.push_str(" | undefined");
                        }
                    }
                    TypeDefKind::Result(r) => {
                        self.needs_ty_result = true;
                        self.src
                            .push_str(&format!("{}<", self.names.result_alias()));
                        self.print_optional_ty(r.ok.as_ref());
                        self.src.push_str(", ");
                        self.print_optional_ty(r.err.as_ref());
                        self.src.push_str(">");
                    }
                    TypeDefKind::Variant(_) => panic!("[print_ty()] anonymous variant"),
                    TypeDefKind::List(v) => self.print_list_ty(v),
                    TypeDefKind::FixedLengthList(v, len) => self.print_fixed_size_list(v, len),
                    TypeDefKind::Future(maybe_ty) => self.print_future_ty(maybe_ty.as_ref()),
                    TypeDefKind::Stream(maybe_ty) => self.print_stream_ty(maybe_ty.as_ref()),
                    TypeDefKind::Unknown => unreachable!("unexpectedly unknown type def"),
                    TypeDefKind::Resource => todo!("[print_ty()] resource"),
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
                    TypeDefKind::Map(key, value) => self.print_map_ty(key, value),
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

    /// Print the type of a `future` with the given payload type
    fn print_future_ty(&mut self, payload: Option<&Type>) {
        self.src
            .push_str(&format!("{}<", self.names.global("PromiseLike")));
        self.print_optional_ty(payload);
        self.src.push_str(&format!(
            "> & {{ [{}.dispose]?(): void }}",
            self.names.global("Symbol")
        ));
    }

    /// Print the type of a `stream` with the given element type
    fn print_stream_ty(&mut self, element: Option<&Type>) {
        self.src
            .push_str(&format!("{}<", self.names.global("AsyncIterable")));
        self.print_optional_ty(element);
        self.src.push_str(">");
    }

    /// Print the list type
    fn print_list_ty(&mut self, ty: &Type) {
        match js_array_ty(self.resolve, ty) {
            Some(ty) => self.src.push_str(&self.names.global(ty)),
            None => {
                self.src
                    .push_str(&format!("{}<", self.names.global("Array")));
                self.print_ty(ty);
                self.src.push_str(">");
            }
        }
    }

    fn print_map_ty(&mut self, key: &Type, value: &Type) {
        self.src.push_str(&format!("{}<", self.names.global("Map")));
        self.print_ty(key);
        self.src.push_str(", ");
        self.print_ty(value);
        self.src.push_str(">");
    }

    fn print_fixed_size_list(&mut self, ty: &Type, len: &u32) {
        self.src.push_str("[");
        for _ in 0..len - 1 {
            self.print_ty(ty);
            self.src.push_str(",");
        }
        self.print_ty(ty);
        self.src.push_str("]");
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

    fn with_type_generation(mut self, config: TypeGenerationConfig) -> Self {
        self.type_generation = config;
        self
    }

    fn iface_for<'i>(
        &'i mut self,
        func: &Function,
        meta: &GeneratedTypeMeta,
    ) -> &'i mut TsInterface<'a> {
        if let FunctionKind::Method(idx)
        | FunctionKind::AsyncMethod(idx)
        | FunctionKind::Static(idx)
        | FunctionKind::AsyncStatic(idx)
        | FunctionKind::Constructor(idx) = func.kind
        {
            let ty = &self.resolve.types[idx];
            let resource = ty.name.clone().unwrap();
            &mut self
                .resources
                .entry(resource)
                .or_insert_with(|| {
                    (
                        meta.clone(),
                        TsInterface::new(
                            self.resolve,
                            false,
                            self.is_guest,
                            self.flags_as_bigint,
                            self.variants_inline_cases,
                            self.use_namespace_objects,
                            self.enum_values_screaming_snake_case,
                        )
                        .with_type_generation(self.type_generation)
                        .with_interface_file_stems(&self.interface_file_stems)
                        .with_names(&self.names),
                    )
                })
                .1
        } else {
            self
        }
    }

    fn ts_func(
        &mut self,
        func: &Function,
        default: bool,
        declaration: bool,
        requires_async_porcelain: bool,
        meta: &GeneratedTypeMeta,
    ) {
        let host_implemented = self.host_implemented;
        let throws_tag = self.throws_tag(func, meta);
        let future_result_tag = self.future_result_tag(func, requires_async_porcelain, meta);
        let iface = self.iface_for(func, meta);

        let out_name = if default {
            "default".to_string()
        } else {
            func.item_name().to_lower_camel_case()
        };

        let escaped_name = if is_valid_js_identifier(&out_name) {
            out_name.to_string()
        } else {
            js_string_literal(&out_name)
        };

        // A function whose name is not an identifier is declared under a local
        // name and exported under its own. The export comes first, so that the
        // documentation comment is that of the function declaration.
        let is_freestanding = matches!(
            func.kind,
            FunctionKind::Freestanding | FunctionKind::AsyncFreestanding
        );
        let renamed_local_name =
            if declaration && is_freestanding && !is_valid_js_identifier(&out_name) {
                let (local_name, _) = iface.local_names.get_or_create(&out_name, &out_name);
                let local_name = local_name.to_string();
                iface
                    .src
                    .push_str(&format!("export {{ {local_name} as {out_name} }};\n"));
                Some(local_name)
            } else {
                None
            };

        iface.stability(&func.stability);
        iface.doc_tags.extend(throws_tag);
        iface.doc_tags.extend(future_result_tag);
        iface.docs(&func.docs);
        iface.doc_tags.clear();

        if declaration {
            match func.kind {
                FunctionKind::Freestanding | FunctionKind::AsyncFreestanding => {
                    if let Some(local_name) = &renamed_local_name {
                        // Guest declarations are nested in an ambient `declare module`
                        // block, while host declarations sit at the top level of a
                        // `.d.ts` file, where a function must be declared ambient.
                        let declare = if iface.is_guest { "" } else { "declare " };
                        iface
                            .src
                            .push_str(&format!("{declare}function {local_name}"));
                    } else {
                        iface.src.push_str(&format!("export function {out_name}"));
                    }
                }
                FunctionKind::Constructor(_) => {
                    iface.has_constructor = true;
                    iface.src.push_str("constructor");
                }
                FunctionKind::Static(_) | FunctionKind::AsyncStatic(_) => {
                    iface.src.push_str(&format!(
                        "static {}",
                        class_member_name(&static_member_name(func.item_name()))
                    ));
                }
                FunctionKind::Method(_) | FunctionKind::AsyncMethod(_) => {
                    iface.src.push_str(&class_member_name(&escaped_name));
                }
            }
        } else {
            iface.src.push_str(&escaped_name);
        }

        iface.src.push_str("(");

        let param_start = match &func.kind {
            FunctionKind::Freestanding => 0,
            FunctionKind::Method(_) => 1,
            FunctionKind::Static(_) => 0,
            FunctionKind::Constructor(_) => 0,
            FunctionKind::AsyncFreestanding => 0,
            FunctionKind::AsyncMethod(_) => 1,
            FunctionKind::AsyncStatic(_) => 0,
        };

        for (i, p) in func.params[param_start..].iter().enumerate() {
            if i > 0 {
                iface.src.push_str(", ");
            }
            let mut param_name = p.name.to_lower_camel_case();
            if RESERVED_KEYWORDS
                .binary_search(&param_name.as_str())
                .is_ok()
            {
                param_name = format!("{param_name}_");
            }
            iface.src.push_str(&param_name);
            iface.src.push_str(": ");
            iface.print_ty(&p.ty);
        }

        iface.src.push_str(")");
        if matches!(func.kind, FunctionKind::Constructor(_)) {
            iface.src.push_str("\n");
            return;
        }
        iface.src.push_str(": ");

        // Sync lowered async functions must return Promises,
        // so we must do some extra check
        let is_async_fn = matches!(
            func.kind,
            FunctionKind::AsyncFreestanding
                | FunctionKind::AsyncMethod(_)
                | FunctionKind::AsyncStatic(_)
        );
        let promise_wrap_result = requires_async_porcelain || is_async_fn;

        if promise_wrap_result {
            iface
                .src
                .push_str(&format!("{}<", iface.names.global("Promise")));
        }

        Self::print_func_result(iface, func);

        if promise_wrap_result {
            // closes `Promise<>`
            iface.src.push_str(">");
            if host_implemented {
                iface.src.push_str(" | ");
                Self::print_func_result(iface, func);
            }
        }

        let end_character = if declaration { ';' } else { ',' };
        iface.src.push_str(format!("{end_character}\n").as_str());
    }

    /// Print the type of the value that a function returns when it does not throw.
    fn print_func_result(iface: &mut TsInterface<'a>, func: &Function) {
        if let Some((ok_ty, _)) = get_thrown_type(iface.resolve, func.result) {
            iface.print_optional_ty(ok_ty);
        } else {
            match func.result {
                None => iface.src.push_str("void"),
                Some(ty) => iface.print_ty(&ty),
            }
        }
    }

    fn post_types(&mut self) {
        let needs_ty_option =
            self.needs_ty_option || self.resources.iter().any(|(_, r)| r.1.needs_ty_option);
        let needs_ty_result =
            self.needs_ty_result || self.resources.iter().any(|(_, r)| r.1.needs_ty_result);
        if needs_ty_option {
            self.src
                .push_str(&ts_option_type_alias(&self.names.option_alias()));
        }
        if needs_ty_result {
            self.src.push_str(&ts_result_type_alias(
                &self.names.result_alias(),
                self.optional_result_payloads,
            ));
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
        if self.flags_as_bigint {
            let name = name.to_upper_camel_case();
            self.src
                .push_str(&format!("export type {name} = bigint;\n"));
            self.type_flags_namespace(&name, flags);
            return;
        }
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
        if !self.variants_inline_cases {
            // A case whose interface would take the name of another declaration
            // of the module is inlined in the union instead of being declared.
            let names = Rc::clone(&self.names);
            let is_inlined = |case: &Case| {
                names
                    .inlined_variant_cases
                    .contains(&variant_case_name(name, &case.name))
            };

            self.src
                .push_str(&format!("export type {} =", name.to_upper_camel_case()));
            if variant.cases.iter().any(is_inlined) {
                self.src.indent(1);
                for case in variant.cases.iter() {
                    self.src.push_str("\n| ");
                    if is_inlined(case) {
                        self.src.push_str("{\n");
                        self.docs(&case.docs);
                        self.print_variant_case_members(case);
                        self.src.push_str("}");
                    } else {
                        self.src.push_str(&variant_case_name(name, &case.name));
                    }
                }
                self.src.deindent(1);
            } else {
                for (i, case) in variant.cases.iter().enumerate() {
                    self.src.push_str(if i > 0 { " | " } else { " " });
                    self.src.push_str(&variant_case_name(name, &case.name));
                }
            }
            self.src.push_str(";\n");

            for case in variant.cases.iter().filter(|case| !is_inlined(case)) {
                self.docs(&case.docs);
                self.src.push_str(&format!(
                    "export interface {} {{\n",
                    variant_case_name(name, &case.name)
                ));
                self.print_variant_case_members(case);
                self.src.push_str("}\n");
            }
            self.type_variant_namespace(name, variant);
            return;
        }

        // Keep the cases inline so a variant `foo` with a case `bar` cannot
        // synthesize a `FooBar` name that collides with a WIT type `foo-bar`.
        // Consumers can still name one case with `Extract<Foo, { tag: 'bar' }>`.
        self.src
            .push_str(&format!("export type {} =", name.to_upper_camel_case()));
        self.src.indent(1);
        for case in variant.cases.iter() {
            self.src.push_str("\n");
            self.src.push_str("| {\n");
            self.docs(&case.docs);
            self.print_variant_case_members(case);
            self.src.push_str("}");
        }
        self.src.deindent(1);
        self.src.push_str(";\n");
        self.type_variant_namespace(name, variant);
    }

    /// Print the `tag` and `val` members of the object type of a variant case
    fn print_variant_case_members(&mut self, case: &Case) {
        self.src.push_str("tag: '");
        self.src.push_str(&case.name);
        self.src.push_str("',\n");
        if let Some(ty) = case.ty {
            self.src.push_str("val: ");
            self.print_ty(&ty);
            self.src.push_str(",\n");
        }
    }

    fn type_option(&mut self, _id: TypeId, name: &str, payload: &Type, docs: &Docs) {
        self.docs(docs);
        let name = name.to_upper_camel_case();
        self.src.push_str(&format!("export type {name} = "));
        if maybe_null(self.resolve, payload) {
            self.needs_ty_option = true;
            self.src
                .push_str(&format!("{}<", self.names.option_alias()));
            self.print_ty(payload);
            self.src.push_str(">");
        } else {
            self.print_ty(payload);
            self.src.push_str(" | undefined");
        }
        self.src.push_str(";\n");
    }

    fn type_flags_namespace(&mut self, name: &str, flags: &Flags) {
        self.src.push_str(&format!("export const {name}: {{\n"));
        for flag in flags.flags.iter() {
            self.docs(&flag.docs);
            self.src.push_str(&format!(
                "readonly {}: bigint,\n",
                flag.name.to_upper_camel_case()
            ));
        }
        self.src.push_str("};\n");
    }

    fn type_enum_namespace(&mut self, name: &str, enum_: &Enum) {
        if !self.use_namespace_objects {
            return;
        }
        let name = name.to_upper_camel_case();
        self.src.push_str(&format!("export const {name}: {{\n"));
        for case in &enum_.cases {
            self.docs(&case.docs);
            let case_value =
                crate::enum_case_name(&case.name, self.enum_values_screaming_snake_case);
            self.src.push_str(&format!(
                "readonly {}: '{}',\n",
                case.name.to_upper_camel_case(),
                case_value
            ));
        }
        self.src.push_str("};\n");
    }

    fn type_variant_namespace(&mut self, name: &str, variant: &Variant) {
        if !self.use_namespace_objects {
            return;
        }
        let name = name.to_upper_camel_case();
        self.src.push_str(&format!("export const {name}: {{\n"));
        for case in &variant.cases {
            self.docs(&case.docs);
            self.src
                .push_str(&format!("readonly {}: (", case.name.to_upper_camel_case()));
            if let Some(ty) = &case.ty {
                self.src.push_str("val: ");
                self.print_ty(ty);
            }
            self.src.push_str(&format!(
                ") => {}<{name}, {{ tag: '{}' }}>,\n",
                self.names.global("Extract"),
                case.name
            ));
        }
        self.src.push_str("};\n");
    }

    fn type_result(&mut self, _id: TypeId, name: &str, result: &Result_, docs: &Docs) {
        self.docs(docs);
        let name = name.to_upper_camel_case();
        self.needs_ty_result = true;
        self.src.push_str(&format!(
            "export type {name} = {}<",
            self.names.result_alias()
        ));
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
            let case_name =
                crate::enum_case_name(&case.name, self.enum_values_screaming_snake_case);
            self.src.push_str(&js_string_literal(&case_name));
        }
        self.src.push_str(";\n");
        self.type_enum_namespace(name, enum_);
    }

    fn type_alias(&mut self, name: &str, ty: &Type, parent_id: Option<InterfaceId>, docs: &Docs) {
        let owner_not_parent = match ty {
            Type::Id(type_def_id) => {
                let ty = &self.resolve.types[*type_def_id];
                match ty.owner {
                    TypeOwner::Interface(i) => {
                        if let Some(parent_id) = parent_id {
                            if parent_id == i {
                                None
                            } else {
                                Some((i, self.resolve.id_of(i).unwrap()))
                            }
                        } else {
                            Some((i, self.resolve.id_of(i).unwrap()))
                        }
                    }
                    _ => None,
                }
            }
            _ => None,
        };
        let type_name = name.to_upper_camel_case();
        match owner_not_parent {
            Some((owned_interface, owned_interface_id)) => {
                // The import path names the immediate owner, so retain that
                // interface's alias name rather than the ultimate target's.
                let Type::Id(orig_id) = ty else {
                    unreachable!()
                };
                let orig_name = self.resolve.types[*orig_id]
                    .name
                    .as_ref()
                    .unwrap()
                    .to_upper_camel_case();
                let owned_interface_name = interface_file_stem(
                    &self.interface_file_stems,
                    owned_interface,
                    &owned_interface_id,
                );
                // An exported interface uses the types of the import side of
                // another interface, unless the world exports that one as well.
                let owner_is_export_side =
                    self.is_export_side && self.exported_interfaces.contains(&owned_interface);
                let path_prefix = match (self.is_root, self.is_export_side, owner_is_export_side) {
                    (true, _, _) => format!("./{INTERFACES_DIR}/"),
                    (false, true, false) => "../".to_string(),
                    (false, _, _) => "./".to_string(),
                };
                let import_name = if self.is_guest {
                    self.references
                        .insert(format!("{path_prefix}{owned_interface_name}.d.ts"));
                    if owner_is_export_side {
                        guest_export_module(&owned_interface_id)
                    } else {
                        owned_interface_id
                    }
                } else {
                    format!("{path_prefix}{owned_interface_name}.js")
                };
                // The alias has no documentation of its own, but may have tags.
                self.docs(&Docs::default());
                uwriteln!(
                    self.src,
                    "export type {type_name} = import('{import_name}').{orig_name};",
                );
            }
            _ => {
                self.docs(docs);
                self.src.push_str(&format!("export type {type_name} = "));
                self.print_ty(ty);
                self.src.push_str(";\n");
            }
        }

        if let Type::Id(id) = ty {
            let kind = self.resolve.types[dealias(self.resolve, *id)].kind.clone();
            match &kind {
                TypeDefKind::Flags(flags) if self.flags_as_bigint => {
                    self.type_flags_namespace(&type_name, flags)
                }
                TypeDefKind::Enum(enum_) => self.type_enum_namespace(name, enum_),
                TypeDefKind::Variant(variant) => self.type_variant_namespace(name, variant),
                _ => {}
            }
        }
    }

    fn type_future(&mut self, name: &str, element_ty: &Option<Type>, docs: &Docs) {
        self.docs(docs);
        self.src
            .push_str(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_future_ty(element_ty.as_ref());
        self.src.push_str(";\n");
    }

    fn type_stream(&mut self, name: &str, element_ty: &Option<Type>, docs: &Docs) {
        self.docs(docs);
        self.src
            .push_str(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_stream_ty(element_ty.as_ref());
        self.src.push_str(";\n");
    }

    fn type_list(&mut self, _id: TypeId, name: &str, element_ty: &Type, docs: &Docs) {
        self.docs(docs);
        self.src
            .push_str(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_list_ty(element_ty);
        self.src.push_str(";\n");
    }

    fn type_map(&mut self, _id: TypeId, name: &str, key: &Type, value: &Type, docs: &Docs) {
        self.docs(docs);
        self.src
            .push_str(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_map_ty(key, value);
        self.src.push_str(";\n");
    }

    fn type_fixed_size_list(&mut self, _id: TypeId, name: &str, ty: &Type, len: &u32, docs: &Docs) {
        self.docs(docs);
        self.src
            .push_str(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_fixed_size_list(ty, len);
        self.src.push_str(";\n");
    }

    fn type_resource(&mut self, id: TypeId, ty: &TypeDef, meta: GeneratedTypeMeta) {
        let resource = ty.name.clone().unwrap();
        // The class is declared once all of its functions are known, so its
        // documentation comment is kept until then.
        let src = std::mem::take(&mut self.src);
        self.docs(&ty.docs);
        let class_docs = std::mem::replace(&mut self.src, src);
        let (_, class) = self.resources.entry(resource).or_insert_with(|| {
            (
                meta,
                TsInterface::new(
                    self.resolve,
                    false,
                    self.is_guest,
                    self.flags_as_bigint,
                    self.variants_inline_cases,
                    self.use_namespace_objects,
                    self.enum_values_screaming_snake_case,
                )
                .with_type_generation(self.type_generation)
                .with_interface_file_stems(&self.interface_file_stems)
                .with_names(&self.names),
            )
        });
        class.class_docs = class_docs;
        class.resource_brand = resource_brand(self.resolve, id);
    }
}

/// The interface exports of a world that are also exported under the short
/// name of their interface, by that short name.
///
/// The bindings export an interface under its short name unless another export
/// has that name. Of the exports that share a short name, such as the versions
/// of one interface, the first in the order of their names has it.
fn interface_export_aliases(resolve: &Resolve, world: &World) -> BTreeMap<String, String> {
    let export_names: BTreeSet<String> = world
        .exports
        .keys()
        .map(|key| match key {
            WorldKey::Name(name) => name.to_lower_camel_case(),
            WorldKey::Interface(interface) => resolve.id_of(*interface).unwrap_or_default(),
        })
        .collect();
    let mut aliases = BTreeMap::new();
    for export_name in &export_names {
        if !export_name.contains('/') {
            continue;
        }
        let Some((_, _, interface_name)) = parse_world_key(export_name) else {
            continue;
        };
        let alias = interface_name.to_lower_camel_case();
        if !export_names.contains(&alias) && !aliases.contains_key(&alias) {
            aliases.insert(alias, export_name.clone());
        }
    }
    aliases
}

/// The name that identifies a resource to the type checker.
///
/// The name holds the semver compatible track of the resource's package
/// rather than its version, so that it is the same in every version of the
/// package that is compatible with this one.
fn resource_brand(resolve: &Resolve, id: TypeId) -> String {
    let ty = &resolve.types[crate::dealias(resolve, id)];
    let resource = ty.name.as_deref().unwrap_or_default();
    let (package, owner) = match ty.owner {
        TypeOwner::Interface(interface_id) => {
            let interface = &resolve.interfaces[interface_id];
            if let Some(name) = &interface.name {
                (interface.package, name.clone())
            } else {
                // Inline interfaces have no package-qualified interface name.
                // Their world and import/export label identify the resource,
                // including when two inline interfaces use the same type name.
                resolve
                    .worlds
                    .iter()
                    .find_map(|(_, world)| {
                        for (direction, items) in
                            [("import", &world.imports), ("export", &world.exports)]
                        {
                            for (key, item) in items {
                                if let (WorldKey::Name(label), WorldItem::Interface { id, .. }) =
                                    (key, item)
                                    && *id == interface_id
                                {
                                    return Some((
                                        world.package,
                                        format!("world:{}/{direction}:{label}", world.name),
                                    ));
                                }
                            }
                        }
                        None
                    })
                    .expect("an inline resource interface belongs to a world")
            }
        }
        TypeOwner::World(world_id) => {
            let world = &resolve.worlds[world_id];
            (world.package, format!("world:{}", world.name))
        }
        TypeOwner::None => return resource.to_string(),
    };
    let Some(package) = package else {
        return format!("{owner}#{resource}");
    };
    let package = &resolve.packages[package].name;
    let track = match &package.version {
        Some(version) => format!("@{}", PackageName::version_compat_track_string(version)),
        None => String::new(),
    };
    format!(
        "{}:{}/{owner}{track}#{resource}",
        package.namespace, package.name
    )
}

/// JSDoc tags for WIT feature gates and deprecations.
/// Introduction versions are left to the WIT contract, since they do not identify
/// the JavaScript package release that introduced the generated declaration.
fn stability_tags(stability: &Stability) -> Vec<String> {
    let (mut tags, deprecated) = match stability {
        Stability::Unknown => return Vec::new(),
        Stability::Stable { deprecated, .. } => (Vec::new(), deprecated),
        Stability::Unstable {
            feature,
            deprecated,
        } => (
            vec![format!(
                "@experimental Gated by the WIT feature `{feature}`."
            )],
            deprecated,
        ),
    };
    if let Some(version) = deprecated {
        tags.push(format!("@deprecated since {version}"));
    }
    tags
}

/// Render the name of a method or static function of a class declaration.
///
/// A member spelled `constructor` declares the class constructor, which can
/// neither be `static` nor have a return type, so a WIT function with that
/// name is declared through a computed member name instead.
fn class_member_name(escaped_name: &str) -> String {
    if escaped_name == "constructor" {
        "[\"constructor\"]".to_string()
    } else {
        escaped_name.to_string()
    }
}

/// Stems of the `interfaces/{stem}.d.ts` declaration files, by interface.
type InterfaceFileStems = BTreeMap<InterfaceId, String>;

/// Choose the declaration file stem of each named interface that a world
/// imports or exports.
///
/// A stem is the interface's name without its version, so that file names
/// stay the same across version bumps. Interfaces of one world that differ
/// only in version would share that stem, so each of them has its version
/// appended instead.
fn interface_file_stems(resolve: &Resolve, world: WorldId) -> InterfaceFileStems {
    let world = &resolve.worlds[world];
    let mut interfaces_by_stem: BTreeMap<String, BTreeSet<InterfaceId>> = BTreeMap::new();
    for item in world.imports.values().chain(world.exports.values()) {
        let WorldItem::Interface { id, .. } = item else {
            continue;
        };
        let Some(id_name) = resolve.id_of(*id) else {
            continue;
        };
        interfaces_by_stem
            .entry(interface_goal_name(&id_name))
            .or_default()
            .insert(*id);
    }

    let mut stems = InterfaceFileStems::new();
    for (stem, interfaces) in interfaces_by_stem {
        for &interface in &interfaces {
            let version = resolve.interfaces[interface]
                .package
                .and_then(|package| resolve.packages[package].name.version.as_ref());
            let stem = match version {
                Some(version) if interfaces.len() > 1 => {
                    format!("{stem}-{}", version.to_string().to_kebab_case())
                }
                _ => stem.clone(),
            };
            stems.insert(interface, stem);
        }
    }
    stems
}

/// The declaration file stem of `interface`, whose name is `id_name`.
fn interface_file_stem(
    stems: &InterfaceFileStems,
    interface: InterfaceId,
    id_name: &str,
) -> String {
    stems
        .get(&interface)
        .cloned()
        .unwrap_or_else(|| interface_goal_name(id_name))
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

fn generate_references(references: &BTreeSet<String>) -> String {
    let mut out = String::new();
    for reference in references {
        uwriteln!(out, "/// <reference path=\"{}\" />", reference);
    }
    out
}
