use anyhow::Result;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

use js_component_bindgen::{generate_types, source::wit_parser::Resolve, BindingsMode};

pub(crate) fn run() -> Result<()> {
    for world in ["wasi:http/proxy", "wasi:cli/command"] {
        let name = world.replace([':', '/'], "-");
        let preview2_wit_path = "./test/fixtures/wit";

        let mut resolve = Resolve::default();
        let (_, _) = resolve.push_dir(&PathBuf::from(preview2_wit_path))?;

        let world_parts: Vec<&str> = world.split('/').collect();
        let world_name = world_parts[1];

        let preview2 = *resolve
            .package_names
            .iter()
            .find(|(name, _)| format!("{}:{}/{world_name}", name.namespace, name.name) == world)
            .unwrap()
            .1;

        let world = resolve.select_world(preview2, Some(world_name))?;

        let opts = js_component_bindgen::TranspileOpts {
            name: "component".to_string(),
            no_typescript: false,
            no_nodejs_compat: false,
            instantiation: None,
            map: None,
            tla_compat: false,
            valid_lifting_optimization: false,
            base64_cutoff: 0,
            tracing: false,
            no_namespaced_exports: true,
            multi_memory: false,
            import_bindings: Some(BindingsMode::Js),
            guest: false,
            async_mode: None,
        };

        let files = generate_types(name, resolve, world, opts)?;

        if fs::metadata("./packages/preview2-shim/types").is_err() {
            fs::remove_dir_all("./packages/preview2-shim/types")?;
        }
        for (filename, contents) in files.iter() {
            let outfile = PathBuf::from("./packages/preview2-shim/types").join(filename);
            fs::create_dir_all(outfile.parent().unwrap()).unwrap();
            let mut file = fs::File::create(outfile).unwrap();
            file.write_all(contents).unwrap();
        }
    }
    Ok(())
}
