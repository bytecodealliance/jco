use std::{collections::HashMap, fs, io::Write, path::PathBuf};

use js_component_bindgen;
use wit_component::ComponentEncoder;

use anyhow::Result;

fn main() -> Result<()> {
    fn transpile(component_path: &str, name: String) -> Result<()> {
        let component = fs::read(&component_path).expect("wasm bindgen component missing");

        let adapter_path = "lib/wasi_snapshot_preview1.reactor.wasm";
        let adapter = fs::read(&adapter_path).expect("preview1 adapter file missing");

        let mut encoder = ComponentEncoder::default()
            .validate(true)
            .module(&component)?;

        encoder = encoder.adapter("wasi_snapshot_preview1", &adapter)?;

        let adapted_component = encoder.encode()?;

        let import_map = HashMap::from([
            (
                "wasi:cli-base/*".into(),
                "@bytecodealliance/preview2-shim/cli-base#*".into(),
            ),
            (
                "wasi:filesystem/*".into(),
                "@bytecodealliance/preview2-shim/filesystem#*".into(),
            ),
            (
                "wasi:io/*".into(),
                "@bytecodealliance/preview2-shim/io#*".into(),
            ),
            (
                "wasi:random/*".into(),
                "@bytecodealliance/preview2-shim/random#*".into(),
            ),
        ]);
        let opts = js_component_bindgen::TranspileOpts {
            name,
            no_typescript: false,
            instantiation: false,
            map: Some(import_map),
            no_nodejs_compat: false,
            base64_cutoff: 5000_usize,
            tla_compat: true,
            valid_lifting_optimization: false,
        };

        let transpiled = js_component_bindgen::transpile(adapted_component, opts)?;

        for (filename, contents) in transpiled.files.iter() {
            let outfile = PathBuf::from("./obj").join(filename);
            fs::create_dir_all(outfile.parent().unwrap()).unwrap();
            let mut file = fs::File::create(outfile).unwrap();
            file.write_all(contents).unwrap();
        }

        Ok(())
    }

    transpile(
        "target/wasm32-wasi/release/js_component_bindgen_component.wasm",
        "js-component-bindgen-component".to_string(),
    )?;
    transpile(
        "target/wasm32-wasi/release/wasm_tools_js.wasm",
        "wasm-tools".to_string(),
    )?;

    Ok(())
}
