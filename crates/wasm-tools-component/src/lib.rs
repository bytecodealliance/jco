use std::{sync::Once, path::Path};
use wit_component::{ComponentEncoder, StringEncoding, decode_world, WorldPrinter};
use wit_parser::Document;
use wasmparser;

wit_bindgen_guest_rust::generate!("wasm-tools.wit");

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

impl wasm_tools_js::WasmToolsJs for WasmToolsJs {
    fn print(
        component: Vec<u8>,
    ) -> Result<String, String> {
        init();

        wasmprinter::print_bytes(component).map_err(|e| format!("{:?}", e))
    }

    fn parse(wat: String) -> Result<Vec<u8>, String> {
        init();
        
        wat::parse_str(wat).map_err(|e| format!("{:?}", e))
    }

    fn component_new(binary: Vec<u8>, opts: Option<wasm_tools_js::ComponentOpts>) -> Result<Vec<u8>, String> {
        init();

        let mut encoder = ComponentEncoder::default();

        if let Some(opts) = opts {
            if let Some(adapters) = opts.adapters {
                for (name, binary) in adapters {
                    encoder = encoder.adapter(&name, &binary).map_err(|e| format!("{:?}", e))?;
                }
            }
            if let Some(types_only) = opts.types_only {
                if opts.wit.is_none() {
                    return Err("Must provide a WIT for types-only component generation.".into());
                }
                encoder = encoder.types_only(types_only);
            }
            if let Some(wit) = opts.wit {
                let encoding = match opts.string_encoding {
                    Some(wasm_tools_js::StringEncoding::Utf8) | None => StringEncoding::UTF8,
                    Some(wasm_tools_js::StringEncoding::Utf16) => StringEncoding::UTF16,
                    Some(wasm_tools_js::StringEncoding::CompactUtf16) => StringEncoding::CompactUTF16, 
                };
                let doc = Document::parse(Path::new("<input>"), &wit).map_err(|e| format!("{:?}", e))?;
                encoder = encoder.world(doc.into_world().map_err(|e| format!("{:?}", e))?, encoding).map_err(|e| format!("{:?}", e))?;
            }
        }

        encoder = encoder.module(&binary).map_err(|e| format!("{:?}", e))?;

        let bytes = encoder.encode().map_err(|e| format!("{:?}", e))?;

        Ok(bytes)
    }

    fn component_wit(binary: Vec<u8>) -> Result<String, String> {
        init();

        let world = decode_world("component", &binary).map_err(|e| format!("Failed to decode world\n{:?}", e))?;
        let mut printer = WorldPrinter::default();
        let output = printer.print(&world).map_err(|e| format!("Failed to print world\n{:?}", e))?;
        Ok(output)
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
                },
                wasmparser::Payload::ModuleSection { range, .. } => {
                    bytes = &bytes[range.end - range.start..];
                    core_modules.push((range.start as u32, range.end as u32));
                },
                wasmparser::Payload::ComponentSection { parser: inner, .. } => {
                    parsers.push(parser);
                    parser = inner;
                },
                wasmparser::Payload::ComponentStartSection { .. } => {},
                wasmparser::Payload::End(_) => {
                    if let Some(parent_parser) = parsers.pop() {
                        parser = parent_parser;
                    } else {
                        break;
                    }
                },
                // Component unsupported core module sections ignored
                // CustomSection { name, .. } => {},
                wasmparser::Payload::CustomSection { .. } => {
                    panic!("Unsupported section");
                },
                _ => {},
            }
        }

        Ok(core_modules)
    }
}
