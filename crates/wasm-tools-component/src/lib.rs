use std::{path::PathBuf, sync::Once};
use wasm_encoder::{Encode, Section};
use wasmparser;
use wit_component::{ComponentEncoder, DecodedWasm, DocumentPrinter, StringEncoding};
use wit_parser::{Resolve, UnresolvedPackage};

wit_bindgen_guest_rust::generate!("wasm-tools");

struct WasmToolsJs;

export_wasm_tools_js!(WasmToolsJs);

fn init() {
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        let prev_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            console::error(&info.to_string());
            prev_hook(info);
        }));
    });
}

impl exports::Exports for WasmToolsJs {
    fn parse(wat: String) -> Result<Vec<u8>, String> {
        init();

        wat::parse_str(wat).map_err(|e| format!("{:?}", e))
    }

    fn print(component: Vec<u8>) -> Result<String, String> {
        init();

        wasmprinter::print_bytes(component).map_err(|e| format!("{:?}", e))
    }

    fn component_new(
        binary: Vec<u8>,
        adapters: Option<Vec<(String, Vec<u8>)>>,
    ) -> Result<Vec<u8>, String> {
        init();

        let mut encoder = ComponentEncoder::default()
            .validate(true)
            .module(&binary)
            .map_err(|e| format!("Failed to decode Wasm\n{:?}", e))?;

        if let Some(adapters) = adapters {
            for (name, binary) in adapters {
                encoder = encoder
                    .adapter(&name, &binary)
                    .map_err(|e| format!("{:?}", e))?;
            }
        }

        let bytes = encoder
            .encode()
            .map_err(|e| format!("failed to encode a component from module\n${:?}", e))?;

        Ok(bytes)
    }

    fn component_wit(binary: Vec<u8>, name: Option<String>) -> Result<String, String> {
        init();

        let decoded = wit_component::decode(&name.unwrap_or(String::from("component")), &binary)
            .map_err(|e| format!("Failed to decode wit component\n{:?}", e))?;

        // let world = decode_world("component", &binary);

        let doc = match &decoded {
            DecodedWasm::WitPackage(_resolve, _pkg) => panic!("Unexpected wit package"),
            DecodedWasm::Component(resolve, world) => resolve.worlds[*world].document,
        };

        let output = DocumentPrinter::default()
            .print(decoded.resolve(), doc)
            .map_err(|e| format!("Unable to print wit\n${:?}", e))?;
        Ok(output)
    }

    fn component_embed(
        binary: Option<Vec<u8>>,
        wit: String,
        opts: Option<exports::EmbedOpts>,
    ) -> Result<Vec<u8>, String> {
        let mut resolve = Resolve::default();

        let path = PathBuf::from("component.wit");

        let pkg = UnresolvedPackage::parse(&path, &wit).map_err(|e| e.to_string())?;

        let id = resolve
            .push(pkg, &Default::default())
            .map_err(|e| e.to_string())?;

        let world = if let Some(exports::EmbedOpts {
            world: Some(ref world),
            ..
        }) = opts
        {
            let mut parts = world.split('/');
            let doc = match parts.next() {
                Some(name) => match resolve.packages[id].documents.get(name) {
                    Some(doc) => *doc,
                    None => return Err("no document named `{name}` in package".to_string()),
                },
                None => return Err("invalid `world` argument".to_string()),
            };
            match parts.next() {
                Some(name) => match resolve.documents[doc].worlds.get(name) {
                    Some(world) => *world,
                    None => return Err(format!("no world named `{name}` in document")),
                },
                None => match resolve.documents[doc].default_world {
                    Some(world) => world,
                    None => return Err("no default world found in document".to_string()),
                },
            }
        } else {
            let docs = &resolve.packages[id];
            let (_, doc) = docs.documents.first().unwrap();
            match resolve.documents[*doc].default_world {
                Some(world) => world,
                None => return Err("no default world found in document".into()),
            }
        };

        let string_encoding = match opts {
            Some(ref opts) => match &opts.string_encoding {
                None | Some(exports::StringEncoding::Utf8) => StringEncoding::UTF8,
                Some(exports::StringEncoding::Utf16) => StringEncoding::UTF16,
                Some(exports::StringEncoding::CompactUtf16) => StringEncoding::CompactUTF16,
            },
            None => StringEncoding::UTF8,
        };

        let mut core_binary = if matches!(
            opts,
            Some(exports::EmbedOpts {
                dummy: Some(true),
                ..
            })
        ) {
            wit_component::dummy_module(&resolve, world)
        } else {
            if binary.is_none() {
                return Err(
                    "no core binary provided. Use the `dummy` option to generate an empty binary."
                        .to_string(),
                );
            }
            binary.unwrap()
        };

        let encoded = wit_component::metadata::encode(&resolve, world, string_encoding)
            .map_err(|e| e.to_string())?;

        let section = wasm_encoder::CustomSection {
            name: "component-type",
            data: &encoded,
        };

        core_binary.push(section.id());
        section.encode(&mut core_binary);

        Ok(core_binary)
    }

    fn extract_core_modules(binary: Vec<u8>) -> Result<Vec<(u32, u32)>, String> {
        let mut core_modules = Vec::<(u32, u32)>::new();

        let mut bytes = &binary[0..];
        let mut parser = wasmparser::Parser::new(0);
        let mut parsers = Vec::new();
        let mut last_consumed = 0;
        loop {
            bytes = &bytes[last_consumed..];
            let payload = match parser.parse(bytes, true).map_err(|e| format!("{:?}", e))? {
                wasmparser::Chunk::NeedMoreData(_) => unreachable!(),
                wasmparser::Chunk::Parsed { payload, consumed } => {
                    last_consumed = consumed;
                    payload
                }
            };
            match payload {
                wasmparser::Payload::Version { encoding, .. } => {
                    if !matches!(encoding, wasmparser::Encoding::Component) {
                        return Err("Not a WebAssembly Component".into());
                    }
                }
                wasmparser::Payload::ModuleSection { range, .. } => {
                    bytes = &bytes[range.end - range.start..];
                    core_modules.push((range.start as u32, range.end as u32));
                }
                wasmparser::Payload::ComponentSection { parser: inner, .. } => {
                    parsers.push(parser);
                    parser = inner;
                }
                wasmparser::Payload::ComponentStartSection { .. } => {}
                wasmparser::Payload::End(_) => {
                    if let Some(parent_parser) = parsers.pop() {
                        parser = parent_parser;
                    } else {
                        break;
                    }
                }
                // Component unsupported core module sections ignored
                // CustomSection { name, .. } => {},
                wasmparser::Payload::CustomSection { .. } => {
                    panic!("Unsupported section");
                }
                _ => {}
            }
        }

        Ok(core_modules)
    }
}
