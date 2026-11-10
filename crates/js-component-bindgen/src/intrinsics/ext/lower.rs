//! Flat lowering with selected policies, codecs and pending-family capabilities.
use super::{
    ComponentContextIntrinsic, CoreContextIntrinsic, ErrCtxContextIntrinsic, LiftContextIntrinsic,
    RuntimeContextIntrinsic, RuntimeImport, RuntimeImportKind,
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

/// Capability contexts for external canonical lowering intrinsics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[allow(clippy::enum_variant_names)]
pub(crate) enum LowerContextIntrinsic {
    /// The UTF-8 encoder and UTF-16 encoding state shared by `lowerFlatStringAny`.
    LowerFlatStringAny,
    /// Numeric policy, component state, and lazy future capabilities for `lowerFlatFuture`.
    LowerFlatFuture,
    /// Numeric policy, component state, and lazy stream capabilities for `lowerFlatStream`.
    LowerFlatStream,
    /// Numeric policy and error-context tables shared by `lowerFlatErrorContext`.
    LowerFlatErrorContext,
}
impl LowerContextIntrinsic {
    const ALL: [Self; 4] = [
        Self::LowerFlatStringAny,
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
            Self::LowerFlatFuture | Self::LowerFlatStream => &[
                RuntimeContextIntrinsic::NumericConversion,
                RuntimeContextIntrinsic::Component(
                    ComponentContextIntrinsic::GetOrCreateAsyncState,
                ),
                RuntimeContextIntrinsic::Core(CoreContextIntrinsic::InitializeSymbolResourceRep),
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
            Self::LowerFlatErrorContext => {
                "numeric: _jcoStrictNumericContext, globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext, local: _jcoErrorContextLocalTableContext".to_string()
            }
            // Resolve inline endpoint state and constructors when the operation is called.
            Self::LowerFlatFuture => {
                let global = AsyncFutureIntrinsic::GlobalFutureMap.name();
                let is_lowerable = AsyncFutureIntrinsic::IsFutureLowerableObject.name();
                let create = AsyncFutureIntrinsic::CreateFuture.name();
                let gen_host_inject = AsyncFutureIntrinsic::GenFutureHostInjectFn.name();
                format!(
                    "numeric: _jcoStrictNumericContext, lookup: _jcoComponentStateLookupContext, resourceRep: symbolRscRep, getGlobal: () => {global}, isLowerable: (value) => {is_lowerable}(value), create: (state, options) => {create}(state, options), genHostInject: (options) => {gen_host_inject}(options)"
                )
            }
            Self::LowerFlatStream => {
                let global = AsyncStreamIntrinsic::GlobalStreamMap.name();
                let external_class = AsyncStreamIntrinsic::ExternalStreamClass.name();
                let internal_class = AsyncStreamIntrinsic::InternalStreamClass.name();
                let is_lowerable = AsyncStreamIntrinsic::IsStreamLowerableObject.name();
                let create = AsyncStreamIntrinsic::CreateStream.name();
                let gen_read = AsyncStreamIntrinsic::GenReadFnFromLowerableStream.name();
                let gen_host_inject = AsyncStreamIntrinsic::GenStreamHostInjectFn.name();
                format!(
                    "numeric: _jcoStrictNumericContext, lookup: _jcoComponentStateLookupContext, resourceRep: symbolRscRep, getGlobal: () => {global}, getExternalClass: () => {external_class}, getInternalClass: () => {internal_class}, isLowerable: (value) => {is_lowerable}(value), create: (state, options) => {create}(state, options), genRead: (value) => {gen_read}(value), genHostInject: (options) => {gen_host_inject}(options)"
                )
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
        | LowerFlatMap | LowerFlatOwn => Some(RuntimeContextIntrinsic::NumericConversion),
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
pub(crate) fn discover(intrinsic: Intrinsic, args: &RenderIntrinsicsArgs<'_>) {
    match intrinsic {
        Intrinsic::Lower(LowerIntrinsic::LowerFlatFuture) => {
            for dependency in [
                AsyncFutureIntrinsic::IsFutureLowerableObject,
                AsyncFutureIntrinsic::GlobalFutureMap,
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
