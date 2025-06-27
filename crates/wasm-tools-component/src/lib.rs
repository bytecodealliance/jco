use std::collections::VecDeque;
use std::fs::metadata;
use std::path::PathBuf;

use wasm_encoder::{Encode, Section};
use wasm_metadata::Producers;
use wit_component::{ComponentEncoder, DecodedWasm, WitPrinter};
use wit_parser::Resolve;

mod bindings {
    use super::WasmToolsJs;
    wit_bindgen::generate!({
        world: "wasm-tools"
    });
    export!(WasmToolsJs);
}

use bindings::exports::local::wasm_tools::tools::{
    EmbedOpts, EnabledFeatureSet, Guest, ModuleMetaType, ModuleMetadata, ProducersFields,
    StringEncoding,
};

struct WasmToolsJs;

impl Guest for WasmToolsJs {
    fn parse(wat: String) -> Result<Vec<u8>, String> {
        wat::parse_str(wat).map_err(|e| format!("{e:?}"))
    }

    fn print(component: Vec<u8>) -> Result<String, String> {
        wasmprinter::print_bytes(component).map_err(|e| format!("{e:?}"))
    }

    fn component_new(
        binary: Vec<u8>,
        adapters: Option<Vec<(String, Vec<u8>)>>,
    ) -> Result<Vec<u8>, String> {
        let mut encoder = ComponentEncoder::default()
            .validate(true)
            .module(&binary)
            .map_err(|e| format!("Failed to decode Wasm\n{e:?}"))?;

        if let Some(adapters) = adapters {
            for (name, binary) in adapters {
                encoder = encoder
                    .adapter(&name, &binary)
                    .map_err(|e| format!("{e:?}"))?;
            }
        }

        let bytes = encoder
            .encode()
            .map_err(|e| format!("failed to encode a component from module\n${e:?}"))?;

        Ok(bytes)
    }

    fn component_wit(binary: Vec<u8>) -> Result<String, String> {
        let decoded = wit_component::decode(&binary)
            .map_err(|e| format!("Failed to decode wit component\n{e:?}"))?;

        // let world = decode_world("component", &binary);

        let doc = match &decoded {
            DecodedWasm::WitPackage(_, _) => panic!("Unexpected wit package"),
            DecodedWasm::Component(resolve, world) => resolve.worlds[*world].package.unwrap(),
        };

        let mut printer = WitPrinter::default();
        printer
            .print(decoded.resolve(), doc, &[])
            .map_err(|e| format!("Unable to print wit\n${e:?}"))?;

        Ok(printer.output.to_string())
    }

    fn component_embed(embed_opts: EmbedOpts) -> Result<Vec<u8>, String> {
        let binary = &embed_opts.binary;

        let mut resolve = Resolve::default();

        // Add all features specified in embed options to the resolve
        // (this helps identify/use feature gating properly)
        match embed_opts.features {
            Some(EnabledFeatureSet::List(ref features)) => {
                for f in features.iter() {
                    resolve.features.insert(f.to_string());
                }
            }
            Some(EnabledFeatureSet::All) => {
                resolve.all_features = true;
            }
            _ => {}
        };

        let ids = if let Some(wit_source) = &embed_opts.wit_source {
            let path = PathBuf::from("component.wit");
            resolve
                .push_str(&path, wit_source)
                .map_err(|e| e.to_string())?
        } else {
            let wit_path = &PathBuf::from(embed_opts.wit_path.as_ref().unwrap());
            if metadata(wit_path).unwrap().is_file() {
                resolve.push_file(wit_path).map_err(|e| e.to_string())?
            } else {
                resolve.push_dir(wit_path).map_err(|e| e.to_string())?.0
            }
        };

        let world_string = embed_opts.world.as_ref().map(|world| world.to_string());

        let world = resolve
            .select_world(ids, world_string.as_deref())
            .map_err(|e| e.to_string())?;

        let string_encoding = match &embed_opts.string_encoding {
            None | Some(StringEncoding::Utf8) => wit_component::StringEncoding::UTF8,
            Some(StringEncoding::Utf16) => wit_component::StringEncoding::UTF16,
            Some(StringEncoding::CompactUtf16) => wit_component::StringEncoding::CompactUTF16,
        };

        let mut core_binary = if matches!(
            &embed_opts,
            EmbedOpts {
                dummy: Some(true),
                ..
            }
        ) {
            wit_component::dummy_module(&resolve, world, wit_parser::ManglingAndAbi::Standard32)
        } else {
            if binary.is_none() {
                return Err(
                    "no core binary provided. Use the `dummy` option to generate an empty binary."
                        .to_string(),
                );
            }
            binary.as_ref().unwrap().clone()
        };

        let producers = match &embed_opts.metadata {
            Some(metadata_fields) => {
                let mut producers = Producers::default();
                for (field_name, items) in metadata_fields {
                    if field_name != "sdk"
                        && field_name != "language"
                        && field_name != "processed-by"
                    {
                        return Err(format!("'{field_name}' is not a valid field to embed in the metadata. Must be one of 'language', 'processed-by' or 'sdk'."));
                    }
                    for (name, version) in items {
                        producers.add(field_name, name, version);
                    }
                }
                Some(producers)
            }
            None => None,
        };

        let encoded =
            wit_component::metadata::encode(&resolve, world, string_encoding, producers.as_ref())
                .map_err(|e| e.to_string())?;

        let section = wasm_encoder::CustomSection {
            name: "component-type".into(),
            data: encoded.into(),
        };

        core_binary.push(section.id());
        section.encode(&mut core_binary);

        Ok(core_binary)
    }

    fn metadata_add(binary: Vec<u8>, metadata: ProducersFields) -> Result<Vec<u8>, String> {
        let mut producers = Producers::default();

        for (field_name, items) in metadata {
            if field_name != "sdk" && field_name != "language" && field_name != "processed-by" {
                return Err(format!("'{field_name}' is not a valid field to embed in the metadata. Must be one of 'language', 'processed-by' or 'sdk'."));
            }
            for (name, version) in items {
                producers.add(&field_name, &name, &version);
            }
        }
        producers
            .add_to_wasm(&binary[0..])
            .map_err(|e| e.to_string())
    }

    fn metadata_show(binary: Vec<u8>) -> Result<Vec<ModuleMetadata>, String> {
        let payload = wasm_metadata::Payload::from_binary(&binary).map_err(|e| format!("{e:?}"))?;
        let mut module_metadata: Vec<ModuleMetadata> = Vec::new();
        let mut to_flatten: VecDeque<(Option<u32>, wasm_metadata::Payload)> = VecDeque::new();
        to_flatten.push_back((None, payload));
        while let Some((parent_index, payload)) = to_flatten.pop_front() {
            let (name, producers, meta_type, range) = match payload {
                wasm_metadata::Payload::Component {
                    metadata:
                        wasm_metadata::Metadata {
                            name,
                            producers,
                            range,
                            ..
                        },
                    children,
                } => {
                    let children_len = children.len();
                    for child in children {
                        to_flatten.push_back((Some(module_metadata.len() as u32), child));
                    }
                    (
                        name,
                        producers,
                        ModuleMetaType::Component(children_len as u32),
                        range,
                    )
                }
                wasm_metadata::Payload::Module(wasm_metadata::Metadata {
                    name,
                    producers,
                    range,
                    ..
                }) => (name, producers, ModuleMetaType::Module, range),
            };

            let mut metadata: Vec<(String, Vec<(String, String)>)> = Vec::new();
            if let Some(producers) = producers {
                for (key, fields) in producers.iter() {
                    metadata.push((
                        key.to_string(),
                        fields
                            .iter()
                            .map(|(value, version)| (value.to_string(), version.to_string()))
                            .collect(),
                    ));
                }
            }
            module_metadata.push(ModuleMetadata {
                parent_index,
                name,
                meta_type,
                producers: metadata,
                range: (range.start as u32, range.end as u32),
            });
        }
        Ok(module_metadata)
    }
}
