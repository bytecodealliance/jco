//! Future operations use actual per-store tables and selected constructor identities.
use super::{
    ComponentContext, CoreContext, RuntimeContext, RuntimeImport, RuntimeImportKind,
    RuntimeInitializer, TaskContext,
};
use crate::{
    intrinsics::{RenderIntrinsicsArgs, p3::async_future::AsyncFutureIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum FutureContext {
    Futures,
    Tables,
    NestedSymbol,
    ValueClass,
    EndClass,
    ReadableClass,
    WritableClass,
    InternalClass,
    HostClass,
    Creation,
    Table,
    Lookup,
    New,
    FromLift,
    Read,
    Write,
    DropRead,
    DropWrite,
    Inject,
}
impl FutureContext {
    const ALL: &'static [Self] = &[
        Self::Futures,
        Self::Tables,
        Self::NestedSymbol,
        Self::ValueClass,
        Self::EndClass,
        Self::ReadableClass,
        Self::WritableClass,
        Self::InternalClass,
        Self::HostClass,
        Self::Creation,
        Self::Table,
        Self::Lookup,
        Self::New,
        Self::FromLift,
        Self::Read,
        Self::Write,
        Self::DropRead,
        Self::DropWrite,
        Self::Inject,
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
            Self::Futures => "FUTURES",
            Self::Tables => "FUTURE_TABLES",
            Self::NestedSymbol => "NESTED_FUTURE_SYMBOL",
            Self::ValueClass => "FutureValue",
            Self::EndClass => "FutureEnd",
            Self::ReadableClass => "FutureReadableEnd",
            Self::WritableClass => "FutureWritableEnd",
            Self::InternalClass => "InternalFuture",
            Self::HostClass => "HostFuture",
            Self::Creation => "_jcoFutureCreateContext",
            Self::Table => "_jcoFutureTableContext",
            Self::Lookup => "_jcoFutureEndLookupContext",
            Self::New => "_jcoFutureNewContext",
            Self::FromLift => "_jcoFutureFromLiftContext",
            Self::Read => "_jcoFutureReadContext",
            Self::Write => "_jcoFutureWriteContext",
            Self::DropRead => "_jcoFutureDropReadContext",
            Self::DropWrite => "_jcoFutureDropWriteContext",
            Self::Inject => "_jcoFutureHostInjectContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::Futures => ("initializeFutures", "_jcoInitializeFutures"),
            Self::Tables => ("initializeFutureTables", "_jcoInitializeFutureTables"),
            Self::NestedSymbol => (
                "initializeNestedFutureSymbol",
                "_jcoInitializeNestedFutureSymbol",
            ),
            Self::ValueClass => (
                "initializeFutureValueClass",
                "_jcoInitializeFutureValueClass",
            ),
            Self::EndClass => ("initializeFutureEndClass", "_jcoInitializeFutureEndClass"),
            Self::ReadableClass => (
                "initializeFutureReadableEndClass",
                "_jcoInitializeFutureReadableEndClass",
            ),
            Self::WritableClass => (
                "initializeFutureWritableEndClass",
                "_jcoInitializeFutureWritableEndClass",
            ),
            Self::InternalClass => (
                "initializeInternalFutureClass",
                "_jcoInitializeInternalFutureClass",
            ),
            Self::HostClass => ("initializeHostFutureClass", "_jcoInitializeHostFutureClass"),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/future",
            export,
            local_name,
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContext] {
        use RuntimeContext::{Component, Core, Future, Task};
        match self {
            Self::Futures => &[Core(CoreContext::RepTableClass)],
            Self::Tables => &[],
            Self::NestedSymbol => &[],
            Self::ValueClass => &[],
            Self::EndClass => &[Core(CoreContext::AsyncEventCodeEnum)],
            Self::ReadableClass => &[
                Future(Self::EndClass),
                Future(Self::ValueClass),
                Core(CoreContext::WebAssemblyRuntimeError),
                Core(CoreContext::GlobalBufferManager),
                Core(CoreContext::AsyncEventCodeEnum),
                Component(ComponentContext::StateLookup),
            ],
            Self::WritableClass => &[
                Future(Self::EndClass),
                Future(Self::ValueClass),
                Core(CoreContext::WebAssemblyRuntimeError),
                Core(CoreContext::GlobalBufferManager),
                Core(CoreContext::AsyncEventCodeEnum),
            ],
            Self::InternalClass => &[Future(Self::ReadableClass), Future(Self::WritableClass)],
            Self::HostClass => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
                Future(Self::Lookup),
            ],
            Self::Creation => &[
                Future(Self::InternalClass),
                Future(Self::Futures),
                Future(Self::Tables),
            ],
            Self::Table => &[
                Future(Self::Tables),
                Future(Self::EndClass),
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
            ],
            Self::Lookup => &[
                Future(Self::EndClass),
                Future(Self::Tables),
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
            ],
            Self::New => &[
                Task(TaskContext::Lookup),
                Component(ComponentContext::StateLookup),
                Future(Self::Creation),
            ],
            Self::FromLift => &[Future(Self::HostClass), Future(Self::Futures)],
            Self::Read => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
                Task(TaskContext::Lookup),
                Future(Self::Lookup),
                Core(CoreContext::AsyncEventCodeEnum),
                Future(Self::EndClass),
                Future(Self::ReadableClass),
            ],
            Self::Write => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
                Task(TaskContext::Lookup),
                Future(Self::Lookup),
                Core(CoreContext::AsyncEventCodeEnum),
                Future(Self::EndClass),
                Future(Self::WritableClass),
            ],
            Self::DropRead => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Future(Self::Table),
                Future(Self::ReadableClass),
            ],
            Self::DropWrite => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Future(Self::Table),
                Future(Self::WritableClass),
            ],
            Self::Inject => &[
                Future(Self::NestedSymbol),
                Core(CoreContext::HasOwnProperty),
                Core(CoreContext::SymbolDispose),
                Component(ComponentContext::HostOperation),
            ],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(init) = self.initializer() {
            let initialize = init.local_name;
            let arguments = match self {
                Self::Futures => "RepTable",
                Self::Tables => "",
                Self::NestedSymbol => "",
                Self::ValueClass => "",
                Self::EndClass => "ASYNC_EVENT_CODE",
                Self::ReadableClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, FutureEnd, FutureValue, buffers: BUFFER_MGR, events: ASYNC_EVENT_CODE, lookup: _jcoComponentStateLookupContext }"
                }
                Self::WritableClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, FutureEnd, FutureValue, buffers: BUFFER_MGR, events: ASYNC_EVENT_CODE }"
                }
                Self::InternalClass => "{ FutureReadableEnd, FutureWritableEnd }",
                Self::HostClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoFutureEndLookupContext }"
                }
                _ => unreachable!(),
            };
            uwriteln!(output, "const {local} = {initialize}({arguments});");
            return;
        }
        let properties = match self {
            Self::Creation => "InternalFuture, futures: FUTURES, tables: FUTURE_TABLES",
            Self::Table => {
                "FutureEnd, RuntimeError: WebAssemblyRuntimeError, tables: FUTURE_TABLES, lookup: _jcoComponentStateLookupContext"
            }
            Self::Lookup => {
                "FutureEnd, RuntimeError: WebAssemblyRuntimeError, tables: FUTURE_TABLES, lookup: _jcoComponentStateLookupContext"
            }
            Self::New => {
                "taskLookup: _jcoTaskLookupContext, lookup: _jcoComponentStateLookupContext, creation: _jcoFutureCreateContext"
            }
            Self::FromLift => "HostFuture, futures: FUTURES",
            Self::Read => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, taskLookup: _jcoTaskLookupContext, ends: _jcoFutureEndLookupContext, events: ASYNC_EVENT_CODE, Base: FutureEnd, FutureEnd: FutureReadableEnd"
            }
            Self::Write => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, taskLookup: _jcoTaskLookupContext, ends: _jcoFutureEndLookupContext, events: ASYNC_EVENT_CODE, Base: FutureEnd, FutureEnd: FutureWritableEnd"
            }
            Self::DropRead => {
                "RuntimeError: WebAssemblyRuntimeError, tables: _jcoFutureTableContext, FutureEnd: FutureReadableEnd"
            }
            Self::DropWrite => {
                "RuntimeError: WebAssemblyRuntimeError, tables: _jcoFutureTableContext, FutureEnd: FutureWritableEnd"
            }
            Self::Inject => {
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
            Some(FutureContext::Futures),
            RuntimeImportKind::InitializedValue,
        ),
        GlobalFutureTableMap => (
            "initializeFutureTables",
            Some(FutureContext::Tables),
            RuntimeImportKind::InitializedValue,
        ),
        NestedFutureSymbol => (
            "initializeNestedFutureSymbol",
            Some(FutureContext::NestedSymbol),
            RuntimeImportKind::InitializedValue,
        ),
        FutureValueClass => (
            "initializeFutureValueClass",
            Some(FutureContext::ValueClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        FutureEndClass => (
            "initializeFutureEndClass",
            Some(FutureContext::EndClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        FutureReadableEndClass => (
            "initializeFutureReadableEndClass",
            Some(FutureContext::ReadableClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        FutureWritableEndClass => (
            "initializeFutureWritableEndClass",
            Some(FutureContext::WritableClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        InternalFutureClass => (
            "initializeInternalFutureClass",
            Some(FutureContext::InternalClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        HostFutureClass => (
            "initializeHostFutureClass",
            Some(FutureContext::HostClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        CreateFuture => (
            "createFuture",
            Some(FutureContext::Creation),
            RuntimeImportKind::Call,
        ),
        GetFutureEnd => (
            "getFutureEnd",
            Some(FutureContext::Lookup),
            RuntimeImportKind::Call,
        ),
        AddFutureEndToTable => (
            "addFutureEndToTable",
            Some(FutureContext::Table),
            RuntimeImportKind::Call,
        ),
        RemoveFutureEndFromTable => (
            "removeFutureEndFromTable",
            Some(FutureContext::Table),
            RuntimeImportKind::Call,
        ),
        FutureNew => (
            "futureNew",
            Some(FutureContext::New),
            RuntimeImportKind::Call,
        ),
        FutureNewFromLift => (
            "futureNewFromLift",
            Some(FutureContext::FromLift),
            RuntimeImportKind::Call,
        ),
        FutureRead => (
            "futureRead",
            Some(FutureContext::Read),
            RuntimeImportKind::Call,
        ),
        FutureWrite => (
            "futureWrite",
            Some(FutureContext::Write),
            RuntimeImportKind::Call,
        ),
        FutureCancelRead => (
            "futureCancelRead",
            Some(FutureContext::Read),
            RuntimeImportKind::Call,
        ),
        FutureCancelWrite => (
            "futureCancelWrite",
            Some(FutureContext::Write),
            RuntimeImportKind::Call,
        ),
        FutureDropReadable => (
            "futureDropReadable",
            Some(FutureContext::DropRead),
            RuntimeImportKind::Call,
        ),
        FutureDropWritable => (
            "futureDropWritable",
            Some(FutureContext::DropWrite),
            RuntimeImportKind::Call,
        ),
        FutureTransfer => (
            "futureTransfer",
            Some(FutureContext::Lookup),
            RuntimeImportKind::Call,
        ),
        GenFutureHostInjectFn => (
            "genFutureHostInjectFn",
            Some(FutureContext::Inject),
            RuntimeImportKind::Call,
        ),
        IsFutureLowerableObject => ("isFutureLowerableObject", None, RuntimeImportKind::Call),
    };
    RuntimeImport {
        suffix: "intrinsics/future",
        export,
        context: context.map(RuntimeContext::Future),
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
                .matches("const FutureValue = _jcoInitializeFutureValueClass();")
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
            RuntimeContext::Future(FutureContext::HostClass)
        ));
        let (_, lift) = generated([Intrinsic::AsyncFuture(
            AsyncFutureIntrinsic::FutureNewFromLift,
        )]);
        assert!(super::super::uses_context(
            &lift,
            RuntimeContext::Future(FutureContext::HostClass)
        ));
    }
}
