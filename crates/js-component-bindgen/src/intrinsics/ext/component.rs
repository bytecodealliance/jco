//! Central metadata for named component operations and their actual state owners.
use super::super::{RenderIntrinsicsArgs, component::ComponentIntrinsic};
use super::{
    CoreContext, RuntimeContext, RuntimeImport, RuntimeImportKind, RuntimeInitializer,
    WaitableContext,
};
use crate::{source::Source, uwriteln};
use std::fmt::Write;
use wasmtime_environ::Trap;

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum ComponentContext {
    InstanceFlags,
    StoreTrap,
    StoreAsyncState,
    AsyncStates,
    CoreTrapMessages,
    NormalizeTrap,
    Deadlock,
    HostOperation,
    MayLeave,
    StateLookup,
    RecordTrap,
    PostReturnTrap,
    AsyncStateClass,
}
impl ComponentContext {
    const ALL: [Self; 13] = [
        Self::InstanceFlags,
        Self::StoreTrap,
        Self::StoreAsyncState,
        Self::AsyncStates,
        Self::CoreTrapMessages,
        Self::NormalizeTrap,
        Self::Deadlock,
        Self::HostOperation,
        Self::MayLeave,
        Self::StateLookup,
        Self::RecordTrap,
        Self::PostReturnTrap,
        Self::AsyncStateClass,
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
            Self::InstanceFlags => "INSTANCE_FLAGS",
            Self::StoreTrap => "STORE_TRAP",
            Self::StoreAsyncState => "STORE_ASYNC_STATE",
            Self::AsyncStates => "ASYNC_STATE",
            Self::CoreTrapMessages => "CORE_TRAP_MESSAGES",
            Self::NormalizeTrap => "_jcoComponentNormalizeTrapContext",
            Self::Deadlock => "_jcoComponentDeadlockContext",
            Self::HostOperation => "_jcoComponentHostOperationContext",
            Self::MayLeave => "_jcoComponentMayLeaveContext",
            Self::StateLookup => "_jcoComponentStateLookupContext",
            Self::RecordTrap => "_jcoComponentRecordTrapContext",
            Self::PostReturnTrap => "_jcoComponentPostReturnTrapContext",
            Self::AsyncStateClass => "ComponentAsyncState",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::InstanceFlags => ("initializeInstanceFlags", "_jcoInitializeInstanceFlags"),
            Self::StoreTrap => ("initializeStoreTrap", "_jcoInitializeStoreTrap"),
            Self::StoreAsyncState => ("initializeStoreAsyncState", "_jcoInitializeStoreAsyncState"),
            Self::AsyncStates => (
                "initializeComponentAsyncStates",
                "_jcoInitializeComponentAsyncStates",
            ),
            Self::CoreTrapMessages => (
                "initializeCoreTrapMessages",
                "_jcoInitializeCoreTrapMessages",
            ),
            Self::AsyncStateClass => (
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
    pub(crate) fn dependencies(self) -> &'static [RuntimeContext] {
        use RuntimeContext::{Component as C, Core};
        match self {
            Self::NormalizeTrap => &[C(Self::CoreTrapMessages)],
            Self::Deadlock => &[
                C(Self::StoreTrap),
                C(Self::StoreAsyncState),
                C(Self::AsyncStates),
            ],
            Self::HostOperation => &[C(Self::Deadlock), Core(CoreContext::SymbolDispose)],
            Self::MayLeave => &[C(Self::InstanceFlags)],
            Self::StateLookup => &[C(Self::AsyncStates), C(Self::AsyncStateClass)],
            Self::PostReturnTrap => &[C(Self::StateLookup)],
            Self::RecordTrap => &[
                Core(CoreContext::GlobalCurrentTaskMeta),
                C(Self::StateLookup),
            ],
            Self::AsyncStateClass => &[
                RuntimeContext::Waitable(WaitableContext::Class),
                Core(CoreContext::RepTableClass),
                RuntimeContext::HandleIndexSpaces,
                C(Self::InstanceFlags),
                C(Self::StoreTrap),
                C(Self::NormalizeTrap),
                C(Self::Deadlock),
            ],
            _ => &[],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(initializer) = self.initializer() {
            let initialize = initializer.local_name;
            let arguments = match self {
                Self::CoreTrapMessages => core_trap_messages_js(),
                Self::AsyncStateClass => format!(
                    "{{ RuntimeError: WebAssembly.RuntimeError, RepTable, indexSpaces: HANDLE_INDEX_SPACES, instanceFlags: INSTANCE_FLAGS, storeTrap: STORE_TRAP, normalization: _jcoComponentNormalizeTrapContext, cannotEnter: {:?}, deadlock: _jcoComponentDeadlockContext, Waitable }}",
                    Trap::CannotEnterComponent.to_string()
                ),
                _ => String::new(),
            };
            uwriteln!(output, "const {local} = {initialize}({arguments});");
            return;
        }
        match self {
            Self::NormalizeTrap => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, messages: CORE_TRAP_MESSAGES }};"
            ),
            Self::Deadlock => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, storeTrap: STORE_TRAP, storeAsyncState: STORE_ASYNC_STATE, asyncState: ASYNC_STATE }};"
            ),
            Self::HostOperation => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, storeTrap: STORE_TRAP, storeAsyncState: STORE_ASYNC_STATE, asyncState: ASYNC_STATE, symbolDispose }};"
            ),
            Self::MayLeave => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, instanceFlags: INSTANCE_FLAGS }};"
            ),
            Self::StateLookup => uwriteln!(
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
pub(crate) fn import(intrinsic: ComponentIntrinsic) -> RuntimeImport {
    use ComponentContext as C;
    use ComponentIntrinsic::*;
    use RuntimeImportKind as K;
    let (export, context, kind) = match intrinsic {
        GlobalInstanceFlagsMap => (
            "initializeInstanceFlags",
            C::InstanceFlags,
            K::InitializedValue,
        ),
        GlobalStoreTrap => ("initializeStoreTrap", C::StoreTrap, K::InitializedValue),
        GlobalStoreAsyncState => (
            "initializeStoreAsyncState",
            C::StoreAsyncState,
            K::InitializedValue,
        ),
        GlobalAsyncStateMap => (
            "initializeComponentAsyncStates",
            C::AsyncStates,
            K::InitializedValue,
        ),
        ComponentAsyncStateClass => (
            "initializeComponentAsyncStateClass",
            C::AsyncStateClass,
            K::InitializedConstructor,
        ),
        CheckForDeadlock => ("checkForDeadlock", C::Deadlock, K::Call),
        TrackHostOperation => ("trackHostOperation", C::HostOperation, K::Call),
        NormalizeCoreTrap => ("normalizeCoreTrap", C::NormalizeTrap, K::Call),
        CheckMayLeave => ("checkMayLeave", C::MayLeave, K::Call),
        GuardMayLeave => ("guardMayLeave", C::MayLeave, K::Call),
        RecordTrap => ("recordTrap", C::RecordTrap, K::Call),
        PostReturnTrap => ("postReturnTrap", C::PostReturnTrap, K::Call),
        GuardPostReturn => ("guardPostReturn", C::PostReturnTrap, K::Call),
        GuardTrap => ("guardTrap", C::RecordTrap, K::Call),
        GetOrCreateAsyncState => ("getOrCreateAsyncState", C::StateLookup, K::Call),
        BackpressureInc => ("backpressureInc", C::StateLookup, K::Call),
        BackpressureDec => ("backpressureDec", C::StateLookup, K::Call),
        ComponentStateSetAllError => ("setAllError", C::AsyncStates, K::Call),
    };
    RuntimeImport {
        suffix: "intrinsics/component",
        export,
        context: Some(RuntimeContext::Component(context)),
        kind,
    }
}
#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::intrinsics::runtime;
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
            assert!(source.contains("lookup: _jcoComponentStateLookupContext"));
            assert!(!source.contains(&format!("function {}(", selected.name())));
            assert!(
                runtime::select(true)
                    .callback_reference(selected)
                    .contains("_jcoLower")
            );
            assert!(!source.contains("getOrCreateAsyncState(componentIdx)"));
            assert!(!source.contains("getOrCreateAsyncState(globalErrCtx.componentIdx)"));
        }
    }
}
