use std::{collections::HashMap, env, fs, io::Write, path::PathBuf};

fn main() {
    if env::var("PREVIEW2_SHIM_TYPES").is_ok() {
        let current_dir = std::env::current_dir().unwrap();
        let lib_dir = current_dir.join("./lib");
        for world in ["reactor", "proxy"] {
            let component_path = lib_dir.join(format!("dummy_{}.component.wasm", world));
            let component = fs::read(&component_path).expect("component to be read from file");

            let import_map = HashMap::from([]);
            let opts = js_component_bindgen::GenerationOpts {
                name: format!("wasi-{}", world),
                no_typescript: false,
                instantiation: true,
                map: Some(import_map),
                compat: false,
                no_nodejs_compat: true,
                base64_cutoff: 5000_usize,
                tla_compat: false,
                valid_lifting_optimization: false,
                raw_bindgen: false,
            };

            let transpiled = js_component_bindgen::transpile(component, opts)
                .map_err(|e| format!("{:?}", e))
                .unwrap();

            for (filename, contents) in transpiled.files.iter() {
                if filename.ends_with(".d.ts") {
                    let outfile = PathBuf::from("./packages/preview2-shim/types").join(filename);
                    fs::create_dir_all(outfile.parent().unwrap()).unwrap();
                    let mut file = fs::File::create(outfile).unwrap();
                    file.write_all(contents).unwrap();
                }
            }
            println!("cargo:rerun-if-changed={:?}", component_path);
        }
    }
    println!("cargo:rerun-if-changed=build.rs");
}
