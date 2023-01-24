use std::sync::Once;
use wasmparser;
use wit_component::{ComponentEncoder, DecodedWasm, DocumentPrinter};

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
    fn print(component: Vec<u8>) -> Result<String, String> {
        init();

        wasmprinter::print_bytes(component).map_err(|e| format!("{:?}", e))
    }

    fn parse(wat: String) -> Result<Vec<u8>, String> {
        init();

        wat::parse_str(wat).map_err(|e| format!("{:?}", e))
    }

    fn component_new(
        binary: Vec<u8>,
        adapters: Option<Vec<(String, Vec<u8>)>>
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


        let output = DocumentPrinter::default().print(decoded.resolve(), doc)
            .map_err(|e| format!("Unable to print wit\n${:?}", e))?;
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
