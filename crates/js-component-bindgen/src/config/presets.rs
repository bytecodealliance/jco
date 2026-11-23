//! Configuration presets for generating JavaScript bindings.

use std::collections::HashMap;

use crate::{InstantiationMode, TranspileConfig, TranspileOpts, TypeGenerationConfig};

/// Build the bindgen configuration used by `jco transpile` for the given output name.
/// By default, the generated ES module instantiates the component when imported.
/// Set `instantiation_mode` to export an explicit async or sync instantiation function.
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
/// use js_component_bindgen::{InstantiationMode, config::presets::jco_transpile};
///
/// let direct = jco_transpile("service").build();
/// assert!(direct.opts.instantiation_mode.is_none());
///
/// let config = jco_transpile("service")
///     .instantiation_mode(InstantiationMode::Async)
///     .base64_cutoff(0)
///     .build();
/// assert!(config.opts.emit_conditional_suspending_wasm);
/// assert_eq!(config.opts.base64_cutoff, 0);
/// ```
#[bon::builder(finish_fn = build)]
pub fn jco_transpile(
    #[builder(start_fn, into)] name: String,
    /// Export an explicit instantiation function. Omit for direct ES module output.
    instantiation_mode: Option<InstantiationMode>,
    /// Import mappings to add to the preset. Entries override matching preset keys.
    map: Option<HashMap<String, String>>,
    /// Inline core modules smaller than this many bytes.
    #[builder(default = 5000)]
    base64_cutoff: usize,
    /// Throw top-level result error payloads directly.
    #[builder(default)]
    no_component_error_wrapping: bool,
) -> TranspileConfig {
    let mut imports: HashMap<String, String> = if instantiation_mode.is_none() {
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
    if let Some(map) = map {
        imports.extend(map);
    }

    TranspileConfig {
        opts: TranspileOpts {
            name,
            base64_cutoff,
            no_component_error_wrapping,
            map: Some(imports),
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
