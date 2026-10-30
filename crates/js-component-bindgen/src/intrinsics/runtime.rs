//! Contracts for intrinsic runtimes. A runtime decides how each intrinsic is made
//! available to generated bindings: rendered inline or imported from elsewhere.
//!
//! [`IntrinsicRuntime`] lists every intrinsic family as a [`Provides`] supertrait, so
//! a runtime that does not account for a family fails to compile.

use std::collections::BTreeSet;

use super::component::ComponentIntrinsic;
use super::conversion::ConversionIntrinsic;
use super::ext::ExternalRuntime;
use super::inline::InlineRuntime;
use super::js_helper::JsHelperIntrinsic;
use super::lift::LiftIntrinsic;
use super::lower::LowerIntrinsic;
use super::p3::async_future::AsyncFutureIntrinsic;
use super::p3::async_stream::AsyncStreamIntrinsic;
use super::p3::async_task::AsyncTaskIntrinsic;
use super::p3::error_context::ErrCtxIntrinsic;
use super::p3::host::HostIntrinsic;
use super::p3::waitable::WaitableIntrinsic;
use super::resource::ResourceIntrinsic;
use super::string::StringIntrinsic;
use super::webidl::WebIdlIntrinsic;
use super::{Intrinsic, RenderIntrinsicsArgs};
use crate::source::Source;

/// How generated code refers to an intrinsic.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum IntrinsicBinding {
    /// Rendered into the generated module.
    Inline { local_name: &'static str },
    /// Imported by the runtime; nothing is rendered for it.
    Imported { local_name: &'static str },
}

impl IntrinsicBinding {
    pub(crate) fn local_name(self) -> &'static str {
        match self {
            Self::Inline { local_name } | Self::Imported { local_name } => local_name,
        }
    }
}

/// Top-level [`Intrinsic`] variants that do not belong to a family enum.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) struct BaseIntrinsic(Intrinsic);

impl From<BaseIntrinsic> for Intrinsic {
    fn from(intrinsic: BaseIntrinsic) -> Self {
        intrinsic.0
    }
}

/// Availability of one intrinsic family `F`.
pub(crate) trait Provides<F> {
    fn binding(&self, intrinsic: F) -> IntrinsicBinding;

    /// Render `intrinsic` if this runtime generates it; dependencies are reported
    /// through [`RenderIntrinsicsArgs::require_intrinsic`].
    fn render(&self, intrinsic: F, output: &mut Source, args: &RenderIntrinsicsArgs<'_>);
}

/// A complete intrinsic runtime. The supertraits are the intrinsic families every
/// runtime must provide.
pub(crate) trait IntrinsicRuntime:
    Provides<BaseIntrinsic>
    + Provides<JsHelperIntrinsic>
    + Provides<WebIdlIntrinsic>
    + Provides<ConversionIntrinsic>
    + Provides<StringIntrinsic>
    + Provides<ResourceIntrinsic>
    + Provides<ErrCtxIntrinsic>
    + Provides<AsyncTaskIntrinsic>
    + Provides<WaitableIntrinsic>
    + Provides<LiftIntrinsic>
    + Provides<LowerIntrinsic>
    + Provides<AsyncStreamIntrinsic>
    + Provides<AsyncFutureIntrinsic>
    + Provides<ComponentIntrinsic>
    + Provides<HostIntrinsic>
{
    /// Code emitted once before any intrinsic, given the full set of intrinsics.
    fn render_prelude(&self, _intrinsics: &BTreeSet<Intrinsic>, _output: &mut Source) {}

    /// Render a call to `intrinsic`. Runtimes may add implicit leading operands.
    fn call(&self, intrinsic: Intrinsic, operands: &str) -> String {
        format!("{}({operands})", binding(self, intrinsic).local_name())
    }
}

/// Dispatches an [`Intrinsic`] to the [`Provides`] impl for its family.
macro_rules! dispatch {
    ($intrinsic:expr, |$i:ident| $call:expr) => {
        match $intrinsic {
            Intrinsic::JsHelper($i) => $call,
            Intrinsic::WebIdl($i) => $call,
            Intrinsic::Conversion($i) => $call,
            Intrinsic::String($i) => $call,
            Intrinsic::Resource($i) => $call,
            Intrinsic::ErrCtx($i) => $call,
            Intrinsic::AsyncTask($i) => $call,
            Intrinsic::Waitable($i) => $call,
            Intrinsic::Lift($i) => $call,
            Intrinsic::Lower($i) => $call,
            Intrinsic::AsyncStream($i) => $call,
            Intrinsic::AsyncFuture($i) => $call,
            Intrinsic::Component($i) => $call,
            Intrinsic::Host($i) => $call,
            base => {
                let $i = BaseIntrinsic(base);
                $call
            }
        }
    };
}

/// How `runtime` binds `intrinsic`.
pub(crate) fn binding<R: IntrinsicRuntime + ?Sized>(
    runtime: &R,
    intrinsic: Intrinsic,
) -> IntrinsicBinding {
    dispatch!(intrinsic, |i| Provides::binding(runtime, i))
}

/// Render `intrinsic` with `runtime`.
pub(crate) fn render<R: IntrinsicRuntime + ?Sized>(
    runtime: &R,
    intrinsic: Intrinsic,
    output: &mut Source,
    args: &RenderIntrinsicsArgs<'_>,
) {
    dispatch!(intrinsic, |i| Provides::render(runtime, i, output, args))
}

/// Select the runtime used for generated bindings.
pub(crate) fn select(external: bool) -> &'static dyn IntrinsicRuntime {
    if external {
        &ExternalRuntime
    } else {
        &InlineRuntime
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TranspileOpts;

    const TABLE_GET: Intrinsic = Intrinsic::Resource(ResourceIntrinsic::ResourceTableGet);
    const SAMPLES: [Intrinsic; 5] = [
        Intrinsic::Resource(ResourceIntrinsic::ResourceTableCreateBorrow),
        Intrinsic::String(StringIntrinsic::Utf8Encode),
        Intrinsic::JsHelper(JsHelperIntrinsic::DataView),
        Intrinsic::Conversion(ConversionIntrinsic::ToInt32),
        Intrinsic::HandleTables,
    ];

    fn render_with(runtime: &dyn IntrinsicRuntime, intrinsic: Intrinsic) -> String {
        let mut intrinsics = BTreeSet::new();
        let opts = TranspileOpts::builder().name("runtime".into()).build();
        let args = RenderIntrinsicsArgs::builder()
            .intrinsics(&mut intrinsics)
            .transpile_opts(&opts)
            .build();
        let mut output = Source::default();
        render(runtime, intrinsic, &mut output, &args);
        output.into()
    }

    #[test]
    fn inline_runtime_binds_every_family_inline() {
        for intrinsic in SAMPLES.into_iter().chain([TABLE_GET]) {
            assert_eq!(
                binding(&InlineRuntime, intrinsic),
                IntrinsicBinding::Inline {
                    local_name: intrinsic.name()
                }
            );
        }
        assert!(render_with(&InlineRuntime, TABLE_GET).contains("function rscTableGet("));
    }

    #[test]
    fn external_runtime_imports_only_its_exports() {
        assert_eq!(
            binding(&ExternalRuntime, TABLE_GET),
            IntrinsicBinding::Imported {
                local_name: TABLE_GET.name()
            }
        );
        assert!(render_with(&ExternalRuntime, TABLE_GET).is_empty());
        for intrinsic in SAMPLES {
            assert_eq!(
                binding(&ExternalRuntime, intrinsic),
                binding(&InlineRuntime, intrinsic)
            );
            assert_eq!(
                render_with(&ExternalRuntime, intrinsic),
                render_with(&InlineRuntime, intrinsic)
            );
        }
    }

    #[test]
    fn only_external_imports_receive_context_operands() {
        assert_eq!(
            InlineRuntime.call(TABLE_GET, "table, handle"),
            "rscTableGet(table, handle)"
        );
        assert_eq!(
            ExternalRuntime.call(TABLE_GET, "table, handle"),
            "rscTableGet(_jcoResourceTableGetContext, table, handle)"
        );
        assert_eq!(
            ExternalRuntime.call(TABLE_GET, ""),
            "rscTableGet(_jcoResourceTableGetContext)"
        );
        let borrow = SAMPLES[0];
        assert_eq!(
            ExternalRuntime.call(borrow, "a"),
            InlineRuntime.call(borrow, "a")
        );
    }

    #[test]
    fn prelude_is_emitted_only_when_something_is_imported() {
        let mut output = Source::default();
        InlineRuntime.render_prelude(&BTreeSet::from([TABLE_GET]), &mut output);
        ExternalRuntime.render_prelude(&BTreeSet::from(SAMPLES), &mut output);
        assert!(output.is_empty());

        ExternalRuntime.render_prelude(&BTreeSet::from([TABLE_GET, SAMPLES[0]]), &mut output);
        let prelude: String = output.into();
        assert_eq!(prelude.matches("_jcoRuntimeApiVersion !== 1").count(), 1);
        assert_eq!(
            prelude.matches("const _jcoResourceTableGetContext").count(),
            1
        );
    }

    #[test]
    fn selection_matches_the_external_flag() {
        assert_eq!(
            binding(select(false), TABLE_GET),
            binding(&InlineRuntime, TABLE_GET)
        );
        assert_eq!(
            binding(select(true), TABLE_GET),
            binding(&ExternalRuntime, TABLE_GET)
        );
    }
}
