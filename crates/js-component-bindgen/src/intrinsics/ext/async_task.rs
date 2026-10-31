//! Named async-task operations and their actual selected per-store owners.
use super::{
    ComponentContextIntrinsic as P, CoreContextIntrinsic as K, RuntimeContextIntrinsic, RuntimeImport, RuntimeImportKind,
    RuntimeInitializer, WaitableContextIntrinsic as V,
};
use crate::{
    intrinsics::{
        Intrinsic, RenderIntrinsicsArgs,
        p3::{async_future::AsyncFutureIntrinsic, async_task::AsyncTaskIntrinsic},
    },
    source::Source,
    uwriteln,
};
use std::fmt::Write;
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum TaskContext {
    ThreadLookup,
    ThreadClass,
    ThreadControl,
    ThreadNew,
    ThreadStart,
    SubtaskDrop,
    MayBlock,
    BlockingDepth,
    Tasks,
    TaskIds,
    ComponentIdxs,
    Stack,
    Lookup,
    Clearing,
    FuturePredicate,
    SubtaskClass,
    TaskClass,
    Creation,
    Trap,
    Return,
    Cancellation,
    SubtaskCancellation,
    Driver,
    Lower,
    Compat,
    SymmetricEnter,
    SymmetricExit,
}
impl TaskContext {
    const ALL: &'static [Self] = &[
        Self::ThreadLookup,
        Self::ThreadClass,
        Self::ThreadControl,
        Self::ThreadNew,
        Self::ThreadStart,
        Self::SubtaskDrop,
        Self::MayBlock,
        Self::BlockingDepth,
        Self::Tasks,
        Self::TaskIds,
        Self::ComponentIdxs,
        Self::Stack,
        Self::Lookup,
        Self::Clearing,
        Self::FuturePredicate,
        Self::SubtaskClass,
        Self::TaskClass,
        Self::Creation,
        Self::Trap,
        Self::Return,
        Self::Cancellation,
        Self::SubtaskCancellation,
        Self::Driver,
        Self::Lower,
        Self::Compat,
        Self::SymmetricEnter,
        Self::SymmetricExit,
    ];
    pub(crate) fn get_global_names() -> impl Iterator<Item = &'static str> {
        Self::ALL
            .iter()
            .flat_map(|c| [Some(c.local_name()), c.initializer().map(|i| i.local_name)])
            .flatten()
    }
    pub(crate) fn local_name(self) -> &'static str {
        match self {
            Self::ThreadLookup => "_jcoThreadLookupContext",
            Self::ThreadClass => "AsyncThread",
            Self::ThreadControl => "_jcoThreadControlContext",
            Self::ThreadNew => "_jcoThreadNewContext",
            Self::ThreadStart => "_jcoThreadStartChecks",
            Self::SubtaskDrop => "_jcoSubtaskDropContext",
            Self::MayBlock => "CURRENT_TASK_MAY_BLOCK",
            Self::BlockingDepth => "ASYNC_BLOCKING_CALL_DEPTH",
            Self::Tasks => "ASYNC_TASKS_BY_COMPONENT_IDX",
            Self::TaskIds => "ASYNC_CURRENT_TASK_IDS",
            Self::ComponentIdxs => "ASYNC_CURRENT_COMPONENT_IDXS",
            Self::Stack => "SYMMETRIC_SYNC_GUEST_CALL_STACK",
            Self::Lookup => "_jcoTaskLookupContext",
            Self::Clearing => "_jcoTaskClearContext",
            Self::FuturePredicate => "_jcoTaskFuturePredicate",
            Self::SubtaskClass => "AsyncSubtask",
            Self::TaskClass => "AsyncTask",
            Self::Creation => "_jcoTaskCreateContext",
            Self::Trap => "_jcoTaskTrapContext",
            Self::Return => "_jcoTaskReturnContext",
            Self::Cancellation => "_jcoTaskCancelContext",
            Self::SubtaskCancellation => "_jcoSubtaskCancelContext",
            Self::Driver => "_jcoTaskDriverContext",
            Self::Lower => "_jcoTaskLowerImportContext",
            Self::Compat => "_jcoTaskCompatImportContext",
            Self::SymmetricEnter => "_jcoTaskSymmetricEnterContext",
            Self::SymmetricExit => "_jcoTaskSymmetricExitContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::ThreadClass => (
                "initializeAsyncThreadClass",
                "_jcoInitializeAsyncThreadClass",
            ),
            Self::ThreadStart => (
                "initializeThreadStartChecks",
                "_jcoInitializeThreadStartChecks",
            ),
            Self::MayBlock => (
                "initializeCurrentTaskMayBlock",
                "_jcoInitializeCurrentTaskMayBlock",
            ),
            Self::BlockingDepth => (
                "initializeAsyncBlockingCallDepth",
                "_jcoInitializeAsyncBlockingCallDepth",
            ),
            Self::Tasks => (
                "initializeTasksByComponent",
                "_jcoInitializeTasksByComponent",
            ),
            Self::TaskIds => ("initializeCurrentTaskIds", "_jcoInitializeCurrentTaskIds"),
            Self::ComponentIdxs => (
                "initializeCurrentComponentIdxs",
                "_jcoInitializeCurrentComponentIdxs",
            ),
            Self::Stack => (
                "initializeSymmetricSyncGuestCallStack",
                "_jcoInitializeSymmetricSyncGuestCallStack",
            ),
            Self::SubtaskClass => (
                "initializeAsyncSubtaskClass",
                "_jcoInitializeAsyncSubtaskClass",
            ),
            Self::TaskClass => ("initializeAsyncTaskClass", "_jcoInitializeAsyncTaskClass"),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/async-task",
            export,
            local_name,
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContextIntrinsic] {
        use RuntimeContextIntrinsic::{Component as C, Core, Task as T, Waitable as W};
        match self {
            Self::ThreadLookup => &[C(P::GetOrCreateAsyncState), Core(K::InitializeTaskRegisters)],
            Self::ThreadClass => &[T(Self::ThreadLookup), C(P::RecordTrap)],
            Self::ThreadControl => &[T(Self::ThreadLookup), T(Self::ThreadClass)],
            Self::ThreadNew => &[T(Self::ThreadControl), T(Self::ThreadStart)],
            Self::SubtaskDrop => &[T(Self::SubtaskClass), C(P::GetOrCreateAsyncState)],
            Self::Lookup => &[T(Self::Tasks), Core(K::InitializeTaskRegisters)],
            Self::Clearing => &[T(Self::Tasks), T(Self::TaskIds), T(Self::ComponentIdxs)],
            Self::SubtaskClass => &[
                C(P::GetOrCreateAsyncState),
                Core(K::InitializeComponentMemoryMap),
                Core(K::InitializeSymbolDispose),
            ],
            Self::TaskClass => &[
                T(Self::SubtaskClass),
                C(P::PostReturnTrap),
                C(P::RecordTrap),
                W(V::InitializeWaitableClass),
                C(P::GetOrCreateAsyncState),
                Core(K::InitializeRuntimeErrorConstructor),
                Core(K::InitializeAsyncEventCodes),
                Core(K::InitializeAsyncDeterminism),
                RuntimeContextIntrinsic::InitializeResourceScopeCounter,
                RuntimeContextIntrinsic::InitializeResourceScopeTasks,
                T(Self::Clearing),
                Core(K::InitializeTaskRegisters),
                T(Self::FuturePredicate),
            ],
            Self::Creation => &[T(Self::TaskClass), T(Self::ThreadClass), T(Self::Clearing)],
            Self::Trap => &[Core(K::InitializeRuntimeErrorConstructor)],
            Self::Return => &[T(Self::Lookup), Core(K::InitializeRuntimeErrorConstructor)],
            Self::Cancellation => &[T(Self::Lookup), C(P::GetOrCreateAsyncState)],
            Self::SubtaskCancellation => &[T(Self::Cancellation), T(Self::SubtaskClass)],
            Self::Driver => &[
                Core(K::InitializeRuntimeErrorConstructor),
                C(P::GetOrCreateAsyncState),
                W(V::InitializeWaitableSetClass),
                Core(K::InitializeAsyncEventCodes),
                RuntimeContextIntrinsic::NumericConversion,
            ],
            Self::Lower => &[
                T(Self::Lookup),
                C(P::GetOrCreateAsyncState),
                C(P::CheckMayLeave),
                T(Self::TaskClass),
                Core(K::InitializeAsyncEventCodes),
            ],
            Self::Compat => &[
                T(Self::Lookup),
                C(P::GetOrCreateAsyncState),
                C(P::CheckMayLeave),
                T(Self::Creation),
                Core(K::InitializeAsyncEventCodes),
            ],
            Self::SymmetricEnter => &[
                T(Self::Lookup),
                C(P::GetOrCreateAsyncState),
                T(Self::Creation),
                T(Self::MayBlock),
                T(Self::Stack),
            ],
            Self::SymmetricExit => &[
                T(Self::Lookup),
                C(P::GetOrCreateAsyncState),
                T(Self::MayBlock),
                T(Self::Stack),
            ],
            _ => &[],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if self == Self::FuturePredicate {
            uwriteln!(
                output,
                "const {local} = value => value instanceof FutureValue;"
            );
            return;
        }
        let properties = match self {
            Self::ThreadLookup => {
                "lookup: _jcoComponentStateLookupContext, registers: CURRENT_TASK_META"
            }
            Self::ThreadClass => {
                "{ lookup: _jcoComponentStateLookupContext, registers: CURRENT_TASK_META, traps: _jcoComponentRecordTrapContext }"
            }
            Self::ThreadControl => {
                "lookup: _jcoComponentStateLookupContext, registers: CURRENT_TASK_META, AsyncThread, RuntimeError: WebAssembly.RuntimeError"
            }
            Self::ThreadNew => {
                "lookup: _jcoComponentStateLookupContext, registers: CURRENT_TASK_META, AsyncThread, RuntimeError: WebAssembly.RuntimeError, start: _jcoThreadStartChecks"
            }
            Self::ThreadStart => "WebAssembly",
            Self::SubtaskDrop => {
                "lookup: _jcoComponentStateLookupContext, AsyncSubtask, RuntimeError: WebAssembly.RuntimeError"
            }
            Self::MayBlock => {
                "typeof WebAssembly === 'undefined' ? false : { Global: WebAssembly.Global }"
            }
            Self::BlockingDepth => {
                "typeof WebAssembly === 'undefined' ? false : { Global: WebAssembly.Global }"
            }
            Self::Tasks => "",
            Self::TaskIds => "",
            Self::ComponentIdxs => "",
            Self::Stack => "",
            Self::Lookup => "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META",
            Self::Clearing => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, taskIds: ASYNC_CURRENT_TASK_IDS, componentIdxs: ASYNC_CURRENT_COMPONENT_IDXS"
            }
            Self::SubtaskClass => {
                "{ RuntimeError: WebAssembly.RuntimeError, lookup: _jcoComponentStateLookupContext, memories: GLOBAL_COMPONENT_MEMORY_MAP, disposeSymbol: symbolDispose }"
            }
            Self::TaskClass => {
                "{ RuntimeError: WebAssemblyRuntimeError, postReturn: _jcoComponentPostReturnTrapContext, traps: _jcoComponentRecordTrapContext, AsyncSubtask, Waitable, lookup: _jcoComponentStateLookupContext, events: ASYNC_EVENT_CODE, determinism: ASYNC_DETERMINISM, scopeCounter: _jcoResourceScopeCounterContext, scopeTasks: RESOURCE_SCOPE_TASKS, clearing: _jcoTaskClearContext, registers: CURRENT_TASK_META, isFutureValue: _jcoTaskFuturePredicate }"
            }
            Self::Creation => {
                "AsyncTask, AsyncThread, tasks: ASYNC_TASKS_BY_COMPONENT_IDX, taskIds: ASYNC_CURRENT_TASK_IDS, componentIdxs: ASYNC_CURRENT_COMPONENT_IDXS"
            }
            Self::Trap => "RuntimeError: WebAssemblyRuntimeError",
            Self::Return => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, RuntimeError: WebAssemblyRuntimeError"
            }
            Self::Cancellation => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext"
            }
            Self::SubtaskCancellation => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext, AsyncSubtask, RuntimeError: WebAssembly.RuntimeError"
            }
            Self::Driver => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, WaitableSet, events: ASYNC_EVENT_CODE, strictNumeric: _jcoStrictNumericContext"
            }
            Self::Lower => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext, AsyncTask, mayLeave: _jcoComponentMayLeaveContext, events: ASYNC_EVENT_CODE"
            }
            Self::Compat => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext, creation: _jcoTaskCreateContext, mayLeave: _jcoComponentMayLeaveContext, events: ASYNC_EVENT_CODE"
            }
            Self::SymmetricEnter => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext, creation: _jcoTaskCreateContext, mayBlock: CURRENT_TASK_MAY_BLOCK, stack: SYMMETRIC_SYNC_GUEST_CALL_STACK"
            }
            Self::SymmetricExit => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext, mayBlock: CURRENT_TASK_MAY_BLOCK, stack: SYMMETRIC_SYNC_GUEST_CALL_STACK"
            }
            Self::FuturePredicate => unreachable!(),
        };
        if let Some(init) = self.initializer() {
            let initialize = init.local_name;
            uwriteln!(output, "const {local} = {initialize}({properties});");
        } else {
            uwriteln!(output, "const {local} = {{ {properties} }};");
        }
    }
}
pub(crate) fn import(intrinsic: AsyncTaskIntrinsic) -> Option<RuntimeImport> {
    use AsyncTaskIntrinsic::*;
    use RuntimeImportKind as K;
    let (export, context, kind) = match intrinsic {
        CurrentTaskMayBlock => (
            "initializeCurrentTaskMayBlock",
            Some(RuntimeContextIntrinsic::Task(TaskContext::MayBlock)),
            K::InitializedValue,
        ),
        AsyncBlockingCallDepth => (
            "initializeAsyncBlockingCallDepth",
            Some(RuntimeContextIntrinsic::Task(TaskContext::BlockingDepth)),
            K::InitializedValue,
        ),
        AsyncBlockedConstant => ("asyncBlockedCode", None, K::Value),
        AsyncSubtaskClass => (
            "initializeAsyncSubtaskClass",
            Some(RuntimeContextIntrinsic::Task(TaskContext::SubtaskClass)),
            K::InitializedConstructor,
        ),
        AsyncTaskClass => (
            "initializeAsyncTaskClass",
            Some(RuntimeContextIntrinsic::Task(TaskContext::TaskClass)),
            K::InitializedConstructor,
        ),
        GlobalAsyncCurrentTaskMap => (
            "initializeTasksByComponent",
            Some(RuntimeContextIntrinsic::Task(TaskContext::Tasks)),
            K::InitializedValue,
        ),
        GlobalAsyncCurrentTaskIds => (
            "initializeCurrentTaskIds",
            Some(RuntimeContextIntrinsic::Task(TaskContext::TaskIds)),
            K::InitializedValue,
        ),
        GlobalAsyncCurrentComponentIdxs => (
            "initializeCurrentComponentIdxs",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ComponentIdxs)),
            K::InitializedValue,
        ),
        SymmetricSyncGuestCallStack => (
            "initializeSymmetricSyncGuestCallStack",
            Some(RuntimeContextIntrinsic::Task(TaskContext::Stack)),
            K::InitializedValue,
        ),
        ContextGet => (
            "contextGet",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadLookup)),
            K::Call,
        ),
        ContextSet => (
            "contextSet",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadLookup)),
            K::Call,
        ),
        GetCurrentTask => (
            "getCurrentTask",
            Some(RuntimeContextIntrinsic::Task(TaskContext::Lookup)),
            K::Call,
        ),
        SubtaskCancel => (
            "subtaskCancel",
            Some(RuntimeContextIntrinsic::Task(TaskContext::SubtaskCancellation)),
            K::Call,
        ),
        SubtaskDrop => (
            "subtaskDrop",
            Some(RuntimeContextIntrinsic::Task(TaskContext::SubtaskDrop)),
            K::Call,
        ),
        TaskCancel => (
            "taskCancel",
            Some(RuntimeContextIntrinsic::Task(TaskContext::Cancellation)),
            K::Call,
        ),
        TaskReturn => (
            "taskReturn",
            Some(RuntimeContextIntrinsic::Task(TaskContext::Return)),
            K::Call,
        ),
        UnpackCallbackResult => (
            "unpackCallbackResult",
            Some(RuntimeContextIntrinsic::Task(TaskContext::Trap)),
            K::Call,
        ),
        DriverLoop => (
            "driverLoop",
            Some(RuntimeContextIntrinsic::Task(TaskContext::Driver)),
            K::Call,
        ),
        LowerImport => (
            "lowerImport",
            Some(RuntimeContextIntrinsic::Task(TaskContext::Lower)),
            K::Call,
        ),
        LowerImportBackwardsCompat => (
            "lowerImportBackwardsCompat",
            Some(RuntimeContextIntrinsic::Task(TaskContext::Compat)),
            K::Call,
        ),
        EnterSymmetricSyncGuestCall => (
            "symmetricSyncGuestCallEnter",
            Some(RuntimeContextIntrinsic::Task(TaskContext::SymmetricEnter)),
            K::Call,
        ),
        ExitSymmetricSyncGuestCall => (
            "symmetricSyncGuestCallExit",
            Some(RuntimeContextIntrinsic::Task(TaskContext::SymmetricExit)),
            K::Call,
        ),
        AsyncThreadClass => (
            "initializeAsyncThreadClass",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadClass)),
            K::InitializedConstructor,
        ),
        GetCurrentThread => (
            "getCurrentThread",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadLookup)),
            K::Call,
        ),
        CurrentThreadOrThrow => (
            "currentThreadOrThrow",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadLookup)),
            K::Call,
        ),
        CreateNewCurrentImplicitThread => (
            "createNewCurrentImplicitThread",
            Some(RuntimeContextIntrinsic::Task(TaskContext::Creation)),
            K::Call,
        ),
        ClearCurrentThread => (
            "clearCurrentThread",
            Some(RuntimeContextIntrinsic::Task(TaskContext::Clearing)),
            K::Call,
        ),
        ThreadYield => (
            "asyncYield",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadControl)),
            K::Call,
        ),
        ThreadIndex => (
            "threadIndex",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadLookup)),
            K::Call,
        ),
        ThreadNewIndirect => (
            "threadNewIndirect",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadNew)),
            K::Call,
        ),
        ThreadSuspend => (
            "threadSuspend",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadControl)),
            K::Call,
        ),
        ThreadResumeLater => (
            "threadResumeLater",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadControl)),
            K::Call,
        ),
        ThreadSuspendThenResume => (
            "threadSuspendThenResume",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadControl)),
            K::Call,
        ),
        ThreadYieldThenResume => (
            "threadYieldThenResume",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadControl)),
            K::Call,
        ),
        ThreadSuspendThenPromote => (
            "threadSuspendThenPromote",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadControl)),
            K::Call,
        ),
        ThreadYieldThenPromote => (
            "threadYieldThenPromote",
            Some(RuntimeContextIntrinsic::Task(TaskContext::ThreadControl)),
            K::Call,
        ),
    };
    Some(RuntimeImport {
        suffix: "intrinsics/async-task",
        export,
        context,
        kind,
    })
}
pub(crate) fn discover(intrinsic: Intrinsic, args: &RenderIntrinsicsArgs<'_>) {
    if let Some(import) = super::ExternalRuntime::import(intrinsic)
        && let Some(context) = import.context
    {
        let mut contexts = Vec::new();
        context.collect(&mut contexts);
        if contexts.contains(&RuntimeContextIntrinsic::Task(TaskContext::TaskClass)) {
            args.require_intrinsic(AsyncFutureIntrinsic::FutureValueClass);
        }
    }
}
#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::intrinsics::runtime::{self, IntrinsicBinding};
    use crate::{TranspileOpts, intrinsics::render_intrinsics};
    fn generated(selected: impl IntoIterator<Item = Intrinsic>) -> String {
        let mut intrinsics = selected.into_iter().collect();
        let opts = TranspileOpts::builder().name("task".into()).build();
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
    fn task_variants_use_named_exports_and_actual_owners_once() {
        use AsyncTaskIntrinsic::*;
        let variants = [
            AsyncThreadClass,
            GetCurrentThread,
            CurrentThreadOrThrow,
            CreateNewCurrentImplicitThread,
            ClearCurrentThread,
            ThreadYield,
            ThreadIndex,
            ThreadNewIndirect,
            ThreadResumeLater,
            ThreadSuspend,
            ThreadSuspendThenResume,
            ThreadYieldThenResume,
            ThreadSuspendThenPromote,
            ThreadYieldThenPromote,
            CurrentTaskMayBlock,
            AsyncBlockingCallDepth,
            AsyncBlockedConstant,
            AsyncSubtaskClass,
            AsyncTaskClass,
            GlobalAsyncCurrentTaskMap,
            GlobalAsyncCurrentTaskIds,
            GlobalAsyncCurrentComponentIdxs,
            SymmetricSyncGuestCallStack,
            ContextGet,
            ContextSet,
            GetCurrentTask,
            SubtaskCancel,
            SubtaskDrop,
            TaskCancel,
            TaskReturn,
            UnpackCallbackResult,
            DriverLoop,
            LowerImport,
            LowerImportBackwardsCompat,
            EnterSymmetricSyncGuestCall,
            ExitSymmetricSyncGuestCall,
        ];
        for v in variants {
            assert!(matches!(
                runtime::binding(runtime::select(false), Intrinsic::AsyncTask(v)),
                IntrinsicBinding::Inline { .. }
            ));
            assert!(matches!(
                runtime::binding(runtime::select(true), Intrinsic::AsyncTask(v)),
                IntrinsicBinding::Imported { .. }
            ));
        }
        let source = generated(variants.map(Intrinsic::AsyncTask));
        for omitted in [
            "class AsyncTask",
            "class AsyncSubtask",
            "function getCurrentTask(",
            "function createNewCurrentTask(",
        ] {
            assert!(!source.contains(omitted), "{omitted}");
        }
        for once in [
            "const AsyncTask = _jcoInitializeAsyncTaskClass(",
            "const AsyncSubtask = _jcoInitializeAsyncSubtaskClass(",
            "const ASYNC_TASKS_BY_COMPONENT_IDX = _jcoInitializeTasksByComponent();",
        ] {
            assert_eq!(source.matches(once).count(), 1, "{once}");
        }
        assert!(source.contains("class FutureValue"));
        assert!(source.contains("value => value instanceof FutureValue"));
    }
    #[test]
    fn callback_binding_preserves_plain_and_suspending_receivers() {
        let intrinsic = Intrinsic::AsyncTask(AsyncTaskIntrinsic::EnterSymmetricSyncGuestCall);
        let name = intrinsic.name();
        assert_eq!(runtime::select(false).callback_reference(intrinsic), name);
        assert_eq!(
            runtime::select(false).callback_reference_with_receiver(intrinsic, "null"),
            name
        );
        assert_eq!(
            runtime::select(true).callback_reference(intrinsic),
            format!("{name}.bind(void 0, _jcoTaskSymmetricEnterContext)")
        );
        assert_eq!(
            runtime::select(true).callback_reference_with_receiver(intrinsic, "null"),
            format!("{name}.bind(null, _jcoTaskSymmetricEnterContext)")
        );
    }
    #[test]
    fn pure_lookup_and_state_do_not_select_classes_or_optional_globals() {
        for v in [
            AsyncTaskIntrinsic::GetCurrentTask,
            AsyncTaskIntrinsic::GlobalAsyncCurrentTaskMap,
            AsyncTaskIntrinsic::AsyncBlockedConstant,
        ] {
            let source = generated([Intrinsic::AsyncTask(v)]);
            for omitted in [
                "class FutureValue",
                "_jcoTaskFuturePredicate",
                "_jcoInitializeAsyncTaskClass",
                "_jcoInitializeAsyncSubtaskClass",
                "WebAssembly.Global",
            ] {
                assert!(!source.contains(omitted), "{omitted}");
            }
        }
    }
}
