//! Flat lowering with selected policies, codecs and pending-family capabilities.
use super::{
    ComponentContextIntrinsic, CoreContextIntrinsic, ErrCtxContextIntrinsic,
    FutureContextIntrinsic, LiftContextIntrinsic, RuntimeContextIntrinsic, RuntimeImport,
    RuntimeImportKind, StreamContextIntrinsic,
};
use crate::{
    intrinsics::{RenderIntrinsicsArgs, lower::LowerIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;

/// Capability contexts for external canonical lowering intrinsics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[allow(clippy::enum_variant_names)]
pub(crate) enum LowerContextIntrinsic {
    /// The UTF-8 encoder and UTF-16 encoding state shared by `lowerFlatStringAny`.
    LowerFlatStringAny,
    /// Numeric policy and byte order for `lowerFlatList`.
    LowerFlatList,
    /// Numeric policy, component state, and selected future capabilities for `lowerFlatFuture`.
    LowerFlatFuture,
    /// Numeric policy, component state, and stream capabilities for `lowerFlatStream`.
    LowerFlatStream,
    /// Numeric policy and error-context tables shared by `lowerFlatErrorContext`.
    LowerFlatErrorContext,
}
impl LowerContextIntrinsic {
    const ALL: [Self; 5] = [
        Self::LowerFlatStringAny,
        Self::LowerFlatList,
        Self::LowerFlatFuture,
        Self::LowerFlatStream,
        Self::LowerFlatErrorContext,
    ];
    pub(crate) fn get_global_names() -> impl Iterator<Item = &'static str> {
        Self::ALL.iter().map(|context| context.local_name())
    }
    pub(crate) fn local_name(self) -> &'static str {
        match self {
            Self::LowerFlatStringAny => "_jcoLowerStringContext",
            Self::LowerFlatList => "_jcoLowerListContext",
            Self::LowerFlatFuture => "_jcoLowerFutureContext",
            Self::LowerFlatStream => "_jcoLowerStreamContext",
            Self::LowerFlatErrorContext => "_jcoLowerErrorContext",
        }
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContextIntrinsic] {
        match self {
            Self::LowerFlatStringAny => &[
                RuntimeContextIntrinsic::InitializeUtf8Encoder,
                RuntimeContextIntrinsic::InitializeUtf16Encoding,
            ],
            Self::LowerFlatList => &[
                RuntimeContextIntrinsic::NumericConversion,
                RuntimeContextIntrinsic::Core(CoreContextIntrinsic::InitializeEndianness),
            ],
            Self::LowerFlatFuture => &[
                RuntimeContextIntrinsic::NumericConversion,
                RuntimeContextIntrinsic::Component(
                    ComponentContextIntrinsic::GetOrCreateAsyncState,
                ),
                RuntimeContextIntrinsic::Core(CoreContextIntrinsic::InitializeSymbolResourceRep),
                RuntimeContextIntrinsic::Future(FutureContextIntrinsic::InitializeFutures),
                RuntimeContextIntrinsic::Future(
                    FutureContextIntrinsic::InitializeNestedFutureSymbol,
                ),
                RuntimeContextIntrinsic::Future(FutureContextIntrinsic::CreateFuture),
                RuntimeContextIntrinsic::Future(FutureContextIntrinsic::GenFutureHostInjectFn),
            ],
            Self::LowerFlatStream => &[
                RuntimeContextIntrinsic::NumericConversion,
                RuntimeContextIntrinsic::Component(
                    ComponentContextIntrinsic::GetOrCreateAsyncState,
                ),
                RuntimeContextIntrinsic::Core(CoreContextIntrinsic::InitializeSymbolResourceRep),
                RuntimeContextIntrinsic::Stream(StreamContextIntrinsic::InitializeStreams),
                RuntimeContextIntrinsic::Stream(
                    StreamContextIntrinsic::InitializeInternalStreamClass,
                ),
                RuntimeContextIntrinsic::Stream(StreamContextIntrinsic::IsStreamLowerableObject),
                RuntimeContextIntrinsic::Stream(StreamContextIntrinsic::CreateStream),
                RuntimeContextIntrinsic::Stream(
                    StreamContextIntrinsic::GenReadFnFromLowerableStream,
                ),
                RuntimeContextIntrinsic::Stream(StreamContextIntrinsic::GenStreamHostInjectFn),
            ],
            Self::LowerFlatErrorContext => &[
                RuntimeContextIntrinsic::NumericConversion,
                RuntimeContextIntrinsic::ErrCtx(ErrCtxContextIntrinsic::ErrorContextNew),
            ],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        let fields = match self {
            Self::LowerFlatStringAny => {
                "utf8: TEXT_ENCODER_UTF8, utf16: _jcoUtf16EncodingContext".to_string()
            }
            Self::LowerFlatList => {
                "numeric: _jcoStrictNumericContext, littleEndian: isLE".to_string()
            }
            Self::LowerFlatErrorContext => {
                "numeric: _jcoStrictNumericContext, globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext, local: _jcoErrorContextLocalTableContext".to_string()
            }
            Self::LowerFlatFuture => {
                "numeric: _jcoStrictNumericContext, lookup: _jcoComponentStateLookupContext, resourceRep: symbolRscRep, nestedSymbol: NESTED_FUTURE_SYMBOL, futures: FUTURES, creation: _jcoFutureCreateContext, injection: _jcoFutureHostInjectContext".to_string()
            }
            Self::LowerFlatStream => {
                "numeric: _jcoStrictNumericContext, lookup: _jcoComponentStateLookupContext, resourceRep: symbolRscRep, streams: STREAMS, InternalStream, lowerable: _jcoStreamLowerableContext, creation: _jcoStreamCreateContext, source: _jcoStreamSourceContext, injection: _jcoStreamHostInjectContext".to_string()
            }
        };
        uwriteln!(output, "const {local} = {{ {fields} }};");
    }
}
pub(crate) fn import(intrinsic: LowerIntrinsic) -> RuntimeImport {
    use LowerIntrinsic::*;
    let context = match intrinsic {
        LowerFlatBool | LowerFlatS8 | LowerFlatU8 | LowerFlatS16 | LowerFlatU16 | LowerFlatS32
        | LowerFlatU32 | LowerFlatS64 | LowerFlatU64 | LowerFlatFloat32 | LowerFlatFloat64
        | LowerFlatVariant | LowerFlatEnum | LowerFlatOption | LowerFlatResult | LowerFlatMap
        | LowerFlatOwn => Some(RuntimeContextIntrinsic::NumericConversion),
        LowerFlatList => Some(RuntimeContextIntrinsic::Lower(
            LowerContextIntrinsic::LowerFlatList,
        )),
        LowerFlatStringAny => Some(RuntimeContextIntrinsic::Lower(
            LowerContextIntrinsic::LowerFlatStringAny,
        )),
        LowerFlatStringUtf8 => Some(RuntimeContextIntrinsic::InitializeUtf8Encoder),
        LowerFlatStringUtf16 => Some(RuntimeContextIntrinsic::InitializeUtf16Encoding),
        LowerFlatFlags => Some(RuntimeContextIntrinsic::Lift(
            LiftContextIntrinsic::LiftFlatFlags,
        )),
        LowerFlatFuture => Some(RuntimeContextIntrinsic::Lower(
            LowerContextIntrinsic::LowerFlatFuture,
        )),
        LowerFlatStream => Some(RuntimeContextIntrinsic::Lower(
            LowerContextIntrinsic::LowerFlatStream,
        )),
        LowerFlatErrorContext => Some(RuntimeContextIntrinsic::Lower(
            LowerContextIntrinsic::LowerFlatErrorContext,
        )),
        LowerFlatChar | LowerFlatRecord | LowerFlatTuple | LowerFlatBorrow => None,
    };
    RuntimeImport {
        suffix: "intrinsics/lower",
        export: intrinsic.name().strip_prefix('_').unwrap(),
        context,
        kind: RuntimeImportKind::Call,
    }
}
#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::{
        TranspileOpts,
        intrinsics::{Intrinsic, render_intrinsics, runtime},
    };
    use std::collections::BTreeSet;
    fn generated(selected: &[LowerIntrinsic]) -> (String, BTreeSet<Intrinsic>) {
        let mut intrinsics = selected.iter().copied().map(Intrinsic::Lower).collect();
        let opts = TranspileOpts::builder()
            .name("lower".into())
            .strict(true)
            .build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .external_runtime(true)
                .build(),
        )
        .to_string();
        (source, intrinsics)
    }
    #[test]
    fn numeric_callbacks_share_policy_and_pure_helpers_need_no_state() {
        let (source, _) = generated(&[
            LowerIntrinsic::LowerFlatU32,
            LowerIntrinsic::LowerFlatVariant,
        ]);
        assert_eq!(
            source
                .matches("const _jcoStrictNumericContext = { strict: true };")
                .count(),
            1
        );
        assert!(!source.contains("TEXT_ENCODER"));
        assert!(!source.contains("FUTURES"));
        assert_eq!(
            runtime::select(true)
                .callback_reference(Intrinsic::Lower(LowerIntrinsic::LowerFlatU32)),
            "_lowerFlatU32.bind(void 0, _jcoStrictNumericContext)"
        );
        assert_eq!(
            runtime::select(false)
                .callback_reference(Intrinsic::Lower(LowerIntrinsic::LowerFlatU32)),
            "_lowerFlatU32"
        );
        let (pure, intrinsics) = generated(&[
            LowerIntrinsic::LowerFlatRecord,
            LowerIntrinsic::LowerFlatChar,
        ]);
        assert!(!pure.contains("_jcoStrictNumericContext"));
        assert_eq!(intrinsics.len(), 2);
    }
    #[test]
    fn lists_share_numeric_policy_and_selected_endianness() {
        let (source, _) = generated(&[LowerIntrinsic::LowerFlatList]);
        assert!(source.contains("const isLE = _jcoInitializeEndianness();"));
        assert!(source.contains(
            "const _jcoLowerListContext = { numeric: _jcoStrictNumericContext, littleEndian: isLE };"
        ));
        assert_eq!(
            runtime::select(true).call(Intrinsic::Lower(LowerIntrinsic::LowerFlatList), "meta"),
            "_lowerFlatList(_jcoLowerListContext, meta)"
        );
    }
    #[test]
    fn pending_family_contexts_preserve_classes_and_all_inline_dependencies() {
        let (source, intrinsics) = generated(&[
            LowerIntrinsic::LowerFlatFuture,
            LowerIntrinsic::LowerFlatStream,
        ]);
        for expected in [
            "futures: FUTURES",
            "streams: STREAMS",
            "nestedSymbol: NESTED_FUTURE_SYMBOL",
            "lowerable: _jcoStreamLowerableContext",
            "InternalStream",
        ] {
            assert!(source.contains(expected), "{expected}");
        }
        assert!(source.contains("creation: _jcoFutureCreateContext"));
        // Component state calls back into functions that stay inline.
        for inline in [
            crate::intrinsics::component::ComponentIntrinsic::ReportTrap,
            crate::intrinsics::component::ComponentIntrinsic::CheckIdle,
        ] {
            assert!(intrinsics.contains(&Intrinsic::Component(inline)));
        }
        assert!(!source.contains("function _lowerFlatFuture("));
        assert!(!source.contains("function _lowerFlatStream("));
    }
}
