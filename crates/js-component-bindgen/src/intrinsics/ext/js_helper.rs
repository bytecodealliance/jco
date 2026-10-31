//! Named JS helpers and the selected per-instance DataView cache.

use super::{RuntimeContext, RuntimeImport};
use crate::intrinsics::js_helper::JsHelperIntrinsic;

pub(crate) fn import(intrinsic: JsHelperIntrinsic) -> Option<RuntimeImport> {
    Some(RuntimeImport {
        suffix: "intrinsics/js-helper",
        export: intrinsic.name(),
        context: match intrinsic {
            JsHelperIntrinsic::MaybeSyncGeneratorFn
            | JsHelperIntrinsic::ConditionalSuspendingHostImportFn => {
                return None;
            }
            JsHelperIntrinsic::EmptyFunc => None,
            JsHelperIntrinsic::DataView => Some(RuntimeContext::DataViewCache),
        },
    })
}

#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::TranspileOpts;
    use crate::intrinsics::{
        Intrinsic, RenderIntrinsicsArgs, ext::ExternalRuntime, render_intrinsics,
    };
    use crate::source::Source;
    use std::collections::BTreeSet;

    #[test]
    fn cache_state_is_selected_only_for_data_view_users() {
        for selected in [JsHelperIntrinsic::EmptyFunc, JsHelperIntrinsic::DataView] {
            let mut intrinsics = BTreeSet::from([Intrinsic::JsHelper(selected)]);
            let opts = TranspileOpts::builder().name("cache".into()).build();
            let source = render_intrinsics(
                RenderIntrinsicsArgs::builder()
                    .intrinsics(&mut intrinsics)
                    .transpile_opts(&opts)
                    .external_runtime(true)
                    .build(),
            );
            let mut imports = Source::default();
            ExternalRuntime.render_imports(&mut imports, &intrinsics, "runtime-package");
            assert!(!source.contains("let dv ="));
            assert!(!source.contains("new DataView"));
            assert!(!source.contains("const emptyFunc"));
            assert!(imports.contains("runtime-package/intrinsics/js-helper"));
            assert_eq!(
                source.contains("_jcoInitializeDataViewCache()"),
                selected == JsHelperIntrinsic::DataView
            );
            assert_eq!(
                imports.contains("initializeDataViewCache as _jcoInitializeDataViewCache"),
                selected == JsHelperIntrinsic::DataView
            );
            for unrelated in [
                "TextEncoder",
                "TextDecoder",
                "Bitcast",
                "WebAssembly.Global",
                "new Map",
            ] {
                assert!(!source.contains(unrelated), "{unrelated}");
            }
        }
    }
}
