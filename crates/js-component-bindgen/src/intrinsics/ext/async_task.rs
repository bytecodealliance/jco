//! Named async-task operations and their actual selected per-store owners.
use super::{
    ComponentContext, CoreContext, RuntimeContext, RuntimeImport, RuntimeImportKind,
    RuntimeInitializer, WaitableContext,
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
    pub(crate) fn dependencies(self) -> &'static [RuntimeContext] {
        use RuntimeContext::{Component, Core, Task, Waitable};
        match self {
            Self::ThreadLookup => &[
                Component(ComponentContext::StateLookup),
                Core(CoreContext::GlobalCurrentTaskMeta),
            ],
            Self::ThreadClass => &[
                Task(Self::ThreadLookup),
                Component(ComponentContext::RecordTrap),
            ],
            Self::ThreadControl => &[Task(Self::ThreadLookup), Task(Self::ThreadClass)],
            Self::ThreadNew => &[Task(Self::ThreadControl), Task(Self::ThreadStart)],
            Self::SubtaskDrop => &[
                Task(Self::SubtaskClass),
                Component(ComponentContext::StateLookup),
            ],
            Self::Lookup => &[Task(Self::Tasks), Core(CoreContext::GlobalCurrentTaskMeta)],
            Self::Clearing => &[
                Task(Self::Tasks),
                Task(Self::TaskIds),
                Task(Self::ComponentIdxs),
            ],
            Self::SubtaskClass => &[
                Component(ComponentContext::StateLookup),
                Core(CoreContext::GlobalComponentMemoryMap),
                Core(CoreContext::SymbolDispose),
            ],
            Self::TaskClass => &[
                Task(Self::SubtaskClass),
                Component(ComponentContext::PostReturnTrap),
                Component(ComponentContext::RecordTrap),
                Waitable(WaitableContext::Class),
                Component(ComponentContext::StateLookup),
                Core(CoreContext::WebAssemblyRuntimeError),
                Core(CoreContext::AsyncEventCodeEnum),
                Core(CoreContext::GlobalAsyncDeterminism),
                RuntimeContext::ResourceScopeCounter,
                RuntimeContext::ResourceScopeTasks,
                Task(Self::Clearing),
                Core(CoreContext::GlobalCurrentTaskMeta),
                Task(Self::FuturePredicate),
            ],
            Self::Creation => &[
                Task(Self::TaskClass),
                Task(Self::ThreadClass),
                Task(Self::Clearing),
            ],
            Self::Trap => &[Core(CoreContext::WebAssemblyRuntimeError)],
            Self::Return => &[
                Task(Self::Lookup),
                Core(CoreContext::WebAssemblyRuntimeError),
            ],
            Self::Cancellation => &[Task(Self::Lookup), Component(ComponentContext::StateLookup)],
            Self::SubtaskCancellation => &[Task(Self::Cancellation), Task(Self::SubtaskClass)],
            Self::Driver => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
                Waitable(WaitableContext::SetClass),
                Core(CoreContext::AsyncEventCodeEnum),
                RuntimeContext::StrictNumeric,
            ],
            Self::Lower => &[
                Task(Self::Lookup),
                Component(ComponentContext::StateLookup),
                Component(ComponentContext::MayLeave),
                Task(Self::TaskClass),
                Core(CoreContext::AsyncEventCodeEnum),
            ],
            Self::Compat => &[
                Task(Self::Lookup),
                Component(ComponentContext::StateLookup),
                Component(ComponentContext::MayLeave),
                Task(Self::Creation),
                Core(CoreContext::AsyncEventCodeEnum),
            ],
            Self::SymmetricEnter => &[
                Task(Self::Lookup),
                Component(ComponentContext::StateLookup),
                Task(Self::Creation),
                Task(Self::MayBlock),
                Task(Self::Stack),
            ],
            Self::SymmetricExit => &[
                Task(Self::Lookup),
                Component(ComponentContext::StateLookup),
                Task(Self::MayBlock),
                Task(Self::Stack),
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

    let (export, context, kind) = match intrinsic {
        CurrentTaskMayBlock => (
            "initializeCurrentTaskMayBlock",
            Some(RuntimeContext::Task(TaskContext::MayBlock)),
            RuntimeImportKind::InitializedValue,
        ),
        AsyncBlockingCallDepth => (
            "initializeAsyncBlockingCallDepth",
            Some(RuntimeContext::Task(TaskContext::BlockingDepth)),
            RuntimeImportKind::InitializedValue,
        ),
        AsyncBlockedConstant => ("asyncBlockedCode", None, RuntimeImportKind::Value),
        AsyncSubtaskClass => (
            "initializeAsyncSubtaskClass",
            Some(RuntimeContext::Task(TaskContext::SubtaskClass)),
            RuntimeImportKind::InitializedConstructor,
        ),
        AsyncTaskClass => (
            "initializeAsyncTaskClass",
            Some(RuntimeContext::Task(TaskContext::TaskClass)),
            RuntimeImportKind::InitializedConstructor,
        ),
        GlobalAsyncCurrentTaskMap => (
            "initializeTasksByComponent",
            Some(RuntimeContext::Task(TaskContext::Tasks)),
            RuntimeImportKind::InitializedValue,
        ),
        GlobalAsyncCurrentTaskIds => (
            "initializeCurrentTaskIds",
            Some(RuntimeContext::Task(TaskContext::TaskIds)),
            RuntimeImportKind::InitializedValue,
        ),
        GlobalAsyncCurrentComponentIdxs => (
            "initializeCurrentComponentIdxs",
            Some(RuntimeContext::Task(TaskContext::ComponentIdxs)),
            RuntimeImportKind::InitializedValue,
        ),
        SymmetricSyncGuestCallStack => (
            "initializeSymmetricSyncGuestCallStack",
            Some(RuntimeContext::Task(TaskContext::Stack)),
            RuntimeImportKind::InitializedValue,
        ),
        ContextGet => (
            "contextGet",
            Some(RuntimeContext::Task(TaskContext::ThreadLookup)),
            RuntimeImportKind::Call,
        ),
        ContextSet => (
            "contextSet",
            Some(RuntimeContext::Task(TaskContext::ThreadLookup)),
            RuntimeImportKind::Call,
        ),
        GetCurrentTask => (
            "getCurrentTask",
            Some(RuntimeContext::Task(TaskContext::Lookup)),
            RuntimeImportKind::Call,
        ),
        SubtaskCancel => (
            "subtaskCancel",
            Some(RuntimeContext::Task(TaskContext::SubtaskCancellation)),
            RuntimeImportKind::Call,
        ),
        SubtaskDrop => (
            "subtaskDrop",
            Some(RuntimeContext::Task(TaskContext::SubtaskDrop)),
            RuntimeImportKind::Call,
        ),
        TaskCancel => (
            "taskCancel",
            Some(RuntimeContext::Task(TaskContext::Cancellation)),
            RuntimeImportKind::Call,
        ),
        TaskReturn => (
            "taskReturn",
            Some(RuntimeContext::Task(TaskContext::Return)),
            RuntimeImportKind::Call,
        ),
        UnpackCallbackResult => (
            "unpackCallbackResult",
            Some(RuntimeContext::Task(TaskContext::Trap)),
            RuntimeImportKind::Call,
        ),
        DriverLoop => (
            "driverLoop",
            Some(RuntimeContext::Task(TaskContext::Driver)),
            RuntimeImportKind::Call,
        ),
        LowerImport => (
            "lowerImport",
            Some(RuntimeContext::Task(TaskContext::Lower)),
            RuntimeImportKind::Call,
        ),
        LowerImportBackwardsCompat => (
            "lowerImportBackwardsCompat",
            Some(RuntimeContext::Task(TaskContext::Compat)),
            RuntimeImportKind::Call,
        ),
        EnterSymmetricSyncGuestCall => (
            "symmetricSyncGuestCallEnter",
            Some(RuntimeContext::Task(TaskContext::SymmetricEnter)),
            RuntimeImportKind::Call,
        ),
        ExitSymmetricSyncGuestCall => (
            "symmetricSyncGuestCallExit",
            Some(RuntimeContext::Task(TaskContext::SymmetricExit)),
            RuntimeImportKind::Call,
        ),
        AsyncThreadClass => (
            "initializeAsyncThreadClass",
            Some(RuntimeContext::Task(TaskContext::ThreadClass)),
            RuntimeImportKind::InitializedConstructor,
        ),
        GetCurrentThread => (
            "getCurrentThread",
            Some(RuntimeContext::Task(TaskContext::ThreadLookup)),
            RuntimeImportKind::Call,
        ),
        CurrentThreadOrThrow => (
            "currentThreadOrThrow",
            Some(RuntimeContext::Task(TaskContext::ThreadLookup)),
            RuntimeImportKind::Call,
        ),
        CreateNewCurrentImplicitThread => (
            "createNewCurrentImplicitThread",
            Some(RuntimeContext::Task(TaskContext::Creation)),
            RuntimeImportKind::Call,
        ),
        ClearCurrentThread => (
            "clearCurrentThread",
            Some(RuntimeContext::Task(TaskContext::Clearing)),
            RuntimeImportKind::Call,
        ),
        ThreadYield => (
            "asyncYield",
            Some(RuntimeContext::Task(TaskContext::ThreadControl)),
            RuntimeImportKind::Call,
        ),
        ThreadIndex => (
            "threadIndex",
            Some(RuntimeContext::Task(TaskContext::ThreadLookup)),
            RuntimeImportKind::Call,
        ),
        ThreadNewIndirect => (
            "threadNewIndirect",
            Some(RuntimeContext::Task(TaskContext::ThreadNew)),
            RuntimeImportKind::Call,
        ),
        ThreadSuspend => (
            "threadSuspend",
            Some(RuntimeContext::Task(TaskContext::ThreadControl)),
            RuntimeImportKind::Call,
        ),
        ThreadResumeLater => (
            "threadResumeLater",
            Some(RuntimeContext::Task(TaskContext::ThreadControl)),
            RuntimeImportKind::Call,
        ),
        ThreadSuspendThenResume => (
            "threadSuspendThenResume",
            Some(RuntimeContext::Task(TaskContext::ThreadControl)),
            RuntimeImportKind::Call,
        ),
        ThreadYieldThenResume => (
            "threadYieldThenResume",
            Some(RuntimeContext::Task(TaskContext::ThreadControl)),
            RuntimeImportKind::Call,
        ),
        ThreadSuspendThenPromote => (
            "threadSuspendThenPromote",
            Some(RuntimeContext::Task(TaskContext::ThreadControl)),
            RuntimeImportKind::Call,
        ),
        ThreadYieldThenPromote => (
            "threadYieldThenPromote",
            Some(RuntimeContext::Task(TaskContext::ThreadControl)),
            RuntimeImportKind::Call,
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
        if contexts.contains(&RuntimeContext::Task(TaskContext::TaskClass)) {
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
