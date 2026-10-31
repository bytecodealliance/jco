//! Flat lowering with selected policies, codecs and pending-family capabilities.
use super::{
    ComponentContext, CoreContext, ErrCtxContext, FutureContext, LiftContext, RuntimeContext,
    RuntimeImport, RuntimeImportKind, RuntimeInitializer, StreamContext,
};
use crate::{
    intrinsics::{RenderIntrinsicsArgs, lower::LowerIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum LowerContext {
    Strings,
    Future,
    Stream,
    Error,
}
impl LowerContext {
    pub(crate) fn get_global_names() -> impl Iterator<Item = &'static str> {
        [Self::Strings, Self::Future, Self::Stream, Self::Error]
            .into_iter()
            .map(Self::local_name)
    }
    pub(crate) fn local_name(self) -> &'static str {
        match self {
            Self::Strings => "_jcoLowerStringContext",
            Self::Future => "_jcoLowerFutureContext",
            Self::Stream => "_jcoLowerStreamContext",
            Self::Error => "_jcoLowerErrorContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        None
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContext] {
        match self {
            Self::Strings => &[RuntimeContext::Utf8Encoder, RuntimeContext::Utf16Encoding],
            Self::Future => &[
                RuntimeContext::StrictNumeric,
                RuntimeContext::Component(ComponentContext::StateLookup),
                RuntimeContext::Core(CoreContext::SymbolResourceRep),
                RuntimeContext::Future(FutureContext::Futures),
                RuntimeContext::Future(FutureContext::NestedSymbol),
                RuntimeContext::Future(FutureContext::Creation),
                RuntimeContext::Future(FutureContext::Inject),
            ],
            Self::Stream => &[
                RuntimeContext::StrictNumeric,
                RuntimeContext::Component(ComponentContext::StateLookup),
                RuntimeContext::Core(CoreContext::SymbolResourceRep),
                RuntimeContext::Stream(StreamContext::Streams),
                RuntimeContext::Stream(StreamContext::InternalClass),
                RuntimeContext::Stream(StreamContext::Lowerable),
                RuntimeContext::Stream(StreamContext::Creation),
                RuntimeContext::Stream(StreamContext::Source),
                RuntimeContext::Stream(StreamContext::Inject),
            ],
            Self::Error => &[
                RuntimeContext::StrictNumeric,
                RuntimeContext::ErrCtx(ErrCtxContext::New),
            ],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        let fields = match self {
            Self::Strings => "utf8: TEXT_ENCODER_UTF8, utf16: _jcoUtf16EncodingContext",
            Self::Error => {
                "numeric: _jcoStrictNumericContext, globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext, local: _jcoErrorContextLocalTableContext"
            }
            // Each capability retains actual selected named owners.
            Self::Future => {
                "numeric: _jcoStrictNumericContext, lookup: _jcoComponentStateLookupContext, resourceRep: symbolRscRep, nestedSymbol: NESTED_FUTURE_SYMBOL, futures: FUTURES, creation: _jcoFutureCreateContext, injection: _jcoFutureHostInjectContext"
            }
            Self::Stream => {
                "numeric: _jcoStrictNumericContext, lookup: _jcoComponentStateLookupContext, resourceRep: symbolRscRep, streams: STREAMS, InternalStream, lowerable: _jcoStreamLowerableContext, creation: _jcoStreamCreateContext, source: _jcoStreamSourceContext, injection: _jcoStreamHostInjectContext"
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
        | LowerFlatVariant | LowerFlatEnum | LowerFlatOption | LowerFlatResult | LowerFlatList
        | LowerFlatMap | LowerFlatOwn => Some(RuntimeContext::StrictNumeric),
        LowerFlatStringAny => Some(RuntimeContext::Lower(LowerContext::Strings)),
        LowerFlatStringUtf8 => Some(RuntimeContext::Utf8Encoder),
        LowerFlatStringUtf16 => Some(RuntimeContext::Utf16Encoding),
        LowerFlatFlags => Some(RuntimeContext::Lift(LiftContext::Flags)),
        LowerFlatFuture => Some(RuntimeContext::Lower(LowerContext::Future)),
        LowerFlatStream => Some(RuntimeContext::Lower(LowerContext::Stream)),
        LowerFlatErrorContext => Some(RuntimeContext::Lower(LowerContext::Error)),
        _ => None,
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
    fn pending_family_contexts_preserve_lazy_classes_and_all_inline_dependencies() {
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
        assert_eq!(intrinsics.len(), 2);
        assert!(!source.contains("function _lowerFlatFuture("));
        assert!(!source.contains("function _lowerFlatStream("));
    }
}
