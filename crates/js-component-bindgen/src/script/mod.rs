//! Script engines and script-only components.
//!
//! `jco componentize` normally bakes one script into one JavaScript engine. This module supports
//! the alternative split: an *engine* component, built once from the union of the worlds its
//! scripts target, and *script-only* components that merely package a script's source. At
//! runtime a host instantiates the engine, reads the script out of a script-only component and
//! hands it to the engine through `jco:script-engine/script-loader`.
//!
//! The module does not run a JavaScript engine itself. [`engine_world`] produces the merged WIT
//! and a generated bootstrap module; the caller componentizes that module with ComponentizeJS or
//! componentize-qjs exactly as it would any other script. [`script_component`] packages a
//! bundled ES module as a component without any engine at all.

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use heck::{ToLowerCamelCase, ToUpperCamelCase};
use wasm_encoder::{
    CodeSection, ConstExpr, DataSection, ExportKind, ExportSection, Function, FunctionSection,
    Instruction, MemorySection, MemoryType, Module, TypeSection, ValType,
};
use wasm_metadata::Producers;
use wit_component::{ComponentEncoder, StringEncoding, WitPrinter};
use wit_parser::{
    CloneMaps, FunctionKind, Interface, InterfaceId, PackageId, Resolve, Span, TypeDefKind,
    WorldId, WorldItem, WorldKey,
};

/// WIT for `jco:script-engine`, the loader interface every engine exports.
pub const SCRIPT_ENGINE_WIT: &str = include_str!("script-engine.wit");

/// WIT for `jco:script`, the world script-only components export.
pub const SCRIPT_WIT: &str = include_str!("script.wit");

/// Name of the world [`engine_world`] produces.
pub const ENGINE_WORLD_NAME: &str = "engine";

/// Fully-qualified name of the world [`engine_world`] produces.
pub const ENGINE_WORLD_ID: &str = "jco:script-engine/engine@0.1.0";

/// Name of the world script-only components export.
pub const SCRIPT_ONLY_WORLD_NAME: &str = "script-only";

/// World key of the script loader interface every engine exports.
const SCRIPT_LOADER_KEY: &str = "jco:script-engine/script-loader@0.1.0";

/// JavaScript export name of the script loader interface on an engine.
const SCRIPT_LOADER_EXPORT: &str = "scriptLoader";

/// A world that a script engine must support.
#[derive(Debug, Clone)]
pub struct WitInput {
    /// Path to a WIT file or directory.
    pub path: PathBuf,
    /// World to select within the package; the package's only world when `None`.
    pub world: Option<String>,
}

/// The JavaScript engine the bootstrap module will be componentized with.
///
/// The engines agree on how exports are looked up but differ in how a script imports a
/// function declared directly on the world.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
    StarlingMonkey,
    QuickJs,
}

/// A merged engine world and the bootstrap module that implements it.
#[derive(Debug, Clone)]
pub struct EngineWorld {
    /// Single WIT document (with nested packages) that defines the engine world.
    pub wit: String,
    /// Name of the engine world within `wit`.
    pub world_name: String,
    /// JavaScript module to componentize as the engine.
    pub bootstrap: String,
    /// Specifiers a script may `require`, in world order.
    pub imports: Vec<String>,
    /// JavaScript export names of the engine world, excluding the script loader.
    pub exports: Vec<String>,
}

/// Build the engine world for `inputs`.
///
/// Every input world is merged into one world which additionally exports
/// `jco:script-engine/script-loader`. Shared packages, such as `wasi:cli`, are unified when the
/// inputs agree on their contents. Conflicting items with the same name, or two exported
/// interfaces that would share a JavaScript export name, are errors: the engine has to present
/// a single namespace to its scripts.
pub fn engine_world(inputs: &[WitInput], backend: Backend) -> Result<EngineWorld> {
    if inputs.is_empty() {
        bail!("at least one WIT world is required to build a script engine");
    }

    let mut resolve = Resolve::default();
    let engine_pkg = resolve
        .push_str("script-engine.wit", SCRIPT_ENGINE_WIT)
        .context("parsing the jco:script-engine WIT")?;
    let engine = resolve
        .select_world(&[engine_pkg], Some(ENGINE_WORLD_NAME))
        .context("selecting the jco:script-engine world")?;

    let mut clone_maps = CloneMaps::default();
    for input in inputs {
        let mut input_resolve = Resolve::default();
        let (pkg, _) = input_resolve
            .push_path(&input.path)
            .with_context(|| format!("parsing WIT at [{}]", input.path.display()))?;
        let world = input_resolve
            .select_world(&[pkg], input.world.as_deref())
            .with_context(|| format!("selecting a world in [{}]", input.path.display()))?;
        let world_name = input_resolve.worlds[world].name.clone();
        let remap = resolve
            .merge(input_resolve)
            .with_context(|| format!("merging packages from [{}]", input.path.display()))?;
        let world = remap
            .map_world(world, Span::default())
            .with_context(|| format!("locating world [{world_name}] after merge"))?;
        resolve
            .merge_worlds(world, engine, &mut clone_maps)
            .with_context(|| {
                format!(
                    "merging world [{world_name}] from [{}] into the engine world",
                    input.path.display()
                )
            })?;
    }

    let bootstrap = Bootstrap::new(&resolve, engine, backend)?;
    let wit = print_wit(&resolve, engine_pkg)?;

    Ok(EngineWorld {
        wit,
        world_name: ENGINE_WORLD_NAME.into(),
        bootstrap: bootstrap.render(),
        imports: bootstrap.import_specifiers(),
        exports: bootstrap.export_names(),
    })
}

/// Print `resolve` as one WIT document with `main` first and every other package nested.
fn print_wit(resolve: &Resolve, main: PackageId) -> Result<String> {
    let nested: Vec<PackageId> = resolve
        .topological_packages()
        .into_iter()
        .filter(|id| *id != main)
        .collect();
    let mut printer = WitPrinter::default();
    printer
        .print(resolve, main, &nested)
        .context("printing the engine world WIT")?;
    Ok(printer.output.to_string())
}

/// An import of the engine world, as the bootstrap module sees it.
#[derive(Debug)]
struct Import {
    /// Specifier scripts `require` and the bootstrap imports.
    specifier: String,
    /// Whether the import is a function declared directly on the world.
    world_function: bool,
}

/// An export of the engine world, as the bootstrap module presents it.
#[derive(Debug)]
enum Export {
    /// A function declared directly on the world.
    Function { js_name: String },
    /// An interface, exported as an object.
    Interface {
        js_name: String,
        key: String,
        functions: Vec<String>,
        resources: Vec<ResourceExport>,
    },
}

impl Export {
    fn js_name(&self) -> &str {
        match self {
            Export::Function { js_name } | Export::Interface { js_name, .. } => js_name,
        }
    }
}

/// A resource exported by an interface, exported as a class.
#[derive(Debug)]
struct ResourceExport {
    js_name: String,
    has_constructor: bool,
    methods: Vec<String>,
    statics: Vec<String>,
}

/// The generated engine bootstrap module.
struct Bootstrap {
    imports: Vec<Import>,
    exports: Vec<Export>,
}

impl Bootstrap {
    fn new(resolve: &Resolve, world: WorldId, backend: Backend) -> Result<Self> {
        let world = &resolve.worlds[world];

        let mut imports = Vec::new();
        for (key, item) in world.imports.iter() {
            match item {
                WorldItem::Interface { .. } => imports.push(Import {
                    specifier: resolve.name_world_key(key),
                    world_function: false,
                }),
                WorldItem::Function(function) => {
                    if backend == Backend::QuickJs {
                        bail!(
                            "the engine world imports the function [{}] directly; the quickjs \
                             backend has no module specifier for world-level function imports, \
                             so move it into an interface or use the starlingmonkey backend",
                            function.name
                        );
                    }
                    imports.push(Import {
                        specifier: function.name.clone(),
                        world_function: true,
                    });
                }
                WorldItem::Type { .. } => {}
            }
        }

        let mut exports = Vec::new();
        let mut seen: BTreeMap<String, String> = BTreeMap::new();
        for (key, item) in world.exports.iter() {
            let key_name = resolve.name_world_key(key);
            if key_name == SCRIPT_LOADER_KEY {
                continue;
            }
            let export = match item {
                WorldItem::Interface { id, .. } => interface_export(resolve, key, *id, &key_name)?,
                WorldItem::Function(function) => Export::Function {
                    js_name: function.name.to_lower_camel_case(),
                },
                WorldItem::Type { .. } => continue,
            };
            let js_name = export.js_name().to_string();
            if js_name == SCRIPT_LOADER_EXPORT {
                bail!(
                    "the export [{key_name}] would be exported as [{js_name}], which the engine \
                     reserves for jco:script-engine/script-loader"
                );
            }
            if let Some(previous) = seen.insert(js_name.clone(), key_name.clone()) {
                bail!(
                    "the exports [{previous}] and [{key_name}] would both be exported as \
                     [{js_name}]; a script engine needs distinct JavaScript export names"
                );
            }
            exports.push(export);
        }

        Ok(Self { imports, exports })
    }

    fn import_specifiers(&self) -> Vec<String> {
        self.imports.iter().map(|i| i.specifier.clone()).collect()
    }

    fn export_names(&self) -> Vec<String> {
        self.exports
            .iter()
            .map(|e| e.js_name().to_string())
            .collect()
    }

    fn render(&self) -> String {
        let mut out = String::new();
        out.push_str(
            "// Generated by `jco componentize --script-only`. This module is the engine: its\n\
             // exports forward to whichever script `scriptLoader.load` evaluated last.\n\n",
        );

        for (idx, import) in self.imports.iter().enumerate() {
            if import.world_function {
                let _ = writeln!(
                    out,
                    "import $import{idx} from {};",
                    js_str(&import.specifier)
                );
            } else {
                let _ = writeln!(
                    out,
                    "import * as $import{idx} from {};",
                    js_str(&import.specifier)
                );
            }
        }

        out.push_str("\nconst $modules = new Map([\n");
        for (idx, import) in self.imports.iter().enumerate() {
            if import.world_function {
                let _ = writeln!(
                    out,
                    "  [{}, $namespace({{ default: $import{idx} }})],",
                    js_str(&import.specifier)
                );
            } else {
                let _ = writeln!(
                    out,
                    "  [{}, $namespace($import{idx})],",
                    js_str(&import.specifier)
                );
            }
        }
        out.push_str("]);\n\n");

        // The runtime refers to `$modules` and `$linkResources`, defined around it.
        out.push_str(RUNTIME_JS);
        out.push('\n');

        let mut links = String::new();
        for (idx, export) in self.exports.iter().enumerate() {
            match export {
                Export::Function { js_name } => {
                    let _ = writeln!(
                        out,
                        "function $export{idx}(...args) {{\n  return $lookup([{}])(...args);\n}}\n\
                         export {{ $export{idx} as {js_name} }};\n",
                        js_str(js_name)
                    );
                }
                Export::Interface {
                    js_name,
                    key,
                    functions,
                    resources,
                } => {
                    let _ = writeln!(out, "// {key}");
                    for resource in resources {
                        let class = format!("$export{idx}${}", resource.js_name);
                        let path = format!("{}, {}", js_str(js_name), js_str(&resource.js_name));
                        let _ = writeln!(out, "class {class} {{");
                        if resource.has_constructor {
                            let _ = writeln!(
                                out,
                                "  constructor(...args) {{\n    return new ($lookup([{path}]))(...args);\n  }}"
                            );
                        } else {
                            let _ = writeln!(
                                out,
                                "  constructor() {{\n    throw new TypeError({});\n  }}",
                                js_str(&format!(
                                    "{}.{} has no constructor in the engine world",
                                    js_name, resource.js_name
                                ))
                            );
                        }
                        for method in &resource.methods {
                            let _ = writeln!(
                                out,
                                "  {}(...args) {{\n    return $method([{path}], {class}, {}).call(this, ...args);\n  }}",
                                js_str(method),
                                js_str(method)
                            );
                        }
                        for stat in &resource.statics {
                            let _ = writeln!(
                                out,
                                "  static {}(...args) {{\n    return $lookup([{path}, {}])(...args);\n  }}",
                                js_str(stat),
                                js_str(stat)
                            );
                        }
                        out.push_str("}\n");
                        let _ = writeln!(links, "  $link([{path}], {class});");
                    }
                    let _ = writeln!(out, "const $export{idx} = {{");
                    for resource in resources {
                        let _ = writeln!(
                            out,
                            "  {}: $export{idx}${},",
                            js_str(&resource.js_name),
                            resource.js_name
                        );
                    }
                    for function in functions {
                        let _ = writeln!(
                            out,
                            "  {}(...args) {{\n    return $lookup([{}, {}])(...args);\n  }},",
                            js_str(function),
                            js_str(js_name),
                            js_str(function)
                        );
                    }
                    let _ = writeln!(out, "}};\nexport {{ $export{idx} as {js_name} }};\n");
                }
            }
        }

        let _ = writeln!(out, "function $linkResources() {{\n{links}}}\n");
        let _ = writeln!(out, "export {{ $scriptLoader as {SCRIPT_LOADER_EXPORT} }};");
        out
    }
}

/// Describe an exported interface for the bootstrap module.
fn interface_export(
    resolve: &Resolve,
    key: &WorldKey,
    id: InterfaceId,
    key_name: &str,
) -> Result<Export> {
    let iface: &Interface = &resolve.interfaces[id];
    let js_name = match key {
        WorldKey::Name(name) => name.to_lower_camel_case(),
        WorldKey::Interface(_) => iface
            .name
            .as_deref()
            .with_context(|| format!("exported interface [{key_name}] has no name"))?
            .to_lower_camel_case(),
    };

    let mut resources: BTreeMap<String, ResourceExport> = BTreeMap::new();
    for (name, type_id) in iface.types.iter() {
        if resolve.types[*type_id].kind == TypeDefKind::Resource {
            resources.insert(
                name.clone(),
                ResourceExport {
                    js_name: name.to_upper_camel_case(),
                    has_constructor: false,
                    methods: Vec::new(),
                    statics: Vec::new(),
                },
            );
        }
    }

    let mut functions = Vec::new();
    for function in iface.functions.values() {
        let resource = match function.kind.resource() {
            None => {
                functions.push(function.item_name().to_lower_camel_case());
                continue;
            }
            Some(resource) => resource,
        };
        let resource_name = resolve.types[resource]
            .name
            .as_deref()
            .with_context(|| format!("resource of [{}] has no name", function.name))?;
        let export = resources.get_mut(resource_name).with_context(|| {
            format!("resource [{resource_name}] is not defined in [{key_name}]")
        })?;
        match function.kind {
            FunctionKind::Constructor(_) => export.has_constructor = true,
            FunctionKind::Method(_) | FunctionKind::AsyncMethod(_) => export
                .methods
                .push(function.item_name().to_lower_camel_case()),
            FunctionKind::Static(_) | FunctionKind::AsyncStatic(_) => export
                .statics
                .push(function.item_name().to_lower_camel_case()),
            FunctionKind::Freestanding | FunctionKind::AsyncFreestanding => unreachable!(),
        }
    }

    Ok(Export::Interface {
        js_name,
        key: key_name.to_string(),
        functions,
        resources: resources.into_values().collect(),
    })
}

/// Runtime shared by every generated bootstrap module; see the file for how scripts are loaded.
const RUNTIME_JS: &str = include_str!("runtime.js");

/// Quote `s` as a JavaScript string literal.
fn js_str(s: &str) -> String {
    // Rust's debug escaping is a subset of JavaScript string literal syntax:
    // `\"`, `\\`, `\n`, `\t`, `\r` and `\u{..}` are all accepted by JavaScript.
    format!("{s:?}")
}

/// A script to package as a script-only component.
#[derive(Debug, Clone)]
pub struct ScriptComponent {
    /// Name the script is packaged under.
    pub name: String,
    /// Script source: an ES module with its imports hoisted to the top and a single trailing
    /// export list, as Rolldown emits.
    pub source: String,
    /// Fully-qualified engine world the script was bundled against.
    pub engine_world: String,
    /// JavaScript export names of the script.
    pub exports: Vec<String>,
}

/// Package a script as a component exporting `jco:script/script`.
///
/// The component is a data-only core module: every export returns a pointer into a
/// pre-laid-out return area, so it needs no allocator and no engine.
pub fn script_component(script: &ScriptComponent) -> Result<Vec<u8>> {
    let mut resolve = Resolve::default();
    let pkg = resolve
        .push_str("script.wit", SCRIPT_WIT)
        .context("parsing the jco:script WIT")?;
    let world = resolve
        .select_world(&[pkg], Some(SCRIPT_ONLY_WORLD_NAME))
        .context("selecting the jco:script world")?;

    let mut data = DataLayout::default();
    let exports: Vec<[u32; 2]> = script
        .exports
        .iter()
        .map(|export| data.string(export))
        .collect();
    let mut export_list = Vec::with_capacity(exports.len() * 8);
    for [ptr, len] in &exports {
        export_list.extend_from_slice(&ptr.to_le_bytes());
        export_list.extend_from_slice(&len.to_le_bytes());
    }
    let export_list = data.bytes(&export_list, 4);
    let functions = [
        ("name", data.string(&script.name)),
        ("source", data.string(&script.source)),
        ("engine-world", data.string(&script.engine_world)),
        ("exports", [export_list, exports.len() as u32]),
    ];
    let return_areas: Vec<(&str, u32)> = functions
        .iter()
        .map(|(name, [ptr, len])| {
            let mut area = Vec::with_capacity(8);
            area.extend_from_slice(&ptr.to_le_bytes());
            area.extend_from_slice(&len.to_le_bytes());
            (*name, data.bytes(&area, 4))
        })
        .collect();

    let mut types = TypeSection::new();
    types.ty().function([], [ValType::I32]);
    let mut funcs = FunctionSection::new();
    let mut code = CodeSection::new();
    let mut exports_section = ExportSection::new();
    exports_section.export("memory", ExportKind::Memory, 0);
    for (idx, (name, area)) in return_areas.iter().enumerate() {
        funcs.function(0);
        let mut function = Function::new([]);
        function.instruction(&Instruction::I32Const(*area as i32));
        function.instruction(&Instruction::End);
        code.function(&function);
        exports_section.export(
            &format!("jco:script/script@0.1.0#{name}"),
            ExportKind::Func,
            idx as u32,
        );
    }
    let mut memory = MemorySection::new();
    memory.memory(MemoryType {
        minimum: data.pages(),
        maximum: None,
        memory64: false,
        shared: false,
        page_size_log2: None,
    });
    let mut data_section = DataSection::new();
    data_section.active(0, &ConstExpr::i32_const(0), data.bytes.clone());

    let mut module = Module::new();
    module
        .section(&types)
        .section(&funcs)
        .section(&memory)
        .section(&exports_section)
        .section(&code)
        .section(&data_section);
    let mut bytes = module.finish();

    wit_component::embed_component_metadata(&mut bytes, &resolve, world, StringEncoding::UTF8)
        .context("embedding the jco:script world")?;
    let component = ComponentEncoder::default()
        .validate(true)
        .module(&bytes)
        .context("encoding the script-only module")?
        .encode()
        .context("encoding the script-only component")?;

    let mut producers = Producers::default();
    producers.add("language", "JavaScript", "");
    producers.add("processed-by", "jco", env!("CARGO_PKG_VERSION"));
    producers
        .add_to_wasm(&component)
        .context("adding producers metadata to the script-only component")
}

/// Bump allocator for the data segment of a script-only component.
#[derive(Default)]
struct DataLayout {
    bytes: Vec<u8>,
}

impl DataLayout {
    /// Append `bytes` aligned to `align`, returning its offset.
    fn bytes(&mut self, bytes: &[u8], align: usize) -> u32 {
        // Offset zero is left unused so every pointer, including that of empty data, is non-zero.
        if self.bytes.is_empty() {
            self.bytes.resize(align.max(8), 0);
        }
        let padding = (align - self.bytes.len() % align) % align;
        self.bytes.resize(self.bytes.len() + padding, 0);
        let offset = self.bytes.len() as u32;
        self.bytes.extend_from_slice(bytes);
        offset
    }

    /// Append a string, returning its `[ptr, len]` pair.
    fn string(&mut self, s: &str) -> [u32; 2] {
        [self.bytes(s.as_bytes(), 1), s.len() as u32]
    }

    /// Number of 64KiB pages needed to hold the data.
    fn pages(&self) -> u64 {
        (self.bytes.len() as u64).div_ceil(65536).max(1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use wit_component::DecodedWasm;

    fn write_wit(dir: &std::path::Path, name: &str, contents: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, contents).unwrap();
        path
    }

    const WORLD_A: &str = r#"
package local:a;

interface greeter {
  resource counter {
    constructor(start: u32);
    next: static func() -> counter;
    get: func() -> u32;
  }
  greet: func(name: string) -> string;
}

world a {
  import log-it: func(message: string);
  import wasi:cli/environment@0.2.3;
  export greeter;
  export run: func();
}

package wasi:cli@0.2.3 {
  interface environment {
    get-environment: func() -> list<tuple<string, string>>;
  }
}
"#;

    const WORLD_B: &str = r#"
package local:b;

interface calc {
  add: func(a: u32, b: u32) -> u32;
}

world b {
  import wasi:cli/environment@0.2.3;
  export calc;
  export run: func();
}

package wasi:cli@0.2.3 {
  interface environment {
    get-environment: func() -> list<tuple<string, string>>;
  }
}
"#;

    #[test]
    fn merges_worlds_and_generates_bootstrap() {
        let dir = tempdir();
        let a = write_wit(&dir, "a.wit", WORLD_A);
        let b = write_wit(&dir, "b.wit", WORLD_B);
        let engine = engine_world(
            &[
                WitInput {
                    path: a,
                    world: None,
                },
                WitInput {
                    path: b,
                    world: Some("b".into()),
                },
            ],
            Backend::StarlingMonkey,
        )
        .unwrap();

        // The merged world is parseable and holds the union of imports and exports.
        let mut resolve = Resolve::default();
        let pkg = resolve.push_str("engine.wit", &engine.wit).unwrap();
        let world = resolve.select_world(&[pkg], Some("engine")).unwrap();
        let world = &resolve.worlds[world];
        let mut exports: Vec<String> = world
            .exports
            .keys()
            .map(|key| resolve.name_world_key(key))
            .collect();
        exports.sort();
        assert_eq!(
            exports,
            [
                "jco:script-engine/script-loader@0.1.0",
                "local:a/greeter",
                "local:b/calc",
                "run",
            ]
        );
        let mut imports: Vec<String> = world
            .imports
            .keys()
            .map(|key| resolve.name_world_key(key))
            .collect();
        imports.sort();
        assert_eq!(imports, ["log-it", "wasi:cli/environment@0.2.3"]);

        let mut engine_imports = engine.imports.clone();
        engine_imports.sort();
        assert_eq!(engine_imports, ["log-it", "wasi:cli/environment@0.2.3"]);
        let mut engine_exports = engine.exports.clone();
        engine_exports.sort();
        assert_eq!(engine_exports, ["calc", "greeter", "run"]);

        let bootstrap = &engine.bootstrap;
        assert!(bootstrap.contains(" from \"log-it\";"));
        assert!(bootstrap.contains(" from \"wasi:cli/environment@0.2.3\";"));
        assert!(bootstrap.contains("$namespace({ default: $import"));
        assert!(bootstrap.contains("function $rewrite(source)"));
        assert!(bootstrap.contains(" as greeter };"));
        assert!(bootstrap.contains(" as run };"));
        assert!(bootstrap.contains(" as calc };"));
        assert!(bootstrap.contains("export { $scriptLoader as scriptLoader };"));
        assert!(bootstrap.contains("$Counter {"));
        assert!(bootstrap.contains("static \"next\"(...args)"));
        assert!(bootstrap.contains("$method([\"greeter\", \"Counter\"], $export"));
        assert!(bootstrap.contains("$link([\"greeter\", \"Counter\"], $export"));
    }

    #[test]
    fn rejects_quickjs_world_function_imports() {
        let dir = tempdir();
        let a = write_wit(&dir, "a.wit", WORLD_A);
        let err = engine_world(
            &[WitInput {
                path: a,
                world: None,
            }],
            Backend::QuickJs,
        )
        .unwrap_err();
        assert!(err.to_string().contains("log-it"), "{err}");
    }

    #[test]
    fn rejects_conflicting_exports() {
        let dir = tempdir();
        let a = write_wit(&dir, "a.wit", WORLD_A);
        let conflicting = write_wit(
            &dir,
            "c.wit",
            "package local:c;\ninterface greeter { shout: func(); }\nworld c { export greeter; }\n",
        );
        let err = engine_world(
            &[
                WitInput {
                    path: a,
                    world: None,
                },
                WitInput {
                    path: conflicting,
                    world: None,
                },
            ],
            Backend::StarlingMonkey,
        )
        .unwrap_err();
        assert!(err.to_string().contains("greeter"), "{err}");
    }

    #[test]
    fn rejects_reserved_export_name() {
        let dir = tempdir();
        let reserved = write_wit(
            &dir,
            "r.wit",
            "package local:r;\ninterface script-loader { reload: func(); }\nworld r { export script-loader; }\n",
        );
        let err = engine_world(
            &[WitInput {
                path: reserved,
                world: None,
            }],
            Backend::StarlingMonkey,
        )
        .unwrap_err();
        assert!(err.to_string().contains("scriptLoader"), "{err}");
    }

    #[test]
    fn packages_a_script_component() {
        let component = script_component(&ScriptComponent {
            name: "hello.js".into(),
            source: "export const run = () => \"héllo\";\n".repeat(5000),
            engine_world: ENGINE_WORLD_ID.into(),
            exports: vec!["run".into(), "calc".into()],
        })
        .unwrap();

        let decoded = wit_component::decode(&component).unwrap();
        let DecodedWasm::Component(resolve, world) = decoded else {
            panic!("expected a component");
        };
        let exports: Vec<String> = resolve.worlds[world]
            .exports
            .keys()
            .map(|key| resolve.name_world_key(key))
            .collect();
        assert_eq!(exports, ["jco:script/script@0.1.0"]);
    }

    fn tempdir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "jco-script-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }
}
