use anyhow::{Context, Result};
use js_component_bindgen::BindingsMode;
use std::{collections::HashMap, fs, io::Write, path::PathBuf};
use wit_component::ComponentEncoder;
use xshell::{cmd, Shell};

pub(crate) fn run(release: bool) -> Result<()> {
    let build = if release { "release" } else { "debug" };
    transpile(
        &format!("target/wasm32-wasip1/{build}/js_component_bindgen_component.wasm"),
        "js-component-bindgen-component".to_string(),
        release,
    )?;
    transpile(
        &format!("target/wasm32-wasip1/{build}/wasm_tools_js.wasm"),
        "wasm-tools".to_string(),
        release,
    )?;

    Ok(())
}

fn transpile(component_path: &str, name: String, optimize: bool) -> Result<()> {
    std::env::set_var("RUST_BACKTRACE", "1");
    let component = fs::read(component_path).context("wasm bindgen component missing")?;

    let adapter_path = "lib/wasi_snapshot_preview1.reactor.wasm";
    let adapter = fs::read(adapter_path).context("preview1 adapter file missing")?;

    let mut encoder = ComponentEncoder::default()
        .validate(true)
        .module(&component)?;

    encoder = encoder.adapter("wasi_snapshot_preview1", &adapter)?;

    let mut adapted_component = encoder.encode()?;
    fs::create_dir_all(PathBuf::from("./obj"))?;
    let mut component_path = PathBuf::from("./obj").join(&name);
    component_path.set_extension("component.wasm");
    fs::write(&component_path, &adapted_component)?;

    let sh = Shell::new()?;
    if optimize {
        cmd!(
            sh,
            "node ./src/jco.js opt {component_path} -o {component_path}"
        )
        .read()?;
        adapted_component = fs::read(component_path)?;
    }

    let import_map = HashMap::from([
        (
            "wasi:cli/*".into(),
            "@bytecodealliance/preview2-shim/cli#*".into(),
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
        (
            "wasi:sockets/*".into(),
            "@bytecodealliance/preview2-shim/sockets#*".into(),
        ),
    ]);
    let opts = js_component_bindgen::TranspileOpts {
        name,
        no_typescript: false,
        instantiation: None,
        map: Some(import_map),
        no_nodejs_compat: false,
        base64_cutoff: 5000_usize,
        tla_compat: true,
        valid_lifting_optimization: false,
        tracing: false,
        no_namespaced_exports: true,
        multi_memory: true,
        import_bindings: Some(BindingsMode::Js),
        guest: false,
        async_mode: None,
    };

    let transpiled = js_component_bindgen::transpile(&adapted_component, opts)?;

    for (filename, contents) in transpiled.files.iter() {
        let outfile = PathBuf::from("./obj").join(filename);
        fs::create_dir_all(outfile.parent().unwrap()).unwrap();
        let mut file = fs::File::create(outfile).unwrap();
        file.write_all(contents).unwrap();
    }

    Ok(())
}
