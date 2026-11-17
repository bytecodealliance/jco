//! Transpile a component from the command line, for inspecting and measuring
//! generated bindings without building the bindgen component.
//!
//! ```sh
//! cargo run -p js-component-bindgen --example transpile -- <component.wasm> <out-dir> [flags]
//! ```

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use js_component_bindgen::{
    AsyncMode, InstantiationMode, RuntimeProfile, TranspileConfig, TranspileOpts,
    transpile_with_config,
};

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let component_path = PathBuf::from(args.next().context("missing component path")?);
    let out_dir = PathBuf::from(args.next().context("missing output directory")?);

    let name = component_path
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.split('.').next())
        .context("component path has no file name")?
        .to_string();
    let mut opts = TranspileOpts {
        name,
        no_typescript: true,
        no_namespaced_exports: true,
        base64_cutoff: 0,
        ..Default::default()
    };
    let mut map = HashMap::new();
    let mut runtime_profile = RuntimeProfile::default();
    let mut jspi = false;
    let mut async_imports = Vec::new();
    let mut async_exports = Vec::new();
    #[cfg(feature = "external-runtime")]
    let mut cm_runtime_es_module = None;

    for arg in args {
        match arg.split_once('=') {
            None if arg == "--instantiation" => {
                opts.instantiation_mode = Some(InstantiationMode::Async)
            }
            None if arg == "--instantiation-sync" => {
                opts.instantiation_mode = Some(InstantiationMode::Sync)
            }
            None if arg == "--valid-lifting-optimization" => opts.valid_lifting_optimization = true,
            None if arg == "--tracing" => opts.tracing = true,
            None if arg == "--jspi" => jspi = true,
            Some(("--async-import", name)) => async_imports.push(name.to_string()),
            Some(("--async-export", name)) => async_exports.push(name.to_string()),
            None if arg == "--tla-compat" => opts.tla_compat = true,
            Some(("--profile", "checked")) => runtime_profile = RuntimeProfile::Checked,
            Some(("--profile", "debug")) => runtime_profile = RuntimeProfile::Debug,
            Some(("--profile", "unchecked")) => runtime_profile = RuntimeProfile::Unchecked,
            Some(("--map", mapping)) => {
                let (from, to) = mapping.split_once('=').context("--map takes from=to")?;
                map.insert(from.to_string(), to.to_string());
            }
            #[cfg(feature = "external-runtime")]
            Some(("--runtime", base)) => cm_runtime_es_module = Some(base.to_string()),
            _ => bail!("unknown argument [{arg}]"),
        }
    }
    if jspi || !async_imports.is_empty() || !async_exports.is_empty() {
        opts.async_mode = Some(AsyncMode::JavaScriptPromiseIntegration {
            imports: async_imports,
            exports: async_exports,
        });
    }
    if !map.is_empty() {
        opts.map = Some(map);
    }

    let component = fs::read(&component_path)
        .with_context(|| format!("reading [{}]", component_path.display()))?;
    let config = TranspileConfig::builder()
        .opts(opts)
        .runtime_profile(runtime_profile);
    #[cfg(feature = "external-runtime")]
    let config = config.maybe_cm_runtime_es_module(cm_runtime_es_module);
    let transpiled = transpile_with_config(&component, config.build())?;

    for (path, contents) in transpiled.files {
        let path = out_dir.join(path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, contents).with_context(|| format!("writing [{}]", path.display()))?;
    }
    Ok(())
}
