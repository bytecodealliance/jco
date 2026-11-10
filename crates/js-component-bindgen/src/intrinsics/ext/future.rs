//! Future operations use actual per-store tables and selected constructor identities.
use super::{
    ComponentContextIntrinsic, CoreContextIntrinsic, RuntimeContextIntrinsic, RuntimeImport,
    RuntimeImportKind, RuntimeInitializer, TaskContextIntrinsic,
};
use crate::{
    intrinsics::{RenderIntrinsicsArgs, p3::async_future::AsyncFutureIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;

/// State initializers and capability contexts for external future intrinsics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum FutureContextIntrinsic {
    /// State returned by `initializeFutures`.
    InitializeFutures,
    /// State returned by `initializeFutureTables`.
    InitializeFutureTables,
    /// State returned by `initializeNestedFutureSymbol`.
    InitializeNestedFutureSymbol,
    /// The per-store awaitable constructor returned by `initializeFutureValueClass`.
    InitializeFutureValueClass,
    /// The base endpoint constructor returned by `initializeFutureEndClass`.
    InitializeFutureEndClass,
    /// State returned by `initializeFutureReadableEndClass`.
    InitializeFutureReadableEndClass,
    /// State returned by `initializeFutureWritableEndClass`.
    InitializeFutureWritableEndClass,
    /// State returned by `initializeInternalFutureClass`.
    InitializeInternalFutureClass,
    /// State returned by `initializeHostFutureClass`.
    InitializeHostFutureClass,
    /// Capabilities for `createFuture`.
    CreateFuture,
    /// Shared table capabilities for `addFutureEndToTable` and `removeFutureEndFromTable`.
    AddFutureEndToTable,
    /// Shared lookup capabilities for `getFutureEnd` and `futureTransfer`.
    GetFutureEnd,
    /// Capabilities for `futureNew`.
    FutureNew,
    /// Capabilities for `futureNewFromLift`.
    FutureNewFromLift,
    /// Shared capabilities for `futureRead` and `futureCancelRead`.
    FutureRead,
    /// Shared capabilities for `futureWrite` and `futureCancelWrite`.
    FutureWrite,
    /// Capabilities for `futureDropReadable`.
    FutureDropReadable,
    /// Capabilities for `futureDropWritable`.
    FutureDropWritable,
    /// Capabilities for `genFutureHostInjectFn`.
    GenFutureHostInjectFn,
}
impl FutureContextIntrinsic {
    const ALL: [Self; 19] = [
        Self::InitializeFutures,
        Self::InitializeFutureTables,
        Self::InitializeNestedFutureSymbol,
        Self::InitializeFutureValueClass,
        Self::InitializeFutureEndClass,
        Self::InitializeFutureReadableEndClass,
        Self::InitializeFutureWritableEndClass,
        Self::InitializeInternalFutureClass,
        Self::InitializeHostFutureClass,
        Self::CreateFuture,
        Self::AddFutureEndToTable,
        Self::GetFutureEnd,
        Self::FutureNew,
        Self::FutureNewFromLift,
        Self::FutureRead,
        Self::FutureWrite,
        Self::FutureDropReadable,
        Self::FutureDropWritable,
        Self::GenFutureHostInjectFn,
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
            Self::InitializeFutures => "FUTURES",
            Self::InitializeFutureTables => "FUTURE_TABLES",
            Self::InitializeNestedFutureSymbol => "NESTED_FUTURE_SYMBOL",
            Self::InitializeFutureValueClass => "FutureValue",
            Self::InitializeFutureEndClass => "FutureEnd",
            Self::InitializeFutureReadableEndClass => "FutureReadableEnd",
            Self::InitializeFutureWritableEndClass => "FutureWritableEnd",
            Self::InitializeInternalFutureClass => "InternalFuture",
            Self::InitializeHostFutureClass => "HostFuture",
            Self::CreateFuture => "_jcoFutureCreateContext",
            Self::AddFutureEndToTable => "_jcoFutureTableContext",
            Self::GetFutureEnd => "_jcoFutureEndLookupContext",
            Self::FutureNew => "_jcoFutureNewContext",
            Self::FutureNewFromLift => "_jcoFutureFromLiftContext",
            Self::FutureRead => "_jcoFutureReadContext",
            Self::FutureWrite => "_jcoFutureWriteContext",
            Self::FutureDropReadable => "_jcoFutureDropReadContext",
            Self::FutureDropWritable => "_jcoFutureDropWriteContext",
            Self::GenFutureHostInjectFn => "_jcoFutureHostInjectContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::InitializeFutures => ("initializeFutures", "_jcoInitializeFutures"),
            Self::InitializeFutureTables => {
                ("initializeFutureTables", "_jcoInitializeFutureTables")
            }
            Self::InitializeNestedFutureSymbol => (
                "initializeNestedFutureSymbol",
                "_jcoInitializeNestedFutureSymbol",
            ),
            Self::InitializeFutureValueClass => (
                "initializeFutureValueClass",
                "_jcoInitializeFutureValueClass",
            ),
            Self::InitializeFutureEndClass => {
                ("initializeFutureEndClass", "_jcoInitializeFutureEndClass")
            }
            Self::InitializeFutureReadableEndClass => (
                "initializeFutureReadableEndClass",
                "_jcoInitializeFutureReadableEndClass",
            ),
            Self::InitializeFutureWritableEndClass => (
                "initializeFutureWritableEndClass",
                "_jcoInitializeFutureWritableEndClass",
            ),
            Self::InitializeInternalFutureClass => (
                "initializeInternalFutureClass",
                "_jcoInitializeInternalFutureClass",
            ),
            Self::InitializeHostFutureClass => {
                ("initializeHostFutureClass", "_jcoInitializeHostFutureClass")
            }
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/future",
            export,
            local_name,
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContextIntrinsic] {
        use RuntimeContextIntrinsic::{Component, Core, Future, Task};
        match self {
            Self::InitializeFutures => &[Core(CoreContextIntrinsic::InitializeRepTableClass)],
            Self::InitializeFutureTables => &[],
            Self::InitializeNestedFutureSymbol => &[],
            Self::InitializeFutureValueClass => {
                &[Core(CoreContextIntrinsic::InitializeSymbolDispose)]
            }
            Self::InitializeFutureEndClass => {
                &[Core(CoreContextIntrinsic::InitializeAsyncEventCodes)]
            }
            Self::InitializeFutureReadableEndClass => &[
                Component(ComponentContextIntrinsic::InitializeStoreTrap),
                Future(Self::InitializeFutureEndClass),
                Future(Self::InitializeFutureValueClass),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Core(CoreContextIntrinsic::InitializeBufferManager),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::InitializeFutureWritableEndClass => &[
                Future(Self::InitializeFutureEndClass),
                Future(Self::InitializeFutureValueClass),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Core(CoreContextIntrinsic::InitializeBufferManager),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
            ],
            Self::InitializeInternalFutureClass => &[
                Future(Self::InitializeFutureReadableEndClass),
                Future(Self::InitializeFutureWritableEndClass),
            ],
            Self::InitializeHostFutureClass => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Future(Self::GetFutureEnd),
            ],
            Self::CreateFuture => &[
                Future(Self::InitializeInternalFutureClass),
                Future(Self::InitializeFutures),
                Future(Self::InitializeFutureTables),
            ],
            Self::AddFutureEndToTable => &[
                Future(Self::InitializeFutureTables),
                Future(Self::InitializeFutureEndClass),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::GetFutureEnd => &[
                Future(Self::InitializeFutureEndClass),
                Future(Self::InitializeFutureTables),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::FutureNew => &[
                Task(TaskContextIntrinsic::GetCurrentTask),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Future(Self::CreateFuture),
            ],
            Self::FutureNewFromLift => &[
                Future(Self::InitializeHostFutureClass),
                Future(Self::InitializeFutures),
            ],
            Self::FutureRead => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Task(TaskContextIntrinsic::GetCurrentTask),
                Future(Self::GetFutureEnd),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Future(Self::InitializeFutureEndClass),
                Future(Self::InitializeFutureReadableEndClass),
            ],
            Self::FutureWrite => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Task(TaskContextIntrinsic::GetCurrentTask),
                Future(Self::GetFutureEnd),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Future(Self::InitializeFutureEndClass),
                Future(Self::InitializeFutureWritableEndClass),
            ],
            Self::FutureDropReadable => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Future(Self::AddFutureEndToTable),
                Future(Self::InitializeFutureReadableEndClass),
            ],
            Self::FutureDropWritable => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Future(Self::AddFutureEndToTable),
                Future(Self::InitializeFutureWritableEndClass),
            ],
            Self::GenFutureHostInjectFn => &[
                Future(Self::InitializeNestedFutureSymbol),
                Core(CoreContextIntrinsic::InitializeHasOwnProperty),
                Core(CoreContextIntrinsic::InitializeSymbolDispose),
                Component(ComponentContextIntrinsic::TrackHostOperation),
            ],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(init) = self.initializer() {
            let initialize = init.local_name;
            let arguments = match self {
                Self::InitializeFutures => "RepTable",
                Self::InitializeFutureTables => "",
                Self::InitializeNestedFutureSymbol => "",
                Self::InitializeFutureValueClass => "symbolDispose",
                Self::InitializeFutureEndClass => "ASYNC_EVENT_CODE",
                Self::InitializeFutureReadableEndClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, FutureEnd, FutureValue, buffers: BUFFER_MGR, events: ASYNC_EVENT_CODE, lookup: _jcoComponentStateLookupContext, storeTrap: STORE_TRAP }"
                }
                Self::InitializeFutureWritableEndClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, FutureEnd, FutureValue, buffers: BUFFER_MGR, events: ASYNC_EVENT_CODE }"
                }
                Self::InitializeInternalFutureClass => "{ FutureReadableEnd, FutureWritableEnd }",
                Self::InitializeHostFutureClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoFutureEndLookupContext }"
                }
                _ => unreachable!(),
            };
            uwriteln!(output, "const {local} = {initialize}({arguments});");
            return;
        }
        let properties = match self {
            Self::CreateFuture => "InternalFuture, futures: FUTURES, tables: FUTURE_TABLES",
            Self::AddFutureEndToTable => {
                "FutureEnd, RuntimeError: WebAssemblyRuntimeError, tables: FUTURE_TABLES, lookup: _jcoComponentStateLookupContext"
            }
            Self::GetFutureEnd => {
                "FutureEnd, RuntimeError: WebAssemblyRuntimeError, tables: FUTURE_TABLES, lookup: _jcoComponentStateLookupContext"
            }
            Self::FutureNew => {
                "taskLookup: _jcoTaskLookupContext, lookup: _jcoComponentStateLookupContext, creation: _jcoFutureCreateContext"
            }
            Self::FutureNewFromLift => "HostFuture, futures: FUTURES",
            Self::FutureRead => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, taskLookup: _jcoTaskLookupContext, ends: _jcoFutureEndLookupContext, events: ASYNC_EVENT_CODE, Base: FutureEnd, FutureEnd: FutureReadableEnd"
            }
            Self::FutureWrite => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, taskLookup: _jcoTaskLookupContext, ends: _jcoFutureEndLookupContext, events: ASYNC_EVENT_CODE, Base: FutureEnd, FutureEnd: FutureWritableEnd"
            }
            Self::FutureDropReadable => {
                "RuntimeError: WebAssemblyRuntimeError, tables: _jcoFutureTableContext, FutureEnd: FutureReadableEnd"
            }
            Self::FutureDropWritable => {
                "RuntimeError: WebAssemblyRuntimeError, tables: _jcoFutureTableContext, FutureEnd: FutureWritableEnd"
            }
            Self::GenFutureHostInjectFn => {
                "nestedSymbol: NESTED_FUTURE_SYMBOL, hasOwnProperty, disposeSymbol: symbolDispose, tracking: _jcoComponentHostOperationContext"
            }
            _ => unreachable!(),
        };
        uwriteln!(output, "const {local} = {{ {properties} }};");
    }
}
pub(crate) fn import(intrinsic: AsyncFutureIntrinsic) -> RuntimeImport {
    use AsyncFutureIntrinsic::*;
    let (export, context, kind) = match intrinsic {
        GlobalFutureMap => (
            "initializeFutures",
            Some(FutureContextIntrinsic::InitializeFutures),
            RuntimeImportKind::InitializedValue,
        ),
        GlobalFutureTableMap => (
            "initializeFutureTables",
            Some(FutureContextIntrinsic::InitializeFutureTables),
            RuntimeImportKind::InitializedValue,
        ),
        NestedFutureSymbol => (
            "initializeNestedFutureSymbol",
            Some(FutureContextIntrinsic::InitializeNestedFutureSymbol),
            RuntimeImportKind::InitializedValue,
        ),
        FutureValueClass => (
            "initializeFutureValueClass",
            Some(FutureContextIntrinsic::InitializeFutureValueClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        FutureEndClass => (
            "initializeFutureEndClass",
            Some(FutureContextIntrinsic::InitializeFutureEndClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        FutureReadableEndClass => (
            "initializeFutureReadableEndClass",
            Some(FutureContextIntrinsic::InitializeFutureReadableEndClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        FutureWritableEndClass => (
            "initializeFutureWritableEndClass",
            Some(FutureContextIntrinsic::InitializeFutureWritableEndClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        InternalFutureClass => (
            "initializeInternalFutureClass",
            Some(FutureContextIntrinsic::InitializeInternalFutureClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        HostFutureClass => (
            "initializeHostFutureClass",
            Some(FutureContextIntrinsic::InitializeHostFutureClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        CreateFuture => (
            "createFuture",
            Some(FutureContextIntrinsic::CreateFuture),
            RuntimeImportKind::Call,
        ),
        GetFutureEnd => (
            "getFutureEnd",
            Some(FutureContextIntrinsic::GetFutureEnd),
            RuntimeImportKind::Call,
        ),
        AddFutureEndToTable => (
            "addFutureEndToTable",
            Some(FutureContextIntrinsic::AddFutureEndToTable),
            RuntimeImportKind::Call,
        ),
        RemoveFutureEndFromTable => (
            "removeFutureEndFromTable",
            Some(FutureContextIntrinsic::AddFutureEndToTable),
            RuntimeImportKind::Call,
        ),
        FutureNew => (
            "futureNew",
            Some(FutureContextIntrinsic::FutureNew),
            RuntimeImportKind::Call,
        ),
        FutureNewFromLift => (
            "futureNewFromLift",
            Some(FutureContextIntrinsic::FutureNewFromLift),
            RuntimeImportKind::Call,
        ),
        FutureRead => (
            "futureRead",
            Some(FutureContextIntrinsic::FutureRead),
            RuntimeImportKind::Call,
        ),
        FutureWrite => (
            "futureWrite",
            Some(FutureContextIntrinsic::FutureWrite),
            RuntimeImportKind::Call,
        ),
        FutureCancelRead => (
            "futureCancelRead",
            Some(FutureContextIntrinsic::FutureRead),
            RuntimeImportKind::Call,
        ),
        FutureCancelWrite => (
            "futureCancelWrite",
            Some(FutureContextIntrinsic::FutureWrite),
            RuntimeImportKind::Call,
        ),
        FutureDropReadable => (
            "futureDropReadable",
            Some(FutureContextIntrinsic::FutureDropReadable),
            RuntimeImportKind::Call,
        ),
        FutureDropWritable => (
            "futureDropWritable",
            Some(FutureContextIntrinsic::FutureDropWritable),
            RuntimeImportKind::Call,
        ),
        FutureTransfer => (
            "futureTransfer",
            Some(FutureContextIntrinsic::GetFutureEnd),
            RuntimeImportKind::Call,
        ),
        GenFutureHostInjectFn => (
            "genFutureHostInjectFn",
            Some(FutureContextIntrinsic::GenFutureHostInjectFn),
            RuntimeImportKind::Call,
        ),
        IsFutureLowerableObject => ("isFutureLowerableObject", None, RuntimeImportKind::Call),
    };
    RuntimeImport {
        suffix: "intrinsics/future",
        export,
        context: context.map(RuntimeContextIntrinsic::Future),
        kind,
    }
}

#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::{
        TranspileOpts,
        intrinsics::{
            Intrinsic, RenderIntrinsicsArgs, lift::LiftIntrinsic, lower::LowerIntrinsic,
            p3::async_task::AsyncTaskIntrinsic, render_intrinsics, runtime,
        },
    };
    use std::collections::BTreeSet;
    fn generated(selected: impl IntoIterator<Item = Intrinsic>) -> (String, BTreeSet<Intrinsic>) {
        let mut intrinsics = selected.into_iter().collect();
        let opts = TranspileOpts::builder().name("future".into()).build();
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
    fn task_lift_and_lower_share_named_future_owners_without_inline_bridges() {
        let (source, _) = generated([
            Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass),
            Intrinsic::Lift(LiftIntrinsic::LiftFlatFuture),
            Intrinsic::Lower(LowerIntrinsic::LowerFlatFuture),
        ]);
        assert_eq!(
            source
                .matches("const FutureValue = _jcoInitializeFutureValueClass(symbolDispose);")
                .count(),
            1
        );
        assert_eq!(
            source
                .matches("const FUTURE_TABLES = _jcoInitializeFutureTables();")
                .count(),
            1
        );
        assert_eq!(
            source
                .matches("const FUTURES = _jcoInitializeFutures(RepTable);")
                .count(),
            1
        );
        assert!(source.contains("futures: FUTURES, creation: _jcoFutureCreateContext, injection: _jcoFutureHostInjectContext"));
        assert!(source.contains("const _jcoLiftFutureContext = _jcoFutureEndLookupContext;"));
        for absent in [
            "class FutureValue",
            "class FutureEnd",
            "class FutureReadableEnd",
            "value => value instanceof FutureValue",
            "getTables: () => FUTURE_TABLES",
            "getGlobal: () => FUTURES",
        ] {
            assert!(!source.contains(absent), "{absent}");
        }
    }
    #[test]
    fn pure_predicate_and_callback_bindings_preserve_selection_and_receiver_rules() {
        let predicate = Intrinsic::AsyncFuture(AsyncFutureIntrinsic::IsFutureLowerableObject);
        let (source, intrinsics) = generated([predicate]);
        assert_eq!(intrinsics.len(), 1);
        assert!(!source.contains("const Future"));
        assert!(!source.contains("FUTURE_TABLES"));
        let read = Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureRead);
        assert_eq!(
            runtime::select(true).bind_callback(read, "meta"),
            "futureRead.bind(null, _jcoFutureReadContext, meta)"
        );
        assert_eq!(
            runtime::select(false).bind_callback(read, "meta"),
            "futureRead.bind(null, meta)"
        );
        assert_eq!(
            runtime::select(true).bind_callback_prefix(read, true),
            "futureRead.bind(null, _jcoFutureReadContext, "
        );
        let transfer = Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureTransfer);
        assert_eq!(
            runtime::select(true).callback_reference(transfer),
            "futureTransfer.bind(void 0, _jcoFutureEndLookupContext)"
        );
        let (_, tasks) = generated([Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass)]);
        assert!(!super::super::uses_context(
            &tasks,
            RuntimeContextIntrinsic::Future(FutureContextIntrinsic::InitializeHostFutureClass)
        ));
        let (_, lift) = generated([Intrinsic::AsyncFuture(
            AsyncFutureIntrinsic::FutureNewFromLift,
        )]);
        assert!(super::super::uses_context(
            &lift,
            RuntimeContextIntrinsic::Future(FutureContextIntrinsic::InitializeHostFutureClass)
        ));
    }
}
