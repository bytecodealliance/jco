use anyhow::{Context as _, Result, ensure};

use super::ts_bindgen::ts_bindgen;
use super::wit_parser::{
    self, Function, Package, Resolve, Stability, Type, TypeDefKind, TypeId, WorldId,
};
use crate::{TranspileConfig, TranspileOpts, files, normalize_namespace_object_options};

pub fn generate_types(
    name: &str,
    resolve: Resolve,
    world_id: WorldId,
    opts: TranspileOpts,
) -> Result<Vec<(String, Vec<u8>)>> {
    generate_types_with_config(
        name,
        resolve,
        world_id,
        TranspileConfig::builder().opts(opts).build(),
    )
}

/// Generate declarations with optional host embedding features.
pub fn generate_types_with_config(
    name: &str,
    resolve: Resolve,
    world_id: WorldId,
    mut config: TranspileConfig,
) -> Result<Vec<(String, Vec<u8>)>> {
    #[cfg(feature = "external-runtime")]
    let external_runtime = config.cm_runtime_es_module.is_some();
    #[cfg(not(feature = "external-runtime"))]
    let external_runtime = false;
    let opts = &mut config.opts;
    normalize_namespace_object_options(opts)?;
    let mut files = files::Files::default();

    ts_bindgen(
        name,
        &resolve,
        world_id,
        opts,
        config.call_tracking,
        config.optional_result_payloads,
        config.type_generation,
        external_runtime,
        &mut files,
    )
    .context("failed to generate Typescript bindings")?;

    let mut files_out: Vec<(String, Vec<u8>)> = Vec::new();
    for (name, source) in files.iter() {
        files_out.push((name.to_string(), source.to_vec()));
    }
    Ok(files_out)
}

pub fn dealias(resolve: &Resolve, mut id: TypeId) -> TypeId {
    loop {
        match &resolve.types[id].kind {
            TypeDefKind::Type(Type::Id(that_id)) => id = *that_id,
            _ => break id,
        }
    }
}

/// Check if an item (usually some form of [`wit_parser::WorldItem`]) should be allowed through the feature gate
/// of a given package.
pub(super) fn feature_gate_allowed(
    resolve: &Resolve,
    package: &Package,
    stability: &Stability,
    item_name: &str,
) -> Result<bool> {
    Ok(match stability {
        Stability::Unknown => true,
        Stability::Stable { since, .. } => {
            let Some(package_version) = package.name.version.as_ref() else {
                // If the package version is missing (we're likely dealing with an unresolved package)
                // and we can't really check much.
                return Ok(true);
            };

            ensure!(
                package_version >= since,
                "feature gate on [{item_name}] refers to an unreleased (future) package version [{since}] (current package version is [{package_version}])"
            );

            // Stabilization (@since annotation) overrides features and deprecation
            true
        }
        Stability::Unstable {
            feature,
            deprecated: _,
        } => {
            // If a @unstable feature is present but the related feature was not enabled
            // or all features was not selected, exclude
            resolve.all_features || resolve.features.contains(feature)
        }
    })
}

/// Utility function for deducing whether a type can throw
pub fn get_thrown_type(
    resolve: &Resolve,
    return_type: Option<Type>,
) -> Option<(Option<&Type>, Option<&Type>)> {
    match return_type {
        None => None,
        Some(Type::Id(id)) => match &resolve.types[id].kind {
            TypeDefKind::Result(r) => Some((r.ok.as_ref(), r.err.as_ref())),
            _ => None,
        },
        _ => None,
    }
}

/// The class of the errors that the bindings throw when a function that an
/// interface exports returns the error of its `result`.
///
/// The bindings export one class per named error type from the interface, so
/// that a host can tell the errors of the interface apart with `instanceof`.
/// There is none for an error type without a name, and none where the name of
/// the class would be that of another declaration of the interface.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ResultErrorClass {
    /// The name that the interface exports the class under.
    pub name: String,
    /// The name of the error type, as declared in WIT.
    pub payload_type_name: String,
}

/// Find the [`ResultErrorClass`] of a function of an interface.
pub(crate) fn result_error_class(
    resolve: &Resolve,
    interface: wit_parser::InterfaceId,
    func: &Function,
) -> Option<ResultErrorClass> {
    use heck::ToUpperCamelCase as _;

    let (_, Some(Type::Id(err))) = get_thrown_type(resolve, func.result)? else {
        return None;
    };
    let payload_type_name = resolve.types[*err].name.clone()?;
    let name = format!("{}Error", payload_type_name.to_upper_camel_case());

    // The declarations of the interface name its types, and name the cases of
    // its variants after the variant and the case.
    let is_declared = resolve.interfaces[interface]
        .types
        .iter()
        .any(|(type_name, type_id)| {
            if type_name.to_upper_camel_case() == name {
                return true;
            }
            let TypeDefKind::Variant(variant) = &resolve.types[*type_id].kind else {
                return false;
            };
            variant
                .cases
                .iter()
                .any(|case| format!("{type_name}_{}", case.name).to_upper_camel_case() == name)
        });
    (!is_declared).then_some(ResultErrorClass {
        name,
        payload_type_name,
    })
}
