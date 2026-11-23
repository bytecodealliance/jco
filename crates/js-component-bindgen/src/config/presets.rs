//! Configuration presets for generating JavaScript bindings.

use crate::transpile_config_builder::{Empty, SetOpts, SetTypeGeneration};
use crate::{
    InstantiationMode, TranspileConfig, TranspileConfigBuilder, TranspileOpts, TypeGenerationConfig,
};

/// The standard configuration builder with the CLI's bindgen and declaration options set.
pub type JcoTranspileBuilder = TranspileConfigBuilder<SetTypeGeneration<SetOpts<Empty>>>;

/// Build the bindgen configuration used by `jco transpile` for the given output name.
/// By default, the generated ES module instantiates the component when imported.
/// For an explicit instantiation function, use [`jco_transpile_with_instantiation`].
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
/// let config = jco_transpile("service").call_tracking(true).build();
/// assert!(config.opts.instantiation_mode.is_none());
/// assert!(config.call_tracking);
/// ```
pub fn jco_transpile(name: impl Into<String>) -> JcoTranspileBuilder {
    cli_builder(name.into(), None)
}

/// Select the [`jco_transpile`] preset with the CLI's `--instantiation` option.
/// The caller supplies the imports when instantiating, and the generated bindings
/// load trampoline Wasm through `getCoreModule`. The same compatibility caveat applies.
pub fn jco_transpile_with_instantiation(
    name: impl Into<String>,
    mode: InstantiationMode,
) -> JcoTranspileBuilder {
    cli_builder(name.into(), Some(mode))
}

fn cli_builder(name: String, instantiation_mode: Option<InstantiationMode>) -> JcoTranspileBuilder {
    let imports = if instantiation_mode.is_none() {
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
    TranspileConfig::builder()
        .opts(TranspileOpts {
            name,
            base64_cutoff: 5000,
            map: Some(imports),
            emit_conditional_suspending_wasm: instantiation_mode.is_some(),
            instantiation_mode,
            ..Default::default()
        })
        .type_generation(TypeGenerationConfig {
            nominal_resources: false,
            async_imports_may_return_sync: false,
            typed_error_classes: false,
            separate_interface_types: false,
        })
}
