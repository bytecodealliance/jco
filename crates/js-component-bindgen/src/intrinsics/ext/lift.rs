//! Lift helpers share selected codec/scratch owners and lazy pending-family capabilities.
use super::{
    ComponentContextIntrinsic, CoreContextIntrinsic, ErrCtxContextIntrinsic,
    FutureContextIntrinsic, RuntimeContextIntrinsic, RuntimeImport, RuntimeImportKind,
    RuntimeInitializer,
};
use crate::{
    intrinsics::{
        Intrinsic, RenderIntrinsicsArgs, lift::LiftIntrinsic,
        p3::async_stream::AsyncStreamIntrinsic,
    },
    source::Source,
    uwriteln,
};
use std::fmt::Write;

/// State initializers and capability contexts for external lifting intrinsics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum LiftContextIntrinsic {
    /// The UTF-8 and UTF-16 decoders shared by `liftFlatStringAny`.
    LiftFlatStringAny,
    /// Trap and endianness capabilities for `liftFlatList`.
    LiftFlatList,
    /// The variant scratch storage returned by `initializeLiftVariant`, shared by
    /// `liftFlatVariant`, `liftFlatEnum`, `liftFlatOption`, and `liftFlatResult`.
    InitializeLiftVariant,
    /// The bigint representation setting used by `liftFlatFlags`.
    LiftFlatFlags,
    /// Component state and selected future-table access for `liftFlatFuture`.
    LiftFlatFuture,
    /// Component state and lazy stream-table and constructor access for `liftFlatStream`.
    LiftFlatStream,
}
impl LiftContextIntrinsic {
    const ALL: [Self; 6] = [
        Self::LiftFlatStringAny,
        Self::LiftFlatList,
        Self::InitializeLiftVariant,
        Self::LiftFlatFlags,
        Self::LiftFlatFuture,
        Self::LiftFlatStream,
    ];
    pub(crate) fn get_global_names() -> impl Iterator<Item = &'static str> {
        Self::ALL
            .iter()
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
            Self::LiftFlatStringAny => "_jcoLiftStringContext",
            Self::LiftFlatList => "_jcoLiftListContext",
            Self::InitializeLiftVariant => "_jcoLiftVariantContext",
            Self::LiftFlatFlags => "_jcoLiftFlagsContext",
            Self::LiftFlatFuture => "_jcoLiftFutureContext",
            Self::LiftFlatStream => "_jcoLiftStreamContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::InitializeLiftVariant => ("initializeLiftVariant", "_jcoInitializeLiftVariant"),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/lift",
            export,
            local_name,
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContextIntrinsic] {
        match self {
            Self::LiftFlatStringAny => &[
                RuntimeContextIntrinsic::InitializeUtf8Decoder,
                RuntimeContextIntrinsic::InitializeUtf16Decoder,
            ],
            Self::LiftFlatList => &[
                RuntimeContextIntrinsic::Core(
                    CoreContextIntrinsic::InitializeRuntimeErrorConstructor,
                ),
                RuntimeContextIntrinsic::Core(CoreContextIntrinsic::InitializeEndianness),
            ],
            Self::LiftFlatFuture => &[RuntimeContextIntrinsic::Future(
                FutureContextIntrinsic::GetFutureEnd,
            )],
            Self::LiftFlatStream => &[
                RuntimeContextIntrinsic::Component(
                    ComponentContextIntrinsic::GetOrCreateAsyncState,
                ),
                RuntimeContextIntrinsic::Core(
                    CoreContextIntrinsic::InitializeRuntimeErrorConstructor,
                ),
            ],
            _ => &[],
        }
    }
    pub(crate) fn render(self, output: &mut Source, args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        match self {
            Self::LiftFlatStringAny => uwriteln!(
                output,
                "const {local} = {{ utf8: TEXT_DECODER_UTF8, utf16: utf16Decoder }};"
            ),
            Self::LiftFlatList => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssemblyRuntimeError, littleEndian: isLE }};"
            ),
            Self::InitializeLiftVariant => {
                uwriteln!(output, "const {local} = _jcoInitializeLiftVariant();")
            }
            Self::LiftFlatFlags => {
                let as_bigint = args.transpile_opts.flags_as_bigint;
                uwriteln!(output, "const {local} = {{ asBigInt: {as_bigint} }};");
            }
            Self::LiftFlatFuture => {
                uwriteln!(output, "const {local} = _jcoFutureEndLookupContext;")
            }
            Self::LiftFlatStream => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, getTables: () => STREAM_TABLES, getEnd: (options) => getStreamEnd(options), getExternalStream: () => Stream }};"
            ),
        }
    }
}

pub(crate) fn import(intrinsic: LiftIntrinsic) -> RuntimeImport {
    use LiftIntrinsic::*;
    let context = match intrinsic {
        DecodeUtf8 => Some(RuntimeContextIntrinsic::Core(
            CoreContextIntrinsic::InitializeRuntimeErrorConstructor,
        )),
        LiftFlatStringAny => Some(RuntimeContextIntrinsic::Lift(
            LiftContextIntrinsic::LiftFlatStringAny,
        )),
        LiftFlatStringUtf8 => Some(RuntimeContextIntrinsic::InitializeUtf8Decoder),
        LiftFlatStringUtf16 => Some(RuntimeContextIntrinsic::InitializeUtf16Decoder),
        LiftFlatVariant | LiftFlatEnum | LiftFlatOption | LiftFlatResult => Some(
            RuntimeContextIntrinsic::Lift(LiftContextIntrinsic::InitializeLiftVariant),
        ),
        LiftFlatFlags => Some(RuntimeContextIntrinsic::Lift(
            LiftContextIntrinsic::LiftFlatFlags,
        )),
        LiftFlatList => Some(RuntimeContextIntrinsic::Lift(
            LiftContextIntrinsic::LiftFlatList,
        )),
        LiftFlatFuture => Some(RuntimeContextIntrinsic::Lift(
            LiftContextIntrinsic::LiftFlatFuture,
        )),
        LiftFlatStream => Some(RuntimeContextIntrinsic::Lift(
            LiftContextIntrinsic::LiftFlatStream,
        )),
        LiftFlatErrorContext => Some(RuntimeContextIntrinsic::ErrCtx(
            ErrCtxContextIntrinsic::ErrorContextNew,
        )),
        _ => None,
    };
    RuntimeImport {
        suffix: "intrinsics/lift",
        export: intrinsic.name().strip_prefix('_').unwrap(),
        context,
        kind: RuntimeImportKind::Call,
    }
}

pub(crate) fn discover(intrinsic: Intrinsic, args: &RenderIntrinsicsArgs<'_>) {
    if let Intrinsic::Lift(LiftIntrinsic::LiftFlatStream) = intrinsic {
        args.require_intrinsic(AsyncStreamIntrinsic::GlobalStreamTableMap);
        args.require_intrinsic(AsyncStreamIntrinsic::GetStreamEnd);
        args.require_intrinsic(AsyncStreamIntrinsic::ExternalStreamClass);
    }
}

#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::{
        TranspileOpts,
        intrinsics::{
            render_intrinsics,
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
    fn utf8_decode_uses_the_selected_runtime_error_constructor() {
        let (source, _) = generated(&[LiftIntrinsic::DecodeUtf8]);
        assert!(source.contains(
            "const WebAssemblyRuntimeError = _jcoInitializeRuntimeErrorConstructor(WebAssembly);"
        ));
        assert!(!source.contains("function _decodeUtf8("));
        assert_eq!(
            runtime::select(true)
                .call(Intrinsic::Lift(LiftIntrinsic::DecodeUtf8), "decoder, bytes"),
            "_decodeUtf8(WebAssemblyRuntimeError, decoder, bytes)"
        );
        assert_eq!(
            runtime::select(false)
                .call(Intrinsic::Lift(LiftIntrinsic::DecodeUtf8), "decoder, bytes"),
            "_decodeUtf8(decoder, bytes)"
        );
    }

    #[test]
    fn numeric_lists_share_selected_endianness_and_trap_capabilities() {
        let (source, _) = generated(&[LiftIntrinsic::LiftFlatList]);
        assert!(source.contains("const isLE = _jcoInitializeEndianness();"));
        assert!(source.contains(
            "const _jcoLiftListContext = { RuntimeError: WebAssemblyRuntimeError, littleEndian: isLE };"
        ));
        assert_eq!(
            runtime::select(true).call(Intrinsic::Lift(LiftIntrinsic::LiftFlatList), "meta"),
            "_liftFlatList(_jcoLiftListContext, meta)"
        );
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
    fn pending_endpoint_capabilities_are_lazy_and_keep_inline_dependencies() {
        let (source, intrinsics) =
            generated(&[LiftIntrinsic::LiftFlatFuture, LiftIntrinsic::LiftFlatStream]);
        for retained in [
            Intrinsic::AsyncStream(AsyncStreamIntrinsic::GlobalStreamTableMap),
            Intrinsic::AsyncStream(AsyncStreamIntrinsic::GetStreamEnd),
            Intrinsic::AsyncStream(AsyncStreamIntrinsic::ExternalStreamClass),
        ] {
            assert!(intrinsics.contains(&retained), "{retained:?}");
        }
        assert!(source.contains("const _jcoLiftFutureContext = _jcoFutureEndLookupContext;"));
        assert!(source.contains("getTables: () => STREAM_TABLES"));
        assert!(source.contains("getExternalStream: () => Stream"));
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
