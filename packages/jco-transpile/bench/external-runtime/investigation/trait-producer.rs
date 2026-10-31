use js_component_bindgen::{AsyncMode, InstantiationMode, TranspileConfig, TranspileOpts};
fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    assert!(
        (4..=5).contains(&args.len()),
        "fixture, output directory, component name, optional runtime specifier"
    );
    let bytes = wat::parse_file(&args[1]).expect("parse component fixture");
    let opts = TranspileOpts::builder()
        .name(args[3].clone())
        .instantiation_mode(InstantiationMode::Sync)
        .base64_cutoff(0)
        .no_typescript(false)
        .no_component_error_wrapping(true)
        .emit_conditional_suspending_wasm(true)
        .map(Default::default())
        .async_mode(AsyncMode::JavaScriptPromiseIntegration {
            imports: vec![],
            exports: vec![],
        })
        .build();
    let config = TranspileConfig::builder()
        .opts(opts)
        .maybe_cm_runtime_es_module(args.get(4).cloned())
        .build();
    let result = js_component_bindgen::transpile_with_config(&bytes, config)
        .expect("transpile component fixture through the selected trait runtime");
    std::fs::create_dir_all(&args[2]).expect("create isolated output");
    for (name, contents) in result.files {
        let file = std::path::Path::new(&args[2]).join(name);
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(file, contents).unwrap();
    }
}
