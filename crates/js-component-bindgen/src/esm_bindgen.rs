use heck::ToLowerCamelCase;

use crate::intrinsics::Intrinsic;
use crate::names::{maybe_quote_id, maybe_quote_member, LocalNames};
use crate::source::Source;
use crate::{uwrite, uwriteln, TranspileOpts};
use std::collections::BTreeMap;
use std::fmt::Write;

type LocalName = String;

enum ImportBinding {
    Interface(BTreeMap<String, ImportBinding>),
    // an import binding can have multiple local names,
    // used in eg multi-version workflows
    Local(Vec<LocalName>),
}

enum ExportBinding {
    Interface(BTreeMap<String, ExportBinding>),
    Local(LocalName),
}

#[derive(Default)]
pub struct EsmBindgen {
    imports: BTreeMap<String, ImportBinding>,
    exports: BTreeMap<String, ExportBinding>,
    export_aliases: BTreeMap<String, String>,
}

impl EsmBindgen {
    /// add imported function binding, using a path slice starting with the import specifier as its
    /// first segment
    /// arbitrary nesting of interfaces is supported in order to support virtual WASI interfaces
    /// only two-level nesting supports serialization into imports currently
    pub fn add_import_binding(&mut self, path: &[String], binding_name: String) {
        let mut iface = &mut self.imports;
        for i in 0..path.len() - 1 {
            if !iface.contains_key(&path[i]) {
                iface.insert(
                    path[i].to_string(),
                    ImportBinding::Interface(BTreeMap::new()),
                );
            }
            iface = match iface.get_mut(&path[i]).unwrap() {
                ImportBinding::Interface(iface) => iface,
                ImportBinding::Local(_) => panic!(
                    "Imported interface {} cannot be both a function and an interface",
                    &path[0..i].join(".")
                ),
            };
        }
        if let Some(ref mut existing) = iface.get_mut(&path[path.len() - 1]) {
            match existing {
                ImportBinding::Interface(_) => {
                    unreachable!("Multi-version interfaces must have the same shape")
                }
                ImportBinding::Local(ref mut local_names) => {
                    if !local_names.contains(&binding_name) {
                        local_names.push(binding_name);
                    }
                }
            }
        } else {
            iface.insert(
                path[path.len() - 1].to_string(),
                ImportBinding::Local(vec![binding_name]),
            );
        }
    }

    /// add an exported function binding, optionally on an interface id or kebab name
    pub fn add_export_binding(
        &mut self,
        iface_id_or_kebab: Option<&str>,
        local_name: String,
        func_name: String,
    ) {
        let mut iface = &mut self.exports;
        if let Some(iface_id_or_kebab) = iface_id_or_kebab {
            // convert kebab names to camel case, leave ids as-is
            let iface_id_or_kebab = if iface_id_or_kebab.contains(':') {
                iface_id_or_kebab.to_string()
            } else {
                iface_id_or_kebab.to_lower_camel_case()
            };
            if !iface.contains_key(&iface_id_or_kebab) {
                iface.insert(
                    iface_id_or_kebab.to_string(),
                    ExportBinding::Interface(BTreeMap::new()),
                );
            }
            iface = match iface.get_mut(&iface_id_or_kebab).unwrap() {
                ExportBinding::Interface(iface) => iface,
                ExportBinding::Local(_) => panic!(
                    "Exported interface {} cannot be both a function and an interface",
                    iface_id_or_kebab
                ),
            };
        }
        iface.insert(func_name, ExportBinding::Local(local_name));
    }

    /// once all exports have been created, aliases can be populated for interface
    /// names that do not collide with kebab names or other interface names
    pub fn populate_export_aliases(&mut self) {
        for expt_name in self.exports.keys() {
            if let Some(path_idx) = expt_name.rfind('/') {
                let end = if let Some(version_idx) = expt_name.rfind('@') {
                    version_idx
                } else {
                    expt_name.len()
                };
                let alias = &expt_name[path_idx + 1..end].to_lower_camel_case();
                if !self.exports.contains_key(alias) && !self.export_aliases.contains_key(alias) {
                    self.export_aliases
                        .insert(alias.to_string(), expt_name.to_string());
                }
            }
        }
    }

    /// get the final top-level import specifier list
    pub fn import_specifiers(&self) -> Vec<String> {
        self.imports.keys().map(|impt| impt.to_string()).collect()
    }

    /// get the exports (including exported aliases) from the bindgen
    pub fn exports(&self) -> Vec<(&str, &str)> {
        self.export_aliases
            .iter()
            .map(|(alias, name)| (alias.as_ref(), name.as_ref()))
            .chain(
                self.exports
                    .keys()
                    .map(|name| (name.as_ref(), name.as_ref())),
            )
            .collect()
    }

    pub fn render_exports(
        &mut self,
        output: &mut Source,
        instantiation: bool,
        local_names: &mut LocalNames,
        opts: &TranspileOpts,
    ) {
        if self.exports.is_empty() {
            if instantiation {
                output.push_str("return {}");
            }
            return;
        }
        // first create all the interfaces
        // we currently only support first-level nesting so there is no ordering to figure out
        // in the process we also populate the alias info
        for (export_name, export) in self.exports.iter() {
            let ExportBinding::Interface(iface) = export else {
                continue;
            };
            let (local_name, _) =
                local_names.get_or_create(&format!("export:{export_name}"), export_name);
            uwriteln!(output, "const {local_name} = {{");
            for (func_name, export) in iface {
                let ExportBinding::Local(local_name) = export else {
                    panic!("Unsupported nested export interface");
                };
                uwriteln!(output, "{}: {local_name},", maybe_quote_id(func_name));
            }
            uwriteln!(output, "\n}};");
        }
        uwrite!(
            output,
            "\n{} {{ ",
            if instantiation { "return" } else { "export" }
        );
        let mut first = true;
        for (alias, export_name) in &self.export_aliases {
            if first {
                first = false
            }
            let local_name = match &self.exports[export_name] {
                ExportBinding::Local(local_name) => local_name,
                ExportBinding::Interface(_) => local_names.get(&format!("export:{}", export_name)),
            };
            let alias_maybe_quoted = maybe_quote_id(alias);
            if local_name == alias_maybe_quoted {
                output.push_str(local_name);
                uwrite!(output, ", ");
            } else if instantiation {
                uwrite!(output, "{alias_maybe_quoted}: {local_name}");
                uwrite!(output, ", ");
            } else if !self.contains_js_quote(&alias_maybe_quoted) || !opts.no_namespaced_exports {
                uwrite!(output, "{local_name} as {alias_maybe_quoted}");
                uwrite!(output, ", ");
            }
        }
        for (export_name, export) in &self.exports {
            if first {
                first = false
            }
            let local_name = match export {
                ExportBinding::Local(local_name) => local_name,
                ExportBinding::Interface(_) => local_names.get(&format!("export:{}", export_name)),
            };
            let export_name_maybe_quoted = maybe_quote_id(export_name);
            if local_name == export_name_maybe_quoted {
                output.push_str(local_name);
                uwrite!(output, ", ");
            } else if instantiation {
                uwrite!(output, "{export_name_maybe_quoted}: {local_name}");
                uwrite!(output, ", ");
            } else if !self.contains_js_quote(&export_name_maybe_quoted)
                || !opts.no_namespaced_exports
            {
                uwrite!(output, "{local_name} as {export_name_maybe_quoted}");
                uwrite!(output, ", ");
            }
        }
        uwrite!(output, " }}");
    }

    fn contains_js_quote(&self, js_string: &String) -> bool {
        js_string.contains("\"") || js_string.contains("'") || js_string.contains("`")
    }

    pub fn render_imports(
        &mut self,
        output: &mut Source,
        imports_object: Option<&str>,
        local_names: &mut LocalNames,
    ) {
        let mut iface_imports = Vec::new();
        for (specifier, binding) in &self.imports {
            let idl_binding = if specifier.starts_with("webidl:") {
                let iface_idx = specifier.find('/').unwrap() + 1;
                let iface_name = if let Some(version_idx) = specifier.find('@') {
                    &specifier[iface_idx..version_idx]
                } else {
                    &specifier[iface_idx..]
                };
                Some(if iface_name.starts_with("global-") {
                    &iface_name[7..]
                } else {
                    ""
                })
            } else {
                None
            };
            if imports_object.is_some() || idl_binding.is_some() {
                uwrite!(output, "const ");
            } else {
                uwrite!(output, "import ");
            }
            match binding {
                ImportBinding::Interface(bindings) => {
                    if imports_object.is_none() && idl_binding.is_none() && bindings.len() == 1 {
                        let (import_name, import) = bindings.iter().next().unwrap();
                        if import_name == "default" {
                            match import {
                                ImportBinding::Interface(iface) => {
                                    let iface_local_name = local_names.create_once(specifier);
                                    iface_imports.push((iface_local_name.to_string(), iface));
                                    uwriteln!(output, "{iface_local_name} from '{specifier}';");
                                }
                                ImportBinding::Local(local_names) => {
                                    let local_name = &local_names[0];
                                    uwriteln!(output, "{local_name} from '{specifier}';");
                                    for other_local_name in &local_names[1..] {
                                        uwriteln!(
                                            output,
                                            "const {other_local_name} = {local_name};"
                                        );
                                    }
                                }
                            };
                            continue;
                        }
                    }
                    uwrite!(output, "{{");
                    let mut first = true;
                    for (external_name, import) in bindings {
                        match import {
                            ImportBinding::Interface(iface) => {
                                if first {
                                    output.push_str(" ");
                                    first = false;
                                } else {
                                    output.push_str(", ");
                                }
                                let (iface_local_name, _) = local_names.get_or_create(
                                    &format!("import:{specifier}#{external_name}"),
                                    external_name,
                                );
                                iface_imports.push((iface_local_name.to_string(), iface));
                                if external_name == iface_local_name {
                                    uwrite!(output, "{external_name}");
                                } else if imports_object.is_some() || idl_binding.is_some() {
                                    uwrite!(output, "{external_name}: {iface_local_name}");
                                } else {
                                    uwrite!(output, "{external_name} as {iface_local_name}");
                                }
                            }
                            ImportBinding::Local(local_names) => {
                                for local_name in local_names {
                                    if first {
                                        output.push_str(" ");
                                        first = false;
                                    } else {
                                        output.push_str(", ");
                                    }
                                    if external_name == local_name {
                                        uwrite!(output, "{external_name}");
                                    } else if imports_object.is_some() || idl_binding.is_some() {
                                        uwrite!(output, "{external_name}: {local_name}");
                                    } else {
                                        uwrite!(output, "{external_name} as {local_name}");
                                    }
                                }
                            }
                        };
                    }
                    if !first {
                        output.push_str(" ");
                    }
                    if let Some(imports_object) = imports_object {
                        uwriteln!(
                            output,
                            "}} = {imports_object}{};",
                            maybe_quote_member(specifier)
                        );
                    } else if let Some(idl_binding) = idl_binding {
                        uwrite!(output, "}} = {}()", Intrinsic::GlobalThisIdlProxy.name());
                        if idl_binding != "" {
                            for segment in idl_binding.split('-') {
                                uwrite!(output, ".{}()", segment.to_lowercase());
                            }
                        }
                        uwrite!(output, ";\n");
                    } else {
                        uwriteln!(output, "}} from '{specifier}';");
                    }
                }
                ImportBinding::Local(local_names) => {
                    let local_name = &local_names[0];
                    if let Some(imports_object) = imports_object {
                        uwriteln!(
                            output,
                            "{local_name} = {imports_object}{}.default;",
                            maybe_quote_member(specifier)
                        );
                    } else {
                        uwriteln!(output, "{local_name} from '{specifier}';");
                    }
                    for other_local_name in &local_names[1..] {
                        uwriteln!(output, "const {other_local_name} = {local_name};");
                    }
                }
            }
        }
        // render interface import member getters
        for (iface_local_name, iface_imports) in iface_imports {
            uwrite!(output, "const {{");
            let mut first = true;
            for (member_name, binding) in iface_imports {
                let ImportBinding::Local(local_names) = binding else {
                    continue;
                };
                for local_name in local_names {
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
            }
            if !first {
                output.push_str(" ");
            }
            uwriteln!(output, "}} = {iface_local_name};");
        }
    }
}
