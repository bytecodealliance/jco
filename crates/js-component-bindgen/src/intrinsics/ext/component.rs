//! Central metadata for named component operations and their actual state owners.
use super::super::{RenderIntrinsicsArgs, component::ComponentIntrinsic};
use super::{
    CoreContextIntrinsic, RuntimeContextIntrinsic, RuntimeImport, RuntimeImportKind,
    RuntimeInitializer, WaitableContextIntrinsic,
};
use crate::{source::Source, uwriteln};
use std::fmt::Write;
use wasmtime_environ::Trap;

/// State initializers and shared capability contexts for external component intrinsics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum ComponentContextIntrinsic {
    /// Per-component flags returned by `initializeInstanceFlags`.
    InitializeInstanceFlags,
    /// Store trap and resource-disposal state returned by `initializeStoreTrap`.
    InitializeStoreTrap,
    /// Store-wide pending host work and deadlock-check state returned by `initializeStoreAsyncState`.
    InitializeStoreAsyncState,
    /// The component-indexed async-state map returned by `initializeComponentAsyncStates`.
    InitializeComponentAsyncStates,
    /// The core Wasm trap-message normalization map returned by `initializeCoreTrapMessages`.
    InitializeCoreTrapMessages,
    /// Capabilities for `normalizeCoreTrap`, which maps JS engine traps to canonical trap messages.
    NormalizeCoreTrap,
    /// Capabilities for `checkForDeadlock`, the component scheduler deadlock check.
    CheckForDeadlock,
    /// Capabilities for `trackHostOperation`, which tracks pending host work.
    TrackHostOperation,
    /// Shared capabilities for `checkMayLeave` and `guardMayLeave`.
    CheckMayLeave,
    /// Shared capabilities for `getOrCreateAsyncState`, `backpressureInc`, and `backpressureDec`.
    GetOrCreateAsyncState,
    /// Shared capabilities for `recordTrap` and `guardTrap`.
    RecordTrap,
    /// Shared capabilities for `postReturnTrap` and `guardPostReturn`.
    PostReturnTrap,
    /// The component async-state constructor returned by `initializeComponentAsyncStateClass`.
    InitializeComponentAsyncStateClass,
}
impl ComponentContextIntrinsic {
    const ALL: [Self; 13] = [
        Self::InitializeInstanceFlags,
        Self::InitializeStoreTrap,
        Self::InitializeStoreAsyncState,
        Self::InitializeComponentAsyncStates,
        Self::InitializeCoreTrapMessages,
        Self::NormalizeCoreTrap,
        Self::CheckForDeadlock,
        Self::TrackHostOperation,
        Self::CheckMayLeave,
        Self::GetOrCreateAsyncState,
        Self::RecordTrap,
        Self::PostReturnTrap,
        Self::InitializeComponentAsyncStateClass,
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
            Self::InitializeInstanceFlags => "INSTANCE_FLAGS",
            Self::InitializeStoreTrap => "STORE_TRAP",
            Self::InitializeStoreAsyncState => "STORE_ASYNC_STATE",
            Self::InitializeComponentAsyncStates => "ASYNC_STATE",
            Self::InitializeCoreTrapMessages => "CORE_TRAP_MESSAGES",
            Self::NormalizeCoreTrap => "_jcoComponentNormalizeTrapContext",
            Self::CheckForDeadlock => "_jcoComponentDeadlockContext",
            Self::TrackHostOperation => "_jcoComponentHostOperationContext",
            Self::CheckMayLeave => "_jcoComponentMayLeaveContext",
            Self::GetOrCreateAsyncState => "_jcoComponentStateLookupContext",
            Self::RecordTrap => "_jcoComponentRecordTrapContext",
            Self::PostReturnTrap => "_jcoComponentPostReturnTrapContext",
            Self::InitializeComponentAsyncStateClass => "ComponentAsyncState",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::InitializeInstanceFlags => {
                ("initializeInstanceFlags", "_jcoInitializeInstanceFlags")
            }
            Self::InitializeStoreTrap => ("initializeStoreTrap", "_jcoInitializeStoreTrap"),
            Self::InitializeStoreAsyncState => {
                ("initializeStoreAsyncState", "_jcoInitializeStoreAsyncState")
            }
            Self::InitializeComponentAsyncStates => (
                "initializeComponentAsyncStates",
                "_jcoInitializeComponentAsyncStates",
            ),
            Self::InitializeCoreTrapMessages => (
                "initializeCoreTrapMessages",
                "_jcoInitializeCoreTrapMessages",
            ),
            Self::InitializeComponentAsyncStateClass => (
                "initializeComponentAsyncStateClass",
                "_jcoInitializeComponentAsyncStateClass",
            ),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/component",
            export,
            local_name,
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContextIntrinsic] {
        use RuntimeContextIntrinsic::{Component, Core};
        match self {
            Self::NormalizeCoreTrap => &[Component(Self::InitializeCoreTrapMessages)],
            Self::CheckForDeadlock => &[
                Component(Self::InitializeStoreTrap),
                Component(Self::InitializeStoreAsyncState),
                Component(Self::InitializeComponentAsyncStates),
            ],
            Self::TrackHostOperation => &[
                Component(Self::CheckForDeadlock),
                Core(CoreContextIntrinsic::InitializeSymbolDispose),
            ],
            Self::CheckMayLeave => &[Component(Self::InitializeInstanceFlags)],
            Self::GetOrCreateAsyncState => &[
                Component(Self::InitializeComponentAsyncStates),
                Component(Self::InitializeComponentAsyncStateClass),
            ],
            Self::PostReturnTrap => &[Component(Self::GetOrCreateAsyncState)],
            Self::RecordTrap => &[
                Core(CoreContextIntrinsic::InitializeTaskRegisters),
                Component(Self::GetOrCreateAsyncState),
            ],
            Self::InitializeComponentAsyncStateClass => &[
                RuntimeContextIntrinsic::Waitable(
                    WaitableContextIntrinsic::InitializeWaitableClass,
                ),
                Core(CoreContextIntrinsic::InitializeRepTableClass),
                RuntimeContextIntrinsic::InitializeHandleIndexSpaces,
                Component(Self::InitializeInstanceFlags),
                Component(Self::InitializeStoreTrap),
                Component(Self::NormalizeCoreTrap),
                Component(Self::CheckForDeadlock),
            ],
            _ => &[],
        }
    }
    pub(crate) fn render(self, output: &mut Source, args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(initializer) = self.initializer() {
            let initialize = initializer.local_name;
            let arguments = match self {
                Self::InitializeStoreTrap if args.instantiation_occurred => {
                    "options?.onTrap ?? null".into()
                }
                Self::InitializeCoreTrapMessages => core_trap_messages_js(),
                Self::InitializeComponentAsyncStateClass => format!(
                    "{{ RuntimeError: WebAssembly.RuntimeError, RepTable, indexSpaces: HANDLE_INDEX_SPACES, instanceFlags: INSTANCE_FLAGS, storeTrap: STORE_TRAP, normalization: _jcoComponentNormalizeTrapContext, cannotEnter: {:?}, deadlock: _jcoComponentDeadlockContext, Waitable, reportTrap: err => _reportTrap(err), checkIdle: () => _checkIdle() }}",
                    Trap::CannotEnterComponent.to_string()
                ),
                _ => String::new(),
            };
            uwriteln!(output, "const {local} = {initialize}({arguments});");
            return;
        }
        match self {
            Self::NormalizeCoreTrap => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, messages: CORE_TRAP_MESSAGES }};"
            ),
            Self::CheckForDeadlock => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, storeTrap: STORE_TRAP, storeAsyncState: STORE_ASYNC_STATE, asyncState: ASYNC_STATE }};"
            ),
            Self::TrackHostOperation => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, storeTrap: STORE_TRAP, storeAsyncState: STORE_ASYNC_STATE, asyncState: ASYNC_STATE, symbolDispose }};"
            ),
            Self::CheckMayLeave => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, instanceFlags: INSTANCE_FLAGS }};"
            ),
            Self::GetOrCreateAsyncState => uwriteln!(
                output,
                "const {local} = {{ asyncState: ASYNC_STATE, ComponentAsyncState }};"
            ),
            Self::PostReturnTrap => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, lookup: _jcoComponentStateLookupContext, stackOverflow: {:?}, uncaughtException: {:?} }};",
                Trap::StackOverflow.to_string(),
                Trap::UncaughtException.to_string(),
            ),
            Self::RecordTrap => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext }};"
            ),
            _ => unreachable!("other component contexts have selected initializers"),
        }
    }
}
fn core_trap_messages_js() -> String {
    let messages = [
        ("unreachable", Trap::UnreachableCodeReached),
        ("memory access out of bounds", Trap::MemoryOutOfBounds),
        ("divide by zero", Trap::IntegerDivisionByZero),
        ("remainder by zero", Trap::IntegerDivisionByZero),
        ("divide result unrepresentable", Trap::IntegerOverflow),
        (
            "float unrepresentable in integer range",
            Trap::BadConversionToInteger,
        ),
        ("table index is out of bounds", Trap::TableOutOfBounds),
        ("function signature mismatch", Trap::BadSignature),
        ("call stack exhausted", Trap::StackOverflow),
    ]
    .map(|(message, trap)| format!("{message:?}: {:?}", trap.to_string()))
    .join(",");
    format!("{{{messages}}}")
}
pub(crate) fn import(intrinsic: ComponentIntrinsic) -> Option<RuntimeImport> {
    use ComponentIntrinsic::*;
    let (export, context, kind) = match intrinsic {
        // Trap reporting uses instantiation options; shutdown and idle checks use generated tables.
        StopInstance | ReportTrap | WhenIdle | CheckIdle | CallTracking => return None,
        GlobalInstanceFlagsMap => (
            "initializeInstanceFlags",
            ComponentContextIntrinsic::InitializeInstanceFlags,
            RuntimeImportKind::InitializedValue,
        ),
        GlobalStoreTrap => (
            "initializeStoreTrap",
            ComponentContextIntrinsic::InitializeStoreTrap,
            RuntimeImportKind::InitializedValue,
        ),
        GlobalStoreAsyncState => (
            "initializeStoreAsyncState",
            ComponentContextIntrinsic::InitializeStoreAsyncState,
            RuntimeImportKind::InitializedValue,
        ),
        GlobalAsyncStateMap => (
            "initializeComponentAsyncStates",
            ComponentContextIntrinsic::InitializeComponentAsyncStates,
            RuntimeImportKind::InitializedValue,
        ),
        ComponentAsyncStateClass => (
            "initializeComponentAsyncStateClass",
            ComponentContextIntrinsic::InitializeComponentAsyncStateClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        CheckForDeadlock => (
            "checkForDeadlock",
            ComponentContextIntrinsic::CheckForDeadlock,
            RuntimeImportKind::Call,
        ),
        TrackHostOperation => (
            "trackHostOperation",
            ComponentContextIntrinsic::TrackHostOperation,
            RuntimeImportKind::Call,
        ),
        NormalizeCoreTrap => (
            "normalizeCoreTrap",
            ComponentContextIntrinsic::NormalizeCoreTrap,
            RuntimeImportKind::Call,
        ),
        CheckMayLeave => (
            "checkMayLeave",
            ComponentContextIntrinsic::CheckMayLeave,
            RuntimeImportKind::Call,
        ),
        GuardMayLeave => (
            "guardMayLeave",
            ComponentContextIntrinsic::CheckMayLeave,
            RuntimeImportKind::Call,
        ),
        RecordTrap => (
            "recordTrap",
            ComponentContextIntrinsic::RecordTrap,
            RuntimeImportKind::Call,
        ),
        PostReturnTrap => (
            "postReturnTrap",
            ComponentContextIntrinsic::PostReturnTrap,
            RuntimeImportKind::Call,
        ),
        GuardPostReturn => (
            "guardPostReturn",
            ComponentContextIntrinsic::PostReturnTrap,
            RuntimeImportKind::Call,
        ),
        GuardTrap => (
            "guardTrap",
            ComponentContextIntrinsic::RecordTrap,
            RuntimeImportKind::Call,
        ),
        GetOrCreateAsyncState => (
            "getOrCreateAsyncState",
            ComponentContextIntrinsic::GetOrCreateAsyncState,
            RuntimeImportKind::Call,
        ),
        // Implements `canon backpressure.inc` using the shared component state.
        BackpressureInc => (
            "backpressureInc",
            ComponentContextIntrinsic::GetOrCreateAsyncState,
            RuntimeImportKind::Call,
        ),
        // Implements `canon backpressure.dec` using the shared component state.
        BackpressureDec => (
            "backpressureDec",
            ComponentContextIntrinsic::GetOrCreateAsyncState,
            RuntimeImportKind::Call,
        ),
        ComponentStateSetAllError => (
            "setAllError",
            ComponentContextIntrinsic::InitializeComponentAsyncStates,
            RuntimeImportKind::Call,
        ),
    };
    Some(RuntimeImport {
        suffix: "intrinsics/component",
        export,
        context: Some(RuntimeContextIntrinsic::Component(context)),
        kind,
    })
}
pub(crate) fn discover_dependencies(
    intrinsic: ComponentIntrinsic,
    args: &RenderIntrinsicsArgs<'_>,
) {
    if let Some(context) = import(intrinsic).and_then(|import| import.context) {
        let mut contexts = Vec::new();
        context.collect(&mut contexts);
        if contexts.contains(&RuntimeContextIntrinsic::Component(
            ComponentContextIntrinsic::InitializeComponentAsyncStateClass,
        )) {
            args.require_intrinsic(ComponentIntrinsic::ReportTrap);
            args.require_intrinsic(ComponentIntrinsic::CheckIdle);
        }
    }
}

#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::{
        TranspileOpts,
        intrinsics::{Intrinsic, p3::waitable::WaitableIntrinsic, render_intrinsics},
    };
    use std::collections::BTreeSet;

    fn generated(
        selected: impl IntoIterator<Item = ComponentIntrinsic>,
    ) -> (String, BTreeSet<Intrinsic>) {
        generated_intrinsics(selected.into_iter().map(Intrinsic::Component))
    }

    fn generated_intrinsics(
        selected: impl IntoIterator<Item = Intrinsic>,
    ) -> (String, BTreeSet<Intrinsic>) {
        let mut intrinsics = selected.into_iter().collect();
        let opts = TranspileOpts::builder().name("component".into()).build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .external_runtime(true)
                .build(),
        );
        (source.to_string(), intrinsics)
    }

    #[test]
    fn stop_instance_keeps_inline_shutdown_and_discovers_external_state() {
        use crate::intrinsics::runtime::{IntrinsicBinding, select};

        let intrinsic = ComponentIntrinsic::StopInstance;
        assert!(matches!(
            select(true).binding(intrinsic),
            IntrinsicBinding::Inline { .. }
        ));
        assert!(import(intrinsic).is_none());
        let (_, intrinsics) = generated([intrinsic]);
        for dependency in [
            ComponentIntrinsic::GlobalStoreTrap,
            ComponentIntrinsic::GlobalStoreAsyncState,
            ComponentIntrinsic::GlobalAsyncStateMap,
        ] {
            assert!(intrinsics.contains(&dependency.into()));
            assert!(import(dependency).is_some());
        }
    }

    #[test]
    fn component_owners_select_one_class_and_the_actual_waitable_constructor() {
        let (source, intrinsics) = generated([
            ComponentIntrinsic::ComponentAsyncStateClass,
            ComponentIntrinsic::GetOrCreateAsyncState,
            ComponentIntrinsic::GlobalInstanceFlagsMap,
            ComponentIntrinsic::GlobalStoreTrap,
            ComponentIntrinsic::GlobalStoreAsyncState,
            ComponentIntrinsic::GlobalAsyncStateMap,
        ]);
        assert_eq!(
            source
                .matches("const ComponentAsyncState = _jcoInitializeComponentAsyncStateClass(")
                .count(),
            1
        );
        assert_eq!(
            source
                .matches("const ASYNC_STATE = _jcoInitializeComponentAsyncStates();")
                .count(),
            1
        );
        assert!(source.contains("deadlock: _jcoComponentDeadlockContext, Waitable"));
        assert!(source.contains("reportTrap: err => _reportTrap(err)"));
        assert!(source.contains("function _reportTrap(err)"));
        assert!(source.contains("_normalizeCoreTrap(_jcoComponentNormalizeTrapContext, err)"));
        assert!(source.contains("instanceFlags: INSTANCE_FLAGS, storeTrap: STORE_TRAP"));
        assert!(source.contains("asyncState: ASYNC_STATE, ComponentAsyncState"));
        assert!(source.contains("wasm trap: cannot enter component instance"));
        assert!(source.contains("wasm trap: wasm `unreachable` instruction executed"));
        assert!(source.contains("const Waitable = _jcoInitializeWaitableClass();"));
        assert!(!source.contains("class Waitable"));
        assert!(!source.contains("createWaitable: args =>"));
        assert!(!source.contains("class ComponentAsyncState"));
        assert!(!source.contains("function getOrCreateAsyncState("));
        assert!(!intrinsics.contains(&Intrinsic::Waitable(WaitableIntrinsic::WaitableClass)));
    }

    #[test]
    fn store_trap_receives_the_instantiations_notifier() {
        let mut intrinsics = BTreeSet::from([ComponentIntrinsic::GlobalStoreTrap.into()]);
        let opts = TranspileOpts::builder().name("component".into()).build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .external_runtime(true)
                .instantiation_occurred(true)
                .build(),
        );
        assert!(source.contains("_jcoInitializeStoreTrap(options?.onTrap ?? null)"));
    }

    #[test]
    fn may_leave_guard_does_not_select_the_scheduler_or_task_state() {
        let (source, _) = generated([ComponentIntrinsic::GuardMayLeave]);
        assert!(source.contains("const INSTANCE_FLAGS = _jcoInitializeInstanceFlags();"));
        for unrelated in [
            "ASYNC_STATE",
            "STORE_TRAP",
            "CURRENT_TASK_META",
            "CORE_TRAP_MESSAGES",
            "class Waitable",
            "RepTable",
        ] {
            assert!(!source.contains(unrelated), "{unrelated}");
        }
    }

    #[test]
    fn backpressure_callbacks_bind_context_before_the_component_operand() {
        let intrinsic = Intrinsic::Component(ComponentIntrinsic::BackpressureInc);
        assert_eq!(
            crate::intrinsics::runtime::select(true).bind_callback(intrinsic, "7"),
            "backpressureInc.bind(null, _jcoComponentStateLookupContext, 7)"
        );
        assert_eq!(
            crate::intrinsics::runtime::select(false).bind_callback(intrinsic, "7"),
            "backpressureInc.bind(null, 7)"
        );
    }

    #[test]
    fn shorthand_future_and_stream_host_calls_receive_their_context() {
        use crate::intrinsics::p3::{
            async_future::AsyncFutureIntrinsic, async_stream::AsyncStreamIntrinsic,
        };
        for selected in [
            Intrinsic::AsyncFuture(AsyncFutureIntrinsic::GenFutureHostInjectFn),
            Intrinsic::AsyncStream(AsyncStreamIntrinsic::PendingValueQueueClass),
        ] {
            let (source, _) = generated_intrinsics([selected]);
            assert!(
                source.contains("_trackHostOperation(_jcoComponentHostOperationContext, () =>")
            );
            assert!(!source.contains("_trackHostOperation(() =>"));
        }
    }

    #[test]
    fn shorthand_lowerers_receive_their_component_owner() {
        use crate::intrinsics::lower::LowerIntrinsic;
        for selected in [
            Intrinsic::Lower(LowerIntrinsic::LowerFlatFuture),
            Intrinsic::Lower(LowerIntrinsic::LowerFlatStream),
            Intrinsic::Lower(LowerIntrinsic::LowerFlatErrorContext),
        ] {
            let (source, _) = generated_intrinsics([selected]);
            assert!(
                source.contains(
                    "getOrCreateAsyncState(_jcoComponentStateLookupContext, componentIdx)"
                )
            );
            assert!(!source.contains("getOrCreateAsyncState(componentIdx)"));
            assert!(!source.contains("getOrCreateAsyncState(globalErrCtx.componentIdx)"));
        }
    }
}
