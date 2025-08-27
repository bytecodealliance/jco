use anyhow::{anyhow, Result};
use std::fs;
use std::path::PathBuf;

use js_component_bindgen::{generate_types, source::wit_parser::Resolve, BindingsMode};

use crate::WasiVersion;

struct WasiTypes<'a> {
    wit_path: &'a str,
    target_path: &'a str,
    worlds: &'a [&'a str],
}

pub(crate) fn run(version: WasiVersion) -> Result<()> {
    let types = match version {
        WasiVersion::Preview2 => WasiTypes {
            wit_path: "./packages/jco/test/fixtures/p2/wit/",
            target_path: "./packages/preview2-shim/types/",
            worlds: &["wasi:http/proxy", "wasi:cli/command"],
        },
        WasiVersion::Preview3 => WasiTypes {
            wit_path: "./packages/jco/test/fixtures/p3/wit/",
            target_path: "./packages/preview3-shim/types/",
            worlds: &["wasi:http/proxy", "wasi:cli/command"],
        },
    };

    process_wasi_types(types)
}

fn process_wasi_types(wasi: WasiTypes<'_>) -> Result<()> {
    for world in wasi.worlds {
        let name = world.replace([':', '/'], "-");

        let mut resolve = Resolve::default();
        let (_, _) = resolve.push_dir(PathBuf::from(wasi.wit_path))?;

        let (_, world_name) = world
            .split_once('/')
            .ok_or_else(|| anyhow!("invalid world: {}", world))?;

        let (_, package) = resolve
            .package_names
            .iter()
            .find(|(name, _)| format!("{}:{}/{world_name}", name.namespace, name.name) == *world)
            .ok_or_else(|| anyhow!("package not found for {}", world))?;

        let world = resolve.select_world(&[*package], Some(world_name))?;

        let opts = js_component_bindgen::TranspileOpts {
            name: "component".to_string(),
            import_bindings: Some(BindingsMode::Js),
            no_namespaced_exports: true,
            ..Default::default()
        };

        let files = generate_types(&name, resolve, world, opts)?;

        if fs::metadata(wasi.target_path).is_err() {
            fs::remove_dir_all(wasi.target_path)?;
        }

        for (filename, contents) in files.iter() {
            let outfile = PathBuf::from(wasi.target_path).join(filename);
            let parent = outfile.parent().expect("invalid target path");

            fs::create_dir_all(parent)?;
            fs::write(&outfile, contents)?;
        }
    }

    Ok(())
}
