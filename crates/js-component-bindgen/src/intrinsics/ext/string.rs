//! Named string operations and independently selected codec owners.

use super::{RuntimeContext, RuntimeImport, RuntimeImportKind};
use crate::intrinsics::string::StringIntrinsic;

pub(crate) fn import(intrinsic: StringIntrinsic) -> RuntimeImport {
    let (export, context, kind) = match intrinsic {
        StringIntrinsic::Utf16Decoder => (
            "initializeUtf16Decoder",
            Some(RuntimeContext::Utf16Decoder),
            RuntimeImportKind::InitializedValue,
        ),
        StringIntrinsic::GlobalTextDecoderUtf8 => (
            "initializeUtf8Decoder",
            Some(RuntimeContext::Utf8Decoder),
            RuntimeImportKind::InitializedValue,
        ),
        StringIntrinsic::GlobalTextEncoderUtf8 => (
            "initializeUtf8Encoder",
            Some(RuntimeContext::Utf8Encoder),
            RuntimeImportKind::InitializedValue,
        ),
        StringIntrinsic::Utf16Encode => (
            "utf16Encode",
            Some(RuntimeContext::Utf16Encoding),
            RuntimeImportKind::Call,
        ),
        StringIntrinsic::Utf16EncodeAsync => (
            "utf16EncodeAsync",
            Some(RuntimeContext::Utf16Encoding),
            RuntimeImportKind::Call,
        ),
        StringIntrinsic::Utf8Encode => (
            "utf8Encode",
            Some(RuntimeContext::Utf8Encoder),
            RuntimeImportKind::Call,
        ),
        StringIntrinsic::Utf8EncodeAsync => (
            "utf8EncodeAsync",
            Some(RuntimeContext::Utf8Encoder),
            RuntimeImportKind::Call,
        ),
        StringIntrinsic::CompactUtf16Decode => (
            "compactUtf16Decode",
            Some(RuntimeContext::Utf16Decoder),
            RuntimeImportKind::Call,
        ),
        StringIntrinsic::CompactUtf16Encode => (
            "compactUtf16Encode",
            Some(RuntimeContext::Utf16Encoding),
            RuntimeImportKind::Call,
        ),
        StringIntrinsic::Utf16ValidatingCopy => {
            ("utf16ValidatingCopy", None, RuntimeImportKind::Call)
        }
        StringIntrinsic::ValidateGuestChar => ("validateGuestChar", None, RuntimeImportKind::Call),
        StringIntrinsic::ValidateHostChar => ("validateHostChar", None, RuntimeImportKind::Call),
    };
    RuntimeImport {
        suffix: "intrinsics/string",
        export,
        context,
        kind,
    }
}

#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::TranspileOpts;
    use crate::intrinsics::{Intrinsic, render_intrinsics};
    use crate::intrinsics::{
        RenderIntrinsicsArgs, ext::ExternalRuntime, runtime::IntrinsicRuntime,
    };
    use crate::source::Source;
    use std::collections::BTreeSet;

    #[test]
    fn inline_string_lowerers_use_contextual_calls_in_external_mode() {
        use crate::intrinsics::lift::LiftIntrinsic;
        use crate::intrinsics::lower::LowerIntrinsic;
        for external in [false, true] {
            let mut intrinsics = BTreeSet::from([
                Intrinsic::Lower(LowerIntrinsic::LowerFlatStringAny),
                Intrinsic::Lift(LiftIntrinsic::LiftFlatStringAny),
            ]);
            let opts = TranspileOpts::default();
            let source = render_intrinsics(
                RenderIntrinsicsArgs::builder()
                    .intrinsics(&mut intrinsics)
                    .transpile_opts(&opts)
                    .external_runtime(external)
                    .build(),
            );
            let utf8_context = if external { "TEXT_ENCODER_UTF8, " } else { "" };
            let utf16_context = if external {
                "_jcoUtf16EncodingContext, "
            } else {
                ""
            };
            assert!(source.contains(&format!(
                "_utf8AllocateAndEncode({utf8_context}ctx.vals[0], ctx.realloc, ctx.memory)"
            )));
            assert!(source.contains(&format!(
                "_utf16AllocateAndEncode({utf16_context}ctx.vals[0], ctx.realloc, ctx.memory)"
            )));
            assert!(source.contains(&format!(
                "_compactUtf16AllocateAndEncode({utf16_context}ctx.vals[0], ctx.realloc, ctx.memory)"
            )));
            if external {
                assert!(!source.contains("function _liftFlatStringAny("));
                assert!(source.contains("utf8: TEXT_DECODER_UTF8, utf16: utf16Decoder"));
            } else {
                assert!(source.contains("_compactUtf16Decode(ctx.memory, ptr, len)"));
            }
        }
    }

    #[test]
    fn codec_values_and_encoding_calls_share_only_selected_state() {
        let mut intrinsics = BTreeSet::from([
            Intrinsic::String(StringIntrinsic::GlobalTextEncoderUtf8),
            Intrinsic::String(StringIntrinsic::Utf8Encode),
            Intrinsic::String(StringIntrinsic::Utf8EncodeAsync),
        ]);
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
        assert_eq!(
            source
                .matches("const TEXT_ENCODER_UTF8 = _jcoInitializeUtf8Encoder();")
                .count(),
            1
        );
        assert_eq!(
            imports
                .matches("initializeUtf8Encoder as _jcoInitializeUtf8Encoder")
                .count(),
            1
        );
        assert!(!imports.contains("initializeUtf8Encoder as TEXT_ENCODER_UTF8"));
        for unused in [
            "Utf8Decoder",
            "Utf16Decoder",
            "Utf16Encoding",
            "new Text",
            "new Map",
            "new Uint",
        ] {
            assert!(!source.contains(unused), "{unused}");
        }
        let call = ExternalRuntime.call(
            Intrinsic::String(StringIntrinsic::Utf8Encode),
            "value, realloc, memory",
        );
        assert_eq!(
            call,
            "_utf8AllocateAndEncode(TEXT_ENCODER_UTF8, value, realloc, memory)"
        );
    }

    #[test]
    fn context_free_copy_does_not_initialize_codecs_or_endianness() {
        let mut intrinsics = BTreeSet::from([
            Intrinsic::String(StringIntrinsic::Utf16ValidatingCopy),
            Intrinsic::String(StringIntrinsic::ValidateGuestChar),
            Intrinsic::String(StringIntrinsic::ValidateHostChar),
        ]);
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
        assert!(!source.contains("Initialize"));
        assert!(!source.contains("new Text"));
        assert!(!source.contains("new Uint"));
        assert!(!imports.contains("initialize"));
        assert!(imports.contains("utf16ValidatingCopy as _utf16ValidatingCopy"));
    }
}
