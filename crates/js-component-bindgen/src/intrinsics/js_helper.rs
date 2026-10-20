//! Intrinsics that represent helpers that should be used from JS code

use crate::{intrinsics::RenderIntrinsicsArgs, source::Source};

/// This enum contains intrinsics that function as JS helpers
///
/// For example, intrinsics in this enum may create global JS variables,
/// polyfills, or perform commonly used JS functionality.
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum JsHelperIntrinsic {
    /// A Helper function that is simply an empty function
    EmptyFunc,

    /// A helper function that creates a JS `DataView` from a given memory index
    DataView,
}

impl JsHelperIntrinsic {
    pub(crate) fn runtime_path(&self) -> &'static str {
        match self {
            Self::EmptyFunc => "jsHelper.emptyFunc",
            Self::DataView => "jsHelper.dataView",
        }
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        ["emptyFunc", "dataView"]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::EmptyFunc => "emptyFunc",
            Self::DataView => "dataView",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source, _args: &RenderIntrinsicsArgs) {
        match self {
            Self::EmptyFunc => output.push_str("
                const emptyFunc = () => {};
            "),
            Self::DataView => output.push_str("
                let dv = new DataView(new ArrayBuffer());
                const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
            "),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TranspileOpts;
    use crate::intrinsics::{Intrinsic, render_intrinsics};
    use std::collections::BTreeSet;

    #[test]
    fn external_helpers_do_not_emit_inline_cache_or_functions() {
        for external in [false, true] {
            let mut intrinsics = BTreeSet::from([
                Intrinsic::JsHelper(JsHelperIntrinsic::EmptyFunc),
                Intrinsic::JsHelper(JsHelperIntrinsic::DataView),
            ]);
            let opts = TranspileOpts {
                cm_runtime_es_module: external.then(|| "./runtime.js".into()),
                ..TranspileOpts::default()
            };
            let source = render_intrinsics(
                RenderIntrinsicsArgs::builder()
                    .intrinsics(&mut intrinsics)
                    .transpile_opts(&opts)
                    .build(),
            );
            assert_eq!(source.contains("let dv = new DataView"), !external);
            assert_eq!(source.contains("const emptyFunc = () => {};"), !external);
            assert_eq!(source.contains("const dataView = mem =>"), !external);
            for intrinsic in [JsHelperIntrinsic::EmptyFunc, JsHelperIntrinsic::DataView] {
                assert_eq!(source.contains(intrinsic.runtime_path()), external);
            }
            if external {
                assert_eq!(
                    source.matches("return intrinsic.bind(receiver);").count(),
                    2
                );
            }
        }
    }
}
