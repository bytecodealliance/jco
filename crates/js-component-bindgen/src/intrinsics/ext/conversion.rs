//! Named conversion exports and their narrow capability requirements.

use super::{RuntimeContext, RuntimeImport};
use crate::intrinsics::conversion::ConversionIntrinsic;

pub(crate) fn import(intrinsic: ConversionIntrinsic) -> RuntimeImport {
    let (export, context) = match intrinsic {
        ConversionIntrinsic::I32ToF32 => ("i32ToF32", Some(RuntimeContext::Bitcast32)),
        ConversionIntrinsic::F32ToI32 => ("f32ToI32", Some(RuntimeContext::Bitcast32)),
        ConversionIntrinsic::I64ToF64 => ("i64ToF64", Some(RuntimeContext::Bitcast64)),
        ConversionIntrinsic::F64ToI64 => ("f64ToI64", Some(RuntimeContext::Bitcast64)),
        ConversionIntrinsic::ToInt8 => ("toInt8", Some(RuntimeContext::StrictNumeric)),
        ConversionIntrinsic::ToUint8 => ("toUint8", Some(RuntimeContext::StrictNumeric)),
        ConversionIntrinsic::ToInt16 => ("toInt16", Some(RuntimeContext::StrictNumeric)),
        ConversionIntrinsic::ToUint16 => ("toUint16", Some(RuntimeContext::StrictNumeric)),
        ConversionIntrinsic::ToInt32 => ("toInt32", Some(RuntimeContext::StrictNumeric)),
        ConversionIntrinsic::ToUint32 => ("toUint32", Some(RuntimeContext::StrictNumeric)),
        ConversionIntrinsic::ToBigInt64 => ("toInt64", Some(RuntimeContext::StrictNumeric)),
        ConversionIntrinsic::ToBigUint64 => ("toUint64", Some(RuntimeContext::StrictNumeric)),
        ConversionIntrinsic::I32ToChar => ("i32ToChar", None),
        ConversionIntrinsic::ToString => ("toString", None),
        ConversionIntrinsic::ToResultString => ("toResultString", None),
        ConversionIntrinsic::IsValidNumericPrimitive => ("isValidNumericPrimitive", None),
        ConversionIntrinsic::RequireValidNumericPrimitive => ("requireValidNumericPrimitive", None),
        ConversionIntrinsic::MergeBigInt64 => ("mergeInt64", None),
        ConversionIntrinsic::SplitBigInt64 => ("splitInt64", None),
    };
    RuntimeImport {
        suffix: "intrinsics/conversion",
        export,
        context,
    }
}

#[cfg(all(test, feature = "external-runtime"))]
mod runtime_tests {
    use super::*;
    use crate::TranspileOpts;
    use crate::intrinsics::{
        Intrinsic, RenderIntrinsicsArgs, ext::ExternalRuntime, render_intrinsics,
        runtime::IntrinsicRuntime,
    };
    use crate::source::Source;
    use std::collections::BTreeSet;

    fn render(selected: &[ConversionIntrinsic], strict: bool, external: bool) -> (String, String) {
        let mut intrinsics: BTreeSet<_> = selected
            .iter()
            .copied()
            .map(Intrinsic::Conversion)
            .collect();
        let opts = TranspileOpts::builder()
            .name("conversion".into())
            .strict(strict)
            .build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .external_runtime(external)
                .build(),
        );
        let mut imports = Source::default();
        if external {
            ExternalRuntime.render_imports(&mut imports, &intrinsics, "runtime-package");
        }
        (source.to_string(), imports.to_string())
    }

    #[test]
    fn selected_scalar_context_does_not_allocate_unrelated_storage() {
        for strict in [false, true] {
            let (source, imports) = render(&[ConversionIntrinsic::ToUint32], strict, true);
            assert!(source.contains(&format!(
                "const _jcoStrictNumericContext = {{ strict: {strict} }};"
            )));
            assert!(imports.contains("toUint32 as toUint32"));
            for unrelated in [
                "Bitcast",
                "new Map",
                "new Int32Array",
                "new BigInt64Array",
                "TextEncoder",
                "TextDecoder",
                "function toUint32",
            ] {
                assert!(!source.contains(unrelated), "{unrelated}");
            }
            assert!(!imports.contains("initialize"));
        }
        let (source, imports) = render(&[ConversionIntrinsic::ToString], false, true);
        assert!(!source.contains("Context"));
        assert!(!imports.contains("initialize"));
    }

    #[test]
    fn selected_bitcast_family_initializes_once_and_keeps_inline_fallback() {
        for (variants, context, initialize, other) in [
            (
                [ConversionIntrinsic::I32ToF32, ConversionIntrinsic::F32ToI32],
                "_jcoBitcast32Context",
                "_jcoInitializeBitcast32",
                "Bitcast64",
            ),
            (
                [ConversionIntrinsic::I64ToF64, ConversionIntrinsic::F64ToI64],
                "_jcoBitcast64Context",
                "_jcoInitializeBitcast64",
                "Bitcast32",
            ),
        ] {
            let (source, imports) = render(&variants, false, true);
            assert_eq!(
                source
                    .matches(&format!("const {context} = {initialize}();"))
                    .count(),
                1
            );
            assert_eq!(imports.matches(&format!("as {initialize}")).count(), 1);
            assert!(!source.contains("new Int32Array"));
            assert!(!source.contains("new Float32Array"));
            assert!(!source.contains("new BigInt64Array"));
            assert!(!source.contains("new Float64Array"));
            assert!(!source.contains(other));
            assert!(!imports.contains(other));
            let (inline, _) = render(&variants, false, false);
            assert!(inline.contains("new "));
            assert!(!inline.contains("_jco"));
        }
    }

    #[test]
    fn all_nineteen_variants_have_unique_named_calls_and_narrow_contexts() {
        let variants = [
            ConversionIntrinsic::I32ToF32,
            ConversionIntrinsic::F32ToI32,
            ConversionIntrinsic::I64ToF64,
            ConversionIntrinsic::F64ToI64,
            ConversionIntrinsic::I32ToChar,
            ConversionIntrinsic::ToInt8,
            ConversionIntrinsic::ToUint8,
            ConversionIntrinsic::ToInt16,
            ConversionIntrinsic::ToUint16,
            ConversionIntrinsic::ToInt32,
            ConversionIntrinsic::ToUint32,
            ConversionIntrinsic::ToBigInt64,
            ConversionIntrinsic::ToBigUint64,
            ConversionIntrinsic::ToString,
            ConversionIntrinsic::ToResultString,
            ConversionIntrinsic::IsValidNumericPrimitive,
            ConversionIntrinsic::RequireValidNumericPrimitive,
            ConversionIntrinsic::MergeBigInt64,
            ConversionIntrinsic::SplitBigInt64,
        ];
        assert_eq!(variants.len(), 19);
        let mut exports = BTreeSet::new();
        for variant in variants {
            let import = import(variant);
            assert_eq!(import.suffix, "intrinsics/conversion");
            assert!(exports.insert(import.export));
            let intrinsic = Intrinsic::Conversion(variant);
            assert_eq!(
                crate::intrinsics::runtime::binding(&ExternalRuntime, intrinsic),
                crate::intrinsics::runtime::IntrinsicBinding::Imported {
                    local_name: variant.name(),
                }
            );
            assert_eq!(
                crate::intrinsics::runtime::binding(
                    &crate::intrinsics::inline::InlineRuntime,
                    intrinsic
                ),
                crate::intrinsics::runtime::IntrinsicBinding::Inline {
                    local_name: variant.name(),
                }
            );
            let call = ExternalRuntime.call(Intrinsic::Conversion(variant), "operand");
            match import.context {
                Some(context) => assert!(call.contains(&format!(
                    "{}({}, operand)",
                    variant.name(),
                    context.local_name()
                ))),
                None => assert_eq!(call, format!("{}(operand)", variant.name())),
            }
        }
    }
}
