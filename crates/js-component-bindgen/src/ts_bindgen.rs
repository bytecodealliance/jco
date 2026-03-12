use std::collections::btree_map::Entry;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fmt::Write;

use anyhow::{Context as _, Result};
use heck::{ToKebabCase, ToLowerCamelCase, ToUpperCamelCase};
use log::debug;
use wit_bindgen_core::wit_parser::{
    Docs, Enum, Flags, Function, FunctionKind, Handle, InterfaceId, Record, Resolve, Result_,
    Tuple, Type, TypeDef, TypeDefKind, TypeId, TypeOwner, Variant, WorldId, WorldItem, WorldKey,
};

use crate::files::Files;
use crate::function_bindgen::{as_nullable, js_array_ty, maybe_null};
use crate::names::{LocalNames, RESERVED_KEYWORDS, is_valid_js_identifier, maybe_quote_id};
use crate::source::Source;
use crate::transpile_bindgen::{AsyncMode, InstantiationMode, TranspileOpts, parse_world_key};
use crate::{
    FunctionIdentifier, dealias, feature_gate_allowed, get_thrown_type, requires_async_porcelain,
    uwrite, uwriteln,
};

struct TsBindgen {
    /// The source code for the "main" file that's going to be created for the
    /// component we're generating bindings for. This is incrementally added to
    /// over time and primarily contains the main `instantiate` function as well
    /// as a type-description of the input/output interfaces.
    src: Source,

    interface_names: LocalNames,
    local_names: LocalNames,

    /// TypeScript definitions which will become the import object
    import_object: Source,
    /// TypeScript definitions which will become the export object
    export_object: Source,

    /// Whether to generate types for a guest module.
    ///
    /// For guest types, ambient modules are generated and imported using `ns:pkg/iface`.
    /// For host types, concrete modules are generated and imported using `./interfaces/{id}.js`.
    is_guest: bool,

    async_imports: HashSet<String>,
    async_exports: HashSet<String>,

    /// A set of all interface files that are referenced by the generated
    /// definitions. This is used to generate `/// <reference path="..." />`
    /// directives at the top of the file.
    references: BTreeSet<String>,
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
    resolve: &'a Resolve,
    has_constructor: bool,
    needs_ty_option: bool,
    needs_ty_result: bool,
    needs_module_end: bool,
    local_names: LocalNames,
    resources: BTreeMap<String, (GeneratedTypeMeta, TsInterface<'a>)>,
    references: BTreeSet<String>,
}

pub fn ts_bindgen(
    name: &str,
    resolve: &Resolve,
    id: WorldId,
    opts: &TranspileOpts,
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
        import_object: Source::default(),
        export_object: Source::default(),
        is_guest: opts.guest,
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
                                opts.instantiation.is_some(),
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

                    let mut generator = TsInterface::new(resolve, true, opts.guest);
                    generator.docs(&ty.docs);
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
                        TypeDefKind::Type(t) => generator.type_alias(*id, name, t, None, &ty.docs),
                        TypeDefKind::Future(_) => todo!("(async impl) generate for future"),
                        TypeDefKind::Stream(_) => todo!("(async impl) generate for stream"),
                        TypeDefKind::Unknown => unreachable!("(async impl) generate for unknown"),
                        TypeDefKind::Resource => {
                            generator.type_resource(*id, ty, GeneratedTypeMeta { is_export: false })
                        }
                        TypeDefKind::Handle(_) => todo!("type generation for handle"),
                        TypeDefKind::Map(_, _) => todo!("type generation for map"),
                    }
                    let (src, references) = generator.finish();
                    bindgen.src.push_str(&src);
                    bindgen.references.extend(references);
                }
            }
        }
        // kebab import funcs (always default imports)
        for (name, func) in funcs {
            bindgen.import_funcs(resolve, &name, func, files);
        }
        // namespace imports are grouped by namespace / kebab name
        // kebab name imports are direct
        for (name, import_interfaces) in interface_imports {
            bindgen.world_import_interfaces(
                resolve,
                name.as_ref(),
                import_interfaces,
                files,
                opts.instantiation.is_some(),
            );
        }
    }

    let mut funcs = Vec::new();

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

                let instantiation = opts.instantiation.is_some();
                bindgen.export_interface(resolve, export_name, *id, files, instantiation);
                // Also export the interface name as a type alias
                let alt_export_name = iface_name.to_lower_camel_case();
                if alt_export_name != export_name {
                    bindgen.export_interface(resolve, &alt_export_name, *id, files, instantiation);
                }
            }
            WorldItem::Type { .. } => unimplemented!("type exports"),
        }
    }
    if !funcs.is_empty() {
        bindgen.export_funcs(resolve, id, &funcs, files, opts.instantiation.is_none());
    }

    let camel = world.name.to_upper_camel_case();

    // Generate a type definition for the import object to type-check
    // all imports to the component.
    //
    // With the current representation of a "world" this is an import object
    // per-imported-interface where the type of that field is defined by the
    // interface bindgen.
    if opts.instantiation.is_some() {
        uwriteln!(bindgen.src, "export interface ImportObject {{");
        bindgen.src.push_str(&bindgen.import_object);
        uwriteln!(bindgen.src, "}}");
    }

    // Generate a type definition for the export object from instantiating
    // the component.
    if opts.instantiation.is_some() {
        uwriteln!(bindgen.src, "export interface {camel} {{",);
        bindgen.src.push_str(&bindgen.export_object);
        uwriteln!(bindgen.src, "}}");
    } else {
        bindgen.src.push_str(&bindgen.export_object);
    }

    if opts.tla_compat && opts.instantiation.is_none() {
        uwriteln!(
            bindgen.src,
            "
            export const $init: Promise<void>;"
        );
    }

    // Generate the TypeScript definition of the `instantiate` function
    // which is the main workhorse of the generated bindings.
    match opts.instantiation {
        Some(InstantiationMode::Async) => {
            uwriteln!(
                bindgen.src,
                "
                    /**
                     * Instantiates this component with the provided imports and
                     * returns a map of all the exports of the component.
                     *
                     * This function is intended to be similar to the
                     * `WebAssembly.instantiate` function. The second `imports`
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
                     * `WebAssembly.Module` object. This would use `compileStreaming`
                     * on the web, for example.
                     */
                    export function instantiate(
                        getCoreModule: (path: string) => WebAssembly.Module,
                        imports: ImportObject,
                        instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => WebAssembly.Instance
                    ): {camel};
                    export function instantiate(
                        getCoreModule: (path: string) => WebAssembly.Module | Promise<WebAssembly.Module>,
                        imports: ImportObject,
                        instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => WebAssembly.Instance | Promise<WebAssembly.Instance>
                    ): {camel} | Promise<{camel}>;
                ",
            )
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
                     */
                    export function instantiate(
                        getCoreModule: (path: string) => WebAssembly.Module,
                        imports: ImportObject,
                        instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => WebAssembly.Instance
                    ): {camel};
                ",
            )
        }

        None => {}
    }

    if bindgen.is_guest {
        uwriteln!(bindgen.src, "}}");
    }

    let filename = format!("{name}.d.ts");
    files.push(
        &filename,
        generate_references(&bindgen.references).as_bytes(),
    );
    files.push(&filename, bindgen.src.as_bytes());
    Ok(())
}

impl TsBindgen {
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
            let local_name = self.import_interface(name, resolve, id, files);
            uwriteln!(
                self.import_object,
                "{}: typeof {local_name},",
                maybe_quote_id(name)
            );
        } else {
            // Generate a type-only export (`export type *` instead of `export *`).
            // so that users can use the interface types, even though there is no runtime code.
            //
            // For implements items (where a plain label like "primary" maps to
            // a named interface like "ns:pkg/store"), use the label as the
            // export alias so each instance gets a distinct name.
            let id_name = resolve.id_of(id).unwrap_or_else(|| name.to_string());
            let import_path = self.generate_interface(
                // For implements items, both labels resolve to the same interface
                // and share a single .d.ts file via generate_interface's dedup.
                // The label is only used as the UpperCamelCase export alias.
                name,
                resolve,
                id,
                files,
                GeneratedTypeMeta { is_export: false },
            );
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
                    let local_name = self.import_interface(name, resolve, **id, files);
                    uwriteln!(self.import_object, "typeof {local_name},",);
                    return;
                }
            }
            uwriteln!(self.import_object, "{}: {{", maybe_quote_id(import_name));
            for (iface_name, &id) in ifaces {
                let name = resolve.interfaces[id].name.as_ref().unwrap();
                let local_name = self.import_interface(name, resolve, id, files);
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
    ) {
        uwriteln!(self.import_object, "{}: {{", maybe_quote_id(import_name));
        let mut generator = TsInterface::new(resolve, false, self.is_guest);
        generator.ts_func(
            func,
            true,
            false,
            false,
            &GeneratedTypeMeta { is_export: false },
        );
        let (src, references) = generator.finish();
        self.import_object.push_str(&src);
        self.references.extend(references);
        uwriteln!(self.import_object, "}},");
    }

    fn export_interface(
        &mut self,
        resolve: &Resolve,
        export_name: &str,
        id: InterfaceId,
        files: &mut Files,
        instantiation: bool,
    ) {
        if instantiation {
            let local_name = self.import_interface(export_name, resolve, id, files);
            uwriteln!(
                self.export_object,
                "{}: typeof {local_name},",
                maybe_quote_id(export_name)
            );
        } else if export_name != maybe_quote_id(export_name) {
            // TODO: TypeScript doesn't currently support
            // non-identifier exports
            // tracking in https://github.com/microsoft/TypeScript/issues/40594
        } else {
            let id_name = resolve.id_of(id).unwrap_or_else(|| export_name.to_string());
            let file_name = self.generate_interface(
                export_name,
                resolve,
                id,
                files,
                GeneratedTypeMeta { is_export: true },
            );
            uwriteln!(
                self.export_object,
                "export * as {export_name} from '{file_name}'; // export {id_name}"
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
        let mut generator = TsInterface::new(resolve, false, self.is_guest);
        let id_name = &resolve.worlds[world].name;

        for (_, func) in funcs {
            let requires_async_porcelain = requires_async_porcelain(
                FunctionIdentifier::Fn(func),
                id_name,
                &self.async_exports,
            );
            generator.ts_func(
                func,
                false,
                declaration,
                requires_async_porcelain,
                &GeneratedTypeMeta { is_export: true },
            );
        }

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
    ) -> String {
        let id_name = resolve.id_of(id).unwrap_or_else(|| name.to_string());
        let goal_name = interface_goal_name(&id_name);
        let file_name = self.generate_interface(
            name,
            resolve,
            id,
            files,
            GeneratedTypeMeta { is_export: false },
        );

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
        let goal_name_kebab = goal_name.to_kebab_case();
        let file_stem = format!("interfaces/{goal_name_kebab}");
        let file_name = format!("{file_stem}.d.ts");
        let (_name, iface_exists) = self.interface_names.get_or_create(&file_name, &goal_name);

        if !iface_exists {
            let mut generator = TsInterface::new(resolve, false, self.is_guest);
            generator.begin(&id_name); // Write module declaration

            // Generate function definitions
            let async_funcs = if resolve.exports_interface(interface_id) {
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

        if self.is_guest {
            self.references.insert(format!("./{file_name}"));
            id_name
        } else {
            format!("./{file_stem}.js")
        }
    }
}

impl<'a> TsInterface<'a> {
    fn new(resolve: &'a Resolve, is_root: bool, is_guest: bool) -> Self {
        TsInterface {
            is_root,
            is_guest,
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

    fn begin(&mut self, id_name: &str) {
        if self.is_guest {
            uwriteln!(self.src, "declare module '{id_name}' {{");
            self.needs_module_end = true;
        } else {
            uwriteln!(self.src, "/** @module Interface {id_name} **/");
        }
    }

    fn finish(mut self) -> (Source, BTreeSet<String>) {
        for (resource, (meta, source)) in self.resources {
            let (impl_phrase, extra_members) = if self.is_guest && meta.is_import() {
                // Resources types imported in the guest  will have generated [Symbol.dispose]()
                // for resource cleanup, but this is not the case for any other scenario.
                (" implements Disposable", vec!["[Symbol.dispose](): void;"])
            } else {
                ("", vec![])
            };

            uwriteln!(
                self.src,
                "\nexport class {class_name}{impl_phrase} {{",
                class_name = resource.to_upper_camel_case(),
            );
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

    fn docs_raw(&mut self, docs: &str) {
        self.src.push_str("/**\n");
        for line in docs.lines() {
            self.src.push_str(&format!(" * {line}\n"));
        }
        self.src.push_str(" */\n");
    }

    fn docs(&mut self, docs: &Docs) {
        if let Some(docs) = &docs.contents {
            self.docs_raw(docs);
        }
    }

    fn types(&mut self, iface_id: InterfaceId) {
        let iface = &self.resolve.interfaces[iface_id];

        for (name, id) in iface.types.iter() {
            let ty = &self.resolve.types[*id];
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
                TypeDefKind::Type(t) => self.type_alias(*id, name, t, Some(iface_id), &ty.docs),
                TypeDefKind::Future(_) => todo!("(async impl) generate for future"),
                TypeDefKind::Stream(_) => todo!("(async impl) generate for stream"),
                TypeDefKind::Unknown => unreachable!("unexpectedly unknown type def"),
                TypeDefKind::Resource => self.type_resource(
                    *id,
                    ty,
                    GeneratedTypeMeta {
                        is_export: self.resolve.exports_interface(iface_id),
                    },
                ),
                TypeDefKind::Handle(_) => todo!("types for handle"),
                TypeDefKind::Map(_, _) => todo!("types for map<k,v>"),
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
                    TypeDefKind::Variant(_) => panic!("[print_ty()] anonymous variant"),
                    TypeDefKind::List(v) => self.print_list_ty(v),
                    TypeDefKind::FixedLengthList(v, len) => self.print_fixed_size_list(v, len),
                    TypeDefKind::Future(maybe_ty) => {
                        self.src.push_str("Promise<");
                        self.print_optional_ty(maybe_ty.as_ref());
                        self.src.push_str(">");
                    }
                    TypeDefKind::Stream(maybe_ty) => {
                        self.src.push_str("ReadableStream<");
                        self.print_optional_ty(maybe_ty.as_ref());
                        self.src.push_str(">");
                    }
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
                    TypeDefKind::Map(_, _) => todo!("[print_ty()] map"),
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

    /// Print the list type
    fn print_list_ty(&mut self, ty: &Type) {
        match js_array_ty(self.resolve, ty) {
            Some("Uint8Array") => self.src.push_str("Uint8Array"),
            Some(ty) => self.src.push_str(ty),
            None => {
                self.src.push_str("Array<");
                self.print_ty(ty);
                self.src.push_str(">");
            }
        }
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
                        TsInterface::new(self.resolve, false, self.is_guest),
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
        let iface = self.iface_for(func, meta);
        iface.docs(&func.docs);

        let out_name = if default {
            "default".to_string()
        } else {
            func.item_name().to_lower_camel_case()
        };

        let escaped_name = if is_valid_js_identifier(&out_name) {
            out_name.to_string()
        } else {
            format!("'{out_name}'")
        };

        if declaration {
            match func.kind {
                FunctionKind::Freestanding | FunctionKind::AsyncFreestanding => {
                    if is_valid_js_identifier(&out_name) {
                        iface.src.push_str(&format!("export function {out_name}"));
                    } else {
                        let (local_name, _) = iface.local_names.get_or_create(&out_name, &out_name);
                        iface
                            .src
                            .push_str(&format!("export {{ {local_name} as {out_name} }};\n"));
                        iface.src.push_str(&format!("function {local_name}"));
                    }
                }
                FunctionKind::Constructor(_) => {
                    iface.has_constructor = true;
                    iface.src.push_str("constructor");
                }
                FunctionKind::Static(_) | FunctionKind::AsyncStatic(_) => {
                    iface.src.push_str(&format!("static {escaped_name}"));
                }
                FunctionKind::Method(_) | FunctionKind::AsyncMethod(_) => {
                    iface.src.push_str(&escaped_name);
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
            iface.src.push_str("Promise<");
        }

        if let Some((ok_ty, _)) = get_thrown_type(iface.resolve, func.result) {
            iface.print_optional_ty(ok_ty);
        } else {
            match func.result {
                None => iface.src.push_str("void"),
                Some(ty) => iface.print_ty(&ty),
            }
        }

        if promise_wrap_result {
            // closes `Promise<>`
            iface.src.push_str(">");
        }

        let end_character = if declaration { ';' } else { ',' };
        iface.src.push_str(format!("{end_character}\n").as_str());
    }

    fn post_types(&mut self) {
        let needs_ty_option =
            self.needs_ty_option || self.resources.iter().any(|(_, r)| r.1.needs_ty_option);
        let needs_ty_result =
            self.needs_ty_result || self.resources.iter().any(|(_, r)| r.1.needs_ty_result);
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
                            if parent_id == i {
                                None
                            } else {
                                Some(self.resolve.id_of(i).unwrap())
                            }
                        } else {
                            Some(self.resolve.id_of(i).unwrap())
                        }
                    }
                    _ => None,
                }
            }
            _ => None,
        };
        let path_prefix = if self.is_root { "./interfaces/" } else { "./" };
        let type_name = name.to_upper_camel_case();
        match owner_not_parent {
            Some(owned_interface_id) => {
                let orig_id = dealias(self.resolve, id);
                let orig_name = self.resolve.types[orig_id]
                    .name
                    .as_ref()
                    .unwrap()
                    .to_upper_camel_case();
                let owned_interface_name = interface_goal_name(&owned_interface_id);
                let import_name = if self.is_guest {
                    self.references
                        .insert(format!("{path_prefix}{owned_interface_name}.d.ts"));
                    owned_interface_id
                } else {
                    format!("{path_prefix}{owned_interface_name}.js")
                };
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
    }

    fn type_list(&mut self, _id: TypeId, name: &str, element_ty: &Type, docs: &Docs) {
        self.docs(docs);
        self.src
            .push_str(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_list_ty(element_ty);
        self.src.push_str(";\n");
    }

    fn type_fixed_size_list(&mut self, _id: TypeId, name: &str, ty: &Type, len: &u32, docs: &Docs) {
        self.docs(docs);
        self.src
            .push_str(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_fixed_size_list(ty, len);
        self.src.push_str(";\n");
    }

    fn type_resource(&mut self, _id: TypeId, ty: &TypeDef, meta: GeneratedTypeMeta) {
        let resource = ty.name.clone().unwrap();
        self.resources
            .entry(resource)
            .or_insert_with(|| (meta, TsInterface::new(self.resolve, false, self.is_guest)));
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

fn generate_references(references: &BTreeSet<String>) -> String {
    let mut out = String::new();
    for reference in references {
        uwriteln!(out, "/// <reference path=\"{}\" />", reference);
    }
    out
}

trait ResolveExt {
    /// Check whether a certain interface is exported
    fn exports_interface(&self, iface_id: InterfaceId) -> bool;
}

impl ResolveExt for Resolve {
    fn exports_interface(&self, iface_id: InterfaceId) -> bool {
        for (_world_id, world) in self.worlds.iter() {
            for (world_key, world_item) in world.exports.iter() {
                if matches!(world_key, WorldKey::Interface(iid) if *iid == iface_id) {
                    return true;
                }
                // Also check implements items where key is Name but item has the interface
                if matches!(world_item, WorldItem::Interface { id, .. } if *id == iface_id) {
                    return true;
                }
            }
        }
        false
    }
}
