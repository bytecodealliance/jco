//! Web IDL proxy imports and per-instance cache ownership.
use super::{RuntimeContext, RuntimeImport, RuntimeImportKind};
use crate::intrinsics::webidl::WebIdlIntrinsic;
#[cfg(test)]
use crate::source::Source;
pub(crate) fn import(intrinsic: WebIdlIntrinsic) -> RuntimeImport {
    match intrinsic {
        WebIdlIntrinsic::GlobalThisIdlProxy => RuntimeImport {
            suffix: "intrinsics/webidl",
            export: intrinsic.name(),
            context: Some(RuntimeContext::WebIdlProxyCache),
            kind: RuntimeImportKind::Call,
        },
    }
}

#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::TranspileOpts;
    use crate::intrinsics::{
        Intrinsic, RenderIntrinsicsArgs, ext::ExternalRuntime, render_intrinsics,
        runtime::IntrinsicRuntime,
    };
    use std::collections::BTreeSet;

    #[test]
    fn named_proxy_selects_only_its_cache_and_contextual_call() {
        let intrinsic = Intrinsic::WebIdl(WebIdlIntrinsic::GlobalThisIdlProxy);
        let mut intrinsics = BTreeSet::from([intrinsic]);
        let opts = TranspileOpts::default();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .external_runtime(true)
                .build(),
        );
        let mut imports = Source::default();
        ExternalRuntime.render_imports(&mut imports, &intrinsics, "custom-runtime");
        assert!(
            source
                .contains("const _jcoWebIdlProxyCacheContext = _jcoInitializeWebIdlProxyCache();")
        );
        assert!(imports.contains("globalThisIdlProxy as globalThisIdlProxy"));
        assert!(imports.contains("initializeWebIdlProxyCache as _jcoInitializeWebIdlProxyCache"));
        assert_eq!(
            ExternalRuntime.call(intrinsic, ""),
            "globalThisIdlProxy(_jcoWebIdlProxyCacheContext)"
        );
        for unrelated in [
            "function globalThisIdlProxy",
            "var idlProxy",
            "new Map",
            "TextEncoder",
            "new Proxy",
            "Symbol('",
        ] {
            assert!(!source.contains(unrelated), "{unrelated}");
        }
    }
}
