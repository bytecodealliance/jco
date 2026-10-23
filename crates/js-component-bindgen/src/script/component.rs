//! Packaging script source as a data-only WebAssembly component.

use anyhow::{Context, Result};
use wasm_encoder::{
    CodeSection, ConstExpr, DataSection, ExportKind, ExportSection, Function, FunctionSection,
    Instruction, MemorySection, MemoryType, Module, TypeSection, ValType,
};
use wasm_metadata::Producers;
use wit_component::{ComponentEncoder, StringEncoding};
use wit_parser::Resolve;

use super::{SCRIPT_ONLY_WORLD_NAME, SCRIPT_WIT};

/// A script to package as a script-only component.
/// Construct scripts with [`ScriptComponent::builder`].
#[derive(Debug, Clone, bon::Builder)]
#[non_exhaustive]
pub struct ScriptComponent {
    /// Name the script is packaged under.
    #[builder(into)]
    pub name: String,
    /// Script source: an ES module with its imports hoisted to the top and a single trailing
    /// export list, as Rolldown emits.
    #[builder(into)]
    pub source: String,
    /// Fully-qualified engine world the script was bundled against.
    #[builder(into)]
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
    use crate::script::ENGINE_WORLD_ID;
    use wit_component::DecodedWasm;

    #[test]
    fn packages_a_script_component() {
        let component = script_component(
            &ScriptComponent::builder()
                .name("hello.js")
                .source("export const run = () => \"héllo\";\n".repeat(5000))
                .engine_world(ENGINE_WORLD_ID)
                .exports(vec!["run".into(), "calc".into()])
                .build(),
        )
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
}
