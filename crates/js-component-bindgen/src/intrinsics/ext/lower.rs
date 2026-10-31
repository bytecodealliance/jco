//! Flat lowering with selected policies, codecs and pending-family capabilities.
use super::{
    ComponentContext, CoreContext, ErrCtxContext, LiftContext, RuntimeContext, RuntimeImport,
    RuntimeImportKind, RuntimeInitializer,
};
use crate::{
    intrinsics::{
        Intrinsic, RenderIntrinsicsArgs,
        lower::LowerIntrinsic,
        p3::{async_future::AsyncFutureIntrinsic, async_stream::AsyncStreamIntrinsic},
    },
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
            Self::Future | Self::Stream => &[
                RuntimeContext::StrictNumeric,
                RuntimeContext::Component(ComponentContext::StateLookup),
                RuntimeContext::Core(CoreContext::SymbolResourceRep),
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
            // These references must remain lazy while N17/N18 still emit inline classes/state.
            Self::Future => {
                "numeric: _jcoStrictNumericContext, lookup: _jcoComponentStateLookupContext, resourceRep: symbolRscRep, getNestedSymbol: () => NESTED_FUTURE_SYMBOL, getGlobal: () => FUTURES, isLowerable: (value) => _isFutureLowerableObject(value), create: (state, options) => createFuture(state, options), genHostInject: (options) => _genFutureHostInjectFn(options)"
            }
            Self::Stream => {
                "numeric: _jcoStrictNumericContext, lookup: _jcoComponentStateLookupContext, resourceRep: symbolRscRep, getGlobal: () => STREAMS, getExternalClass: () => Stream, getInternalClass: () => InternalStream, isLowerable: (value) => _isStreamLowerableObject(value), create: (state, options) => createStream(state, options), genRead: (value) => _genReadFnFromLowerableStream(value), genHostInject: (options) => _genStreamHostInjectFn(options)"
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
pub(crate) fn discover(intrinsic: Intrinsic, args: &RenderIntrinsicsArgs<'_>) {
    match intrinsic {
        Intrinsic::Lower(LowerIntrinsic::LowerFlatFuture) => {
            for dependency in [
                AsyncFutureIntrinsic::IsFutureLowerableObject,
                AsyncFutureIntrinsic::GlobalFutureMap,
                AsyncFutureIntrinsic::NestedFutureSymbol,
                AsyncFutureIntrinsic::CreateFuture,
                AsyncFutureIntrinsic::GenFutureHostInjectFn,
            ] {
                args.require_intrinsic(dependency);
            }
        }
        Intrinsic::Lower(LowerIntrinsic::LowerFlatStream) => {
            for dependency in [
                AsyncStreamIntrinsic::GlobalStreamMap,
                AsyncStreamIntrinsic::ExternalStreamClass,
                AsyncStreamIntrinsic::InternalStreamClass,
                AsyncStreamIntrinsic::IsStreamLowerableObject,
                AsyncStreamIntrinsic::CreateStream,
                AsyncStreamIntrinsic::GenReadFnFromLowerableStream,
                AsyncStreamIntrinsic::GenStreamHostInjectFn,
            ] {
                args.require_intrinsic(dependency);
            }
        }
        _ => {}
    }
}
#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::{
        TranspileOpts,
        intrinsics::{render_intrinsics, runtime},
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
            "getGlobal: () => FUTURES",
            "getGlobal: () => STREAMS",
            "getNestedSymbol: () => NESTED_FUTURE_SYMBOL",
            "getExternalClass: () => Stream",
            "getInternalClass: () => InternalStream",
        ] {
            assert!(source.contains(expected), "{expected}");
        }
        assert!(intrinsics.contains(&Intrinsic::AsyncFuture(AsyncFutureIntrinsic::CreateFuture)));
        assert!(intrinsics.contains(&Intrinsic::AsyncStream(AsyncStreamIntrinsic::CreateStream)));
        assert!(!source.contains("function _lowerFlatFuture("));
        assert!(!source.contains("function _lowerFlatStream("));
    }
}
