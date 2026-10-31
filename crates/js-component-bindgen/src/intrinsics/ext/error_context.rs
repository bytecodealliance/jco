//! Named error-context operations and their actual per-store owners.
use super::{
    ComponentContextIntrinsic, CoreContextIntrinsic, RuntimeContextIntrinsic, RuntimeImport,
    RuntimeImportKind, RuntimeInitializer,
};
use crate::{
    intrinsics::{RenderIntrinsicsArgs, p3::error_context::ErrCtxIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;

/// State initializers and capability contexts for external error-context intrinsics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum ErrCtxContextIntrinsic {
    /// The `initializeGlobalErrorContextTableClass` constructor factory;
    /// a JS helper, not a canonical operation.
    InitializeGlobalErrorContextTableClass,
    /// The table registrations returned by `initializeErrorContextTableRegistrations`;
    /// a JS helper, not a canonical operation.
    InitializeErrorContextTableRegistrations,
    /// The component-local tables returned by `initializeLocalErrorContextTables`;
    /// a JS helper, not a canonical operation.
    InitializeLocalErrorContextTables,
    /// Capabilities for the `errCtxGetLocalTable` JS helper; not a canonical operation.
    GetLocalTable,
    /// Capabilities for the `errCtxCreateLocalHandle` JS helper; not a canonical operation.
    CreateLocalHandle,
    /// Capabilities for `errCtxDebugMessage`, implementing `canon error-context.debug-message`.
    ErrorContextDebugMessage,
    /// Capabilities for `errCtxDrop`, implementing `canon error-context.drop`.
    ErrorContextDrop,
    /// Capabilities for `errCtxNew`, implementing `canon error-context.new`.
    ErrorContextNew,
    /// Capabilities for the `errCtxTransfer` JS helper for transfers between components;
    /// not a canonical operation.
    ErrorContextTransfer,
}
impl ErrCtxContextIntrinsic {
    const ALL: [Self; 9] = [
        Self::InitializeGlobalErrorContextTableClass,
        Self::InitializeErrorContextTableRegistrations,
        Self::InitializeLocalErrorContextTables,
        Self::GetLocalTable,
        Self::CreateLocalHandle,
        Self::ErrorContextDebugMessage,
        Self::ErrorContextDrop,
        Self::ErrorContextNew,
        Self::ErrorContextTransfer,
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
            Self::InitializeGlobalErrorContextTableClass => "GlobalErrorContextTable",
            Self::InitializeErrorContextTableRegistrations => "ERR_CTX_TABLES",
            Self::InitializeLocalErrorContextTables => "errCtxLocal",
            Self::GetLocalTable => "_jcoErrorContextLocalTableContext",
            Self::CreateLocalHandle => "_jcoErrorContextHandleContext",
            Self::ErrorContextDebugMessage => "_jcoErrorContextDebugContext",
            Self::ErrorContextDrop => "_jcoErrorContextDropContext",
            Self::ErrorContextNew => "_jcoErrorContextNewContext",
            Self::ErrorContextTransfer => "_jcoErrorContextTransferContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::InitializeGlobalErrorContextTableClass => (
                "initializeGlobalErrorContextTableClass",
                "_jcoInitializeGlobalErrorContextTableClass",
            ),
            Self::InitializeErrorContextTableRegistrations => (
                "initializeErrorContextTableRegistrations",
                "_jcoInitializeErrorContextTableRegistrations",
            ),
            Self::InitializeLocalErrorContextTables => (
                "initializeLocalErrorContextTables",
                "_jcoInitializeLocalErrorContextTables",
            ),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/error-context",
            export,
            local_name,
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContextIntrinsic] {
        use RuntimeContextIntrinsic::{Component, Core, ErrCtx};
        match self {
            Self::InitializeGlobalErrorContextTableClass => {
                &[Core(CoreContextIntrinsic::InitializeRepTableClass)]
            }
            Self::GetLocalTable => &[
                ErrCtx(Self::InitializeLocalErrorContextTables),
                Core(CoreContextIntrinsic::InitializeRepTableClass),
            ],
            Self::CreateLocalHandle => &[
                ErrCtx(Self::InitializeGlobalErrorContextTableClass),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::ErrorContextNew | Self::ErrorContextDrop => {
                &[ErrCtx(Self::CreateLocalHandle), ErrCtx(Self::GetLocalTable)]
            }
            Self::ErrorContextDebugMessage => &[ErrCtx(Self::CreateLocalHandle)],
            Self::ErrorContextTransfer => &[
                ErrCtx(Self::ErrorContextNew),
                ErrCtx(Self::InitializeErrorContextTableRegistrations),
            ],
            _ => &[],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(initializer) = self.initializer() {
            let initialize = initializer.local_name;
            let arguments = if self == Self::InitializeGlobalErrorContextTableClass {
                "RepTable"
            } else {
                ""
            };
            uwriteln!(output, "const {local} = {initialize}({arguments});");
            return;
        }
        let properties = match self {
            Self::GetLocalTable => "localTables: errCtxLocal, RepTable",
            Self::CreateLocalHandle => {
                "globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext"
            }
            Self::ErrorContextDebugMessage => {
                "RuntimeError: WebAssembly.RuntimeError, globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext"
            }
            Self::ErrorContextDrop => {
                "RuntimeError: WebAssembly.RuntimeError, globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext, local: _jcoErrorContextLocalTableContext"
            }
            Self::ErrorContextNew => {
                "globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext, local: _jcoErrorContextLocalTableContext"
            }
            Self::ErrorContextTransfer => {
                "globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext, local: _jcoErrorContextLocalTableContext, tables: ERR_CTX_TABLES"
            }
            _ => unreachable!("state initializers handled above"),
        };
        uwriteln!(output, "const {local} = {{ {properties} }};");
    }
}

pub(crate) fn import(intrinsic: ErrCtxIntrinsic) -> RuntimeImport {
    use ErrCtxIntrinsic::*;

    let (export, context, kind) = match intrinsic {
        ComponentGlobalTable => (
            "initializeGlobalErrorContextTableClass",
            ErrCtxContextIntrinsic::InitializeGlobalErrorContextTableClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        GlobalErrCtxTableMap => (
            "initializeErrorContextTableRegistrations",
            ErrCtxContextIntrinsic::InitializeErrorContextTableRegistrations,
            RuntimeImportKind::InitializedValue,
        ),
        ComponentLocalTable => (
            "initializeLocalErrorContextTables",
            ErrCtxContextIntrinsic::InitializeLocalErrorContextTables,
            RuntimeImportKind::InitializedValue,
        ),
        ErrorContextNew => (
            "errCtxNew",
            ErrCtxContextIntrinsic::ErrorContextNew,
            RuntimeImportKind::Call,
        ),
        ErrorContextDrop => (
            "errCtxDrop",
            ErrCtxContextIntrinsic::ErrorContextDrop,
            RuntimeImportKind::Call,
        ),
        ErrorContextTransfer => (
            "errCtxTransfer",
            ErrCtxContextIntrinsic::ErrorContextTransfer,
            RuntimeImportKind::Call,
        ),
        ErrorContextDebugMessage => (
            "errCtxDebugMessage",
            ErrCtxContextIntrinsic::ErrorContextDebugMessage,
            RuntimeImportKind::Call,
        ),
        GetLocalTable => (
            "errCtxGetLocalTable",
            ErrCtxContextIntrinsic::GetLocalTable,
            RuntimeImportKind::Call,
        ),
        GlobalRefCountAdd => (
            "errCtxGlobalRefCountAdd",
            ErrCtxContextIntrinsic::InitializeGlobalErrorContextTableClass,
            RuntimeImportKind::Call,
        ),
        CreateLocalHandle => (
            "errCtxCreateLocalHandle",
            ErrCtxContextIntrinsic::CreateLocalHandle,
            RuntimeImportKind::Call,
        ),
        ReserveGlobalRep => (
            "errCtxReserveGlobalRep",
            ErrCtxContextIntrinsic::InitializeGlobalErrorContextTableClass,
            RuntimeImportKind::Call,
        ),
    };
    RuntimeImport {
        suffix: "intrinsics/error-context",
        export,
        context: Some(RuntimeContextIntrinsic::ErrCtx(context)),
        kind,
    }
}

#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::{
        TranspileOpts,
        intrinsics::{
            Intrinsic,
            lift::LiftIntrinsic,
            lower::LowerIntrinsic,
            render_intrinsics,
            runtime::{self, IntrinsicBinding},
        },
    };

    fn generated(selected: impl IntoIterator<Item = Intrinsic>) -> String {
        let mut intrinsics = selected.into_iter().collect();
        let opts = TranspileOpts::builder()
            .name("error-context".into())
            .build();
        render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .external_runtime(true)
                .build(),
        )
        .to_string()
    }

    #[test]
    fn error_context_variants_use_typed_named_exports_and_deduplicated_owners() {
        use ErrCtxIntrinsic::*;
        let variants = [
            ComponentGlobalTable,
            GlobalErrCtxTableMap,
            ComponentLocalTable,
            ErrorContextNew,
            ErrorContextDrop,
            ErrorContextTransfer,
            ErrorContextDebugMessage,
            GetLocalTable,
            GlobalRefCountAdd,
            CreateLocalHandle,
            ReserveGlobalRep,
        ];
        let source = generated(variants.map(Intrinsic::ErrCtx));
        for variant in variants {
            let intrinsic = Intrinsic::ErrCtx(variant);
            let Some(import) = super::super::ExternalRuntime::import(intrinsic) else {
                panic!("missing named export");
            };
            assert_eq!(import.suffix, "intrinsics/error-context");
            assert_eq!(import, super::import(variant));
            assert!(matches!(
                runtime::binding(runtime::select(false), intrinsic),
                IntrinsicBinding::Inline { .. }
            ));
        }
        for once in [
            "const GlobalErrorContextTable = _jcoInitializeGlobalErrorContextTableClass(RepTable);",
            "const ERR_CTX_TABLES = _jcoInitializeErrorContextTableRegistrations();",
            "const errCtxLocal = _jcoInitializeLocalErrorContextTables();",
        ] {
            assert_eq!(source.matches(once).count(), 1, "{once}");
        }
        for omitted in [
            "class GlobalErrorContextTable",
            "function errCtxNew(",
            "function errCtxGetLocalTable(",
            "class RepTable",
            "function getCurrentTask(",
        ] {
            assert!(!source.contains(omitted), "{omitted}");
        }
        // This replaces the former inline error-context body assertion in the
        // component suite: selected named helpers now consume the shared view.
        assert!(source.contains(
            "globalTable: GlobalErrorContextTable, lookup: _jcoComponentStateLookupContext"
        ));
        assert_eq!(
            runtime::select(true).call(
                Intrinsic::ErrCtx(ErrorContextDebugMessage),
                "options, handle, ptr"
            ),
            "errCtxDebugMessage(_jcoErrorContextDebugContext, options, handle, ptr)"
        );
    }

    #[test]
    fn global_reservation_does_not_select_component_or_local_state() {
        let source = generated([Intrinsic::ErrCtx(ErrCtxIntrinsic::ReserveGlobalRep)]);
        assert!(source.contains("_jcoInitializeGlobalErrorContextTableClass(RepTable)"));
        for unrelated in [
            "ASYNC_STATE",
            "errCtxLocal",
            "ERR_CTX_TABLES",
            "Waitable",
            "CURRENT_TASK_META",
        ] {
            assert!(!source.contains(unrelated), "{unrelated}");
        }
        let source = generated([
            Intrinsic::ErrCtx(ErrCtxIntrinsic::ComponentLocalTable),
            Intrinsic::ErrCtx(ErrCtxIntrinsic::GlobalErrCtxTableMap),
        ]);
        assert!(!source.contains("RepTable"));
        assert!(!source.contains("ComponentAsyncState"));
    }

    #[test]
    fn lift_and_lower_shorthand_calls_receive_actual_error_context_owners() {
        let lift = Intrinsic::Lift(LiftIntrinsic::LiftFlatErrorContext);
        let source = generated([lift]);
        assert!(!source.contains("function _liftFlatErrorContext("));
        assert!(source.contains("local: _jcoErrorContextLocalTableContext"));
        assert!(source.contains("globalTable: GlobalErrorContextTable"));
        assert_eq!(
            runtime::select(true).bind_callback(lift, "2"),
            "_liftFlatErrorContext.bind(null, _jcoErrorContextNewContext, 2)"
        );
        for intrinsic in [Intrinsic::Lower(LowerIntrinsic::LowerFlatErrorContext)] {
            let source = generated([intrinsic]);
            assert!(source.contains("errCtxGetLocalTable(_jcoErrorContextLocalTableContext, "));
            assert!(source.contains("errCtxGlobalRefCountAdd(GlobalErrorContextTable, "));
            assert!(!source.contains("errCtxGetLocalTable(componentIdx"));
            assert!(!source.contains("errCtxGetLocalTable(ctx.componentIdx"));
            assert!(!source.contains("errCtxGlobalRefCountAdd(errCtx"));
        }
        let source = generated([Intrinsic::Lower(LowerIntrinsic::LowerFlatErrorContext)]);
        assert!(source.contains("errCtxCreateLocalHandle(_jcoErrorContextHandleContext, "));
        assert!(source.contains("GlobalErrorContextTable.get()"));
    }

    #[test]
    fn callback_references_preserve_identity_inline_and_undefined_receiver_named() {
        let transfer = Intrinsic::ErrCtx(ErrCtxIntrinsic::ErrorContextTransfer);
        assert_eq!(
            runtime::select(false).callback_reference(transfer),
            "errCtxTransfer"
        );
        assert_eq!(
            runtime::select(true).callback_reference(transfer),
            "errCtxTransfer.bind(void 0, _jcoErrorContextTransferContext)"
        );
        let new = Intrinsic::ErrCtx(ErrCtxIntrinsic::ErrorContextNew);
        assert_eq!(
            runtime::select(false).bind_callback(new, "metadata"),
            "errCtxNew.bind(null, metadata)"
        );
        assert_eq!(
            runtime::select(true).bind_callback(new, "metadata"),
            "errCtxNew.bind(null, _jcoErrorContextNewContext, metadata)"
        );
    }
}
