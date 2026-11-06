//! Lift helpers share selected codec/scratch owners and lazy pending-family capabilities.
use super::{
    ErrCtxContext, FutureContext, RuntimeContext, RuntimeImport, RuntimeImportKind,
    RuntimeInitializer, StreamContext,
};
use crate::{
    intrinsics::{RenderIntrinsicsArgs, lift::LiftIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum LiftContext {
    Strings,
    Variant,
    Flags,
    Future,
    Stream,
}
impl LiftContext {
    const ALL: [Self; 5] = [
        Self::Strings,
        Self::Variant,
        Self::Flags,
        Self::Future,
        Self::Stream,
    ];
    pub(crate) fn get_global_names() -> impl Iterator<Item = &'static str> {
        Self::ALL
            .into_iter()
            .flat_map(|context| {
                [
                    Some(context.local_name()),
                    context.initializer().map(|init| init.local_name),
                ]
            })
            .flatten()
    }
    pub(crate) fn local_name(self) -> &'static str {
        match self {
            Self::Strings => "_jcoLiftStringContext",
            Self::Variant => "_jcoLiftVariantContext",
            Self::Flags => "_jcoLiftFlagsContext",
            Self::Future => "_jcoLiftFutureContext",
            Self::Stream => "_jcoLiftStreamContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        (self == Self::Variant).then_some(RuntimeInitializer {
            suffix: "intrinsics/lift",
            export: "initializeLiftVariant",
            local_name: "_jcoInitializeLiftVariant",
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContext] {
        match self {
            Self::Strings => &[RuntimeContext::Utf8Decoder, RuntimeContext::Utf16Decoder],
            Self::Future => &[RuntimeContext::Future(FutureContext::Lookup)],
            Self::Stream => &[
                RuntimeContext::Stream(StreamContext::Lookup),
                RuntimeContext::Stream(StreamContext::ExternalClass),
            ],
            _ => &[],
        }
    }
    pub(crate) fn render(self, output: &mut Source, args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        match self {
            Self::Strings => uwriteln!(
                output,
                "const {local} = {{ utf8: TEXT_DECODER_UTF8, utf16: utf16Decoder }};"
            ),
            Self::Variant => uwriteln!(output, "const {local} = _jcoInitializeLiftVariant();"),
            Self::Flags => {
                let as_bigint = args.transpile_opts.flags_as_bigint;
                uwriteln!(output, "const {local} = {{ asBigInt: {as_bigint} }};");
            }
            // Share selected named owner contexts.
            Self::Future => uwriteln!(output, "const {local} = _jcoFutureEndLookupContext;"),
            Self::Stream => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, tables: STREAM_TABLES, StreamEnd, Stream }};"
            ),
        }
    }
}

pub(crate) fn import(intrinsic: LiftIntrinsic) -> RuntimeImport {
    use LiftIntrinsic::*;
    let context = match intrinsic {
        LiftFlatStringAny => Some(RuntimeContext::Lift(LiftContext::Strings)),
        LiftFlatStringUtf8 => Some(RuntimeContext::Utf8Decoder),
        LiftFlatStringUtf16 => Some(RuntimeContext::Utf16Decoder),
        LiftFlatVariant | LiftFlatEnum | LiftFlatOption | LiftFlatResult => {
            Some(RuntimeContext::Lift(LiftContext::Variant))
        }
        LiftFlatFlags => Some(RuntimeContext::Lift(LiftContext::Flags)),
        LiftFlatList => Some(RuntimeContext::ResourceTableGet),
        LiftFlatFuture => Some(RuntimeContext::Lift(LiftContext::Future)),
        LiftFlatStream => Some(RuntimeContext::Lift(LiftContext::Stream)),
        LiftFlatErrorContext => Some(RuntimeContext::ErrCtx(ErrCtxContext::New)),
        _ => None,
    };
    RuntimeImport {
        suffix: "intrinsics/lift",
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
        intrinsics::{
            Intrinsic, render_intrinsics,
            runtime::{self, IntrinsicBinding},
        },
    };
    use std::collections::BTreeSet;

    fn generated(selected: &[LiftIntrinsic]) -> (String, BTreeSet<Intrinsic>) {
        let mut intrinsics = selected.iter().copied().map(Intrinsic::Lift).collect();
        let opts = TranspileOpts::builder().name("lift".into()).build();
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
    fn primitive_lifts_have_no_store_or_unused_codec_allocations() {
        let (source, intrinsics) =
            generated(&[LiftIntrinsic::LiftFlatBool, LiftIntrinsic::LiftFlatChar]);
        for absent in [
            "TextDecoder",
            "DataView",
            "ASYNC_TASK",
            "FUTURE_TABLES",
            "_jcoLiftVariantContext",
            "function _liftFlat",
        ] {
            assert!(!source.contains(absent), "{absent}");
        }
        assert_eq!(intrinsics.len(), 2);
        assert_eq!(
            runtime::select(true).call(Intrinsic::Lift(LiftIntrinsic::LiftFlatBool), "ctx"),
            "_liftFlatBool(ctx)"
        );
    }
    #[test]
    fn selected_codecs_and_variant_scratch_are_shared_per_store() {
        let (source, _) = generated(&[
            LiftIntrinsic::LiftFlatStringAny,
            LiftIntrinsic::LiftFlatStringUtf8,
            LiftIntrinsic::LiftFlatVariant,
            LiftIntrinsic::LiftFlatOption,
        ]);
        assert_eq!(source.matches("const TEXT_DECODER_UTF8 =").count(), 1);
        assert_eq!(source.matches("const utf16Decoder =").count(), 1);
        assert_eq!(
            source
                .matches("const _jcoLiftVariantContext = _jcoInitializeLiftVariant();")
                .count(),
            1
        );
        assert_eq!(
            runtime::select(true)
                .callback_reference(Intrinsic::Lift(LiftIntrinsic::LiftFlatStringAny)),
            "_liftFlatStringAny.bind(void 0, _jcoLiftStringContext)"
        );
        assert_eq!(
            runtime::select(false)
                .callback_reference(Intrinsic::Lift(LiftIntrinsic::LiftFlatStringAny)),
            "_liftFlatStringAny"
        );
        assert_eq!(
            runtime::select(true).call(Intrinsic::Lift(LiftIntrinsic::LiftFlatVariant), "meta"),
            "_liftFlatVariant(_jcoLiftVariantContext, meta)"
        );
    }
    #[test]
    fn endpoint_capabilities_share_named_owners() {
        let (source, intrinsics) =
            generated(&[LiftIntrinsic::LiftFlatFuture, LiftIntrinsic::LiftFlatStream]);
        assert_eq!(intrinsics.len(), 2);
        assert!(source.contains("const _jcoLiftFutureContext = _jcoFutureEndLookupContext;"));
        assert!(source.contains("tables: STREAM_TABLES, Stream"));
        assert!(!source.contains("getExternalStream:"));
        assert!(!source.contains("function _liftFlatFuture("));
        assert!(!source.contains("function _liftFlatStream("));
        assert!(matches!(
            runtime::binding(
                runtime::select(true),
                Intrinsic::Lift(LiftIntrinsic::LiftFlatFuture)
            ),
            IntrinsicBinding::Imported { .. }
        ));
    }
}
