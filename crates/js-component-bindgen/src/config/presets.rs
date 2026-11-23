//! Configuration presets for generating JavaScript bindings.

use crate::{InstantiationMode, TranspileConfig, TranspileOpts, TypeGenerationConfig};

/// Select the bindgen options used by `jco transpile` for the given output name.
/// Pass `None` for direct ES module output or select the CLI's `--instantiation` mode.
///
/// These values track the Jco CLI and `jco-transpile` sources corresponding
/// to this crate release. **Any preset value may change in a patch or minor
/// release.** Regenerating bindings can break applications built against older output.
/// Pin the crate version or set options explicitly when a value must stay fixed.
///
/// For the same bundled runtime as the CLI, enable the `embedded-cm-runtime`
/// Cargo feature. The caller supplies the output name the CLI derives from the
/// input filename. CLI file handling and postprocessing are outside bindgen.
///
/// ```
/// use js_component_bindgen::config::presets::jco_transpile;
///
/// let mut config = jco_transpile("service", None);
/// config.opts.map.as_mut().unwrap().insert(
///     "wasi:random/*".into(),
///     "./random.js#*".into(),
/// );
/// ```
pub fn jco_transpile(
    name: impl Into<String>,
    instantiation_mode: Option<InstantiationMode>,
) -> TranspileConfig {
    let map = if instantiation_mode.is_none() {
        include_str!("cli-imports.tsv")
            .lines()
            .map(|line| {
                let (specifier, target) = line.split_once('\t').expect("CLI import mapping");
                (specifier.to_owned(), target.to_owned())
            })
            .collect()
    } else {
        Default::default()
    };
    TranspileConfig {
        opts: TranspileOpts {
            name: name.into(),
            base64_cutoff: 5000,
            map: Some(map),
            emit_conditional_suspending_wasm: instantiation_mode.is_some(),
            instantiation_mode,
            ..Default::default()
        },
        type_generation: TypeGenerationConfig {
            nominal_resources: false,
            async_imports_may_return_sync: false,
            typed_error_classes: false,
            separate_interface_types: false,
        },
        ..Default::default()
    }
}
