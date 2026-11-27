//! WIT toolchain used to translate component binaries.

#![allow(
    clippy::duplicate_mod,
    reason = "each backend uses its own public dependency types"
)]

#[cfg(not(feature = "wit-parser-262"))]
use crate::wit_parser_259 as wit;
#[cfg(feature = "wit-parser-262")]
use crate::wit_parser_262 as wit;

#[cfg(feature = "wit-parser-262")]
pub(crate) use wit::function_bindgen;
#[cfg(test)]
pub(crate) use wit::generate_types;
pub(crate) use wit::{
    dealias, ensure_supported_functions, esm_bindgen, get_thrown_type, result_error_class,
    ts_bindgen, wit_bindgen_core, wit_component, wit_parser,
};

// The binary translator uses Wasmtime 50 with either WIT parser. The public
// 0.259 FunctionBindgen retains the Wasmtime 49 types used by its callers.
#[cfg(not(feature = "wit-parser-262"))]
use ::wasmtime_environ;
#[cfg(not(feature = "wit-parser-262"))]
#[path = "function_bindgen.rs"]
pub(crate) mod function_bindgen;

pub(crate) fn implements(
    resolve: &wit_parser::Resolve,
    key: &wit_parser::WorldKey,
    item: &wit_parser::WorldItem,
) -> Option<String> {
    #[cfg(feature = "wit-parser-262")]
    {
        resolve
            .implements_interface(key, item)
            .and_then(|id| resolve.id_of(id))
    }
    #[cfg(not(feature = "wit-parser-262"))]
    {
        resolve.implements_value(key, item)
    }
}
