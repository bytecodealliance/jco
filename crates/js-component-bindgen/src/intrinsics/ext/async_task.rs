//! Named async-task operations and their actual selected per-store owners.
use super::{
    ComponentContextIntrinsic, CoreContextIntrinsic, RuntimeContextIntrinsic, RuntimeImport,
    RuntimeImportKind, RuntimeInitializer, WaitableContextIntrinsic,
};
use crate::{
    intrinsics::{Intrinsic, RenderIntrinsicsArgs, p3::async_task::AsyncTaskIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;

/// State initializers and capability contexts for external task and thread intrinsics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum TaskContextIntrinsic {
    /// Shared capabilities for the `getCurrentThread` and `currentThreadOrThrow` JS helpers,
    /// and for `threadIndex`, `contextGet`, and `contextSet`, implementing
    /// `canon thread.index`, `canon context.get`, and `canon context.set`.
    GetCurrentThread,
    /// The `initializeAsyncThreadClass` constructor factory; a JS helper, not a canonical operation.
    InitializeAsyncThreadClass,
    /// Shared capabilities for `asyncYield`, `threadSuspend`, `threadResumeLater`,
    /// and the `thread*ThenResume` and `thread*ThenPromote` functions, implementing
    /// `canon thread.yield`, `canon thread.suspend`, `canon thread.resume-later`,
    /// and the `canon thread.*-then-resume` and `canon thread.*-then-promote` built-ins.
    ThreadSuspend,
    /// Capabilities for `threadNewIndirect`, implementing `canon thread.new-indirect`.
    ThreadNewIndirect,
    /// The WebAssembly start checks returned by `initializeThreadStartChecks`.
    InitializeThreadStartChecks,
    /// Capabilities for `subtaskDrop`, implementing `canon subtask.drop`.
    SubtaskDrop,
    /// The blocking-permission register returned by `initializeCurrentTaskMayBlock`.
    InitializeCurrentTaskMayBlock,
    /// The blocking-depth register returned by `initializeAsyncBlockingCallDepth`.
    InitializeAsyncBlockingCallDepth,
    /// The component-indexed task map returned by `initializeTasksByComponent`.
    InitializeTasksByComponent,
    /// The current task ID array returned by `initializeCurrentTaskIds`.
    InitializeCurrentTaskIds,
    /// The current component-index array returned by `initializeCurrentComponentIdxs`.
    InitializeCurrentComponentIdxs,
    /// The guest-call stack returned by `initializeSymmetricSyncGuestCallStack`.
    InitializeSymmetricSyncGuestCallStack,
    /// Capabilities for the `getCurrentTask` JS helper.
    GetCurrentTask,
    /// Shared capabilities for the `clearCurrentThread` and `clearCurrentTask` JS helpers.
    ClearCurrentThread,
    /// The `initializeAsyncSubtaskClass` constructor factory; a JS helper, not a canonical operation.
    InitializeAsyncSubtaskClass,
    /// The `initializeAsyncTaskClass` constructor factory; a JS helper, not a canonical operation.
    InitializeAsyncTaskClass,
    /// Shared capabilities for the `createNewCurrentImplicitThread` and `createNewCurrentTask` JS helpers.
    CreateNewCurrentImplicitThread,
    /// Capabilities for the `unpackCallbackResult` JS helper.
    UnpackCallbackResult,
    /// Capabilities for `taskReturn`, implementing `canon task.return`.
    TaskReturn,
    /// Capabilities for `taskCancel`, implementing `canon task.cancel`.
    TaskCancel,
    /// Capabilities for `subtaskCancel`, implementing `canon subtask.cancel`.
    SubtaskCancel,
    /// Capabilities for the `driverLoop` JS helper.
    DriverLoop,
    /// Capabilities for the `lowerImport` JS helper.
    LowerImport,
    /// Capabilities for the `lowerImportBackwardsCompat` JS helper.
    LowerImportBackwardsCompat,
    /// Capabilities for the `symmetricSyncGuestCallEnter` JS helper.
    SymmetricSyncGuestCallEnter,
    /// Capabilities for the `symmetricSyncGuestCallExit` JS helper.
    SymmetricSyncGuestCallExit,
}
impl TaskContextIntrinsic {
    const ALL: [Self; 26] = [
        Self::GetCurrentThread,
        Self::InitializeAsyncThreadClass,
        Self::ThreadSuspend,
        Self::ThreadNewIndirect,
        Self::InitializeThreadStartChecks,
        Self::SubtaskDrop,
        Self::InitializeCurrentTaskMayBlock,
        Self::InitializeAsyncBlockingCallDepth,
        Self::InitializeTasksByComponent,
        Self::InitializeCurrentTaskIds,
        Self::InitializeCurrentComponentIdxs,
        Self::InitializeSymmetricSyncGuestCallStack,
        Self::GetCurrentTask,
        Self::ClearCurrentThread,
        Self::InitializeAsyncSubtaskClass,
        Self::InitializeAsyncTaskClass,
        Self::CreateNewCurrentImplicitThread,
        Self::UnpackCallbackResult,
        Self::TaskReturn,
        Self::TaskCancel,
        Self::SubtaskCancel,
        Self::DriverLoop,
        Self::LowerImport,
        Self::LowerImportBackwardsCompat,
        Self::SymmetricSyncGuestCallEnter,
        Self::SymmetricSyncGuestCallExit,
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
            Self::GetCurrentThread => "_jcoThreadLookupContext",
            Self::InitializeAsyncThreadClass => "AsyncThread",
            Self::ThreadSuspend => "_jcoThreadControlContext",
            Self::ThreadNewIndirect => "_jcoThreadNewContext",
            Self::InitializeThreadStartChecks => "_jcoThreadStartChecks",
            Self::SubtaskDrop => "_jcoSubtaskDropContext",
            Self::InitializeCurrentTaskMayBlock => "CURRENT_TASK_MAY_BLOCK",
            Self::InitializeAsyncBlockingCallDepth => "ASYNC_BLOCKING_CALL_DEPTH",
            Self::InitializeTasksByComponent => "ASYNC_TASKS_BY_COMPONENT_IDX",
            Self::InitializeCurrentTaskIds => "ASYNC_CURRENT_TASK_IDS",
            Self::InitializeCurrentComponentIdxs => "ASYNC_CURRENT_COMPONENT_IDXS",
            Self::InitializeSymmetricSyncGuestCallStack => "SYMMETRIC_SYNC_GUEST_CALL_STACK",
            Self::GetCurrentTask => "_jcoTaskLookupContext",
            Self::ClearCurrentThread => "_jcoTaskClearContext",
            Self::InitializeAsyncSubtaskClass => "AsyncSubtask",
            Self::InitializeAsyncTaskClass => "AsyncTask",
            Self::CreateNewCurrentImplicitThread => "_jcoTaskCreateContext",
            Self::UnpackCallbackResult => "_jcoTaskTrapContext",
            Self::TaskReturn => "_jcoTaskReturnContext",
            Self::TaskCancel => "_jcoTaskCancelContext",
            Self::SubtaskCancel => "_jcoSubtaskCancelContext",
            Self::DriverLoop => "_jcoTaskDriverContext",
            Self::LowerImport => "_jcoTaskLowerImportContext",
            Self::LowerImportBackwardsCompat => "_jcoTaskCompatImportContext",
            Self::SymmetricSyncGuestCallEnter => "_jcoTaskSymmetricEnterContext",
            Self::SymmetricSyncGuestCallExit => "_jcoTaskSymmetricExitContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::InitializeAsyncThreadClass => (
                "initializeAsyncThreadClass",
                "_jcoInitializeAsyncThreadClass",
            ),
            Self::InitializeThreadStartChecks => (
                "initializeThreadStartChecks",
                "_jcoInitializeThreadStartChecks",
            ),
            Self::InitializeCurrentTaskMayBlock => (
                "initializeCurrentTaskMayBlock",
                "_jcoInitializeCurrentTaskMayBlock",
            ),
            Self::InitializeAsyncBlockingCallDepth => (
                "initializeAsyncBlockingCallDepth",
                "_jcoInitializeAsyncBlockingCallDepth",
            ),
            Self::InitializeTasksByComponent => (
                "initializeTasksByComponent",
                "_jcoInitializeTasksByComponent",
            ),
            Self::InitializeCurrentTaskIds => {
                ("initializeCurrentTaskIds", "_jcoInitializeCurrentTaskIds")
            }
            Self::InitializeCurrentComponentIdxs => (
                "initializeCurrentComponentIdxs",
                "_jcoInitializeCurrentComponentIdxs",
            ),
            Self::InitializeSymmetricSyncGuestCallStack => (
                "initializeSymmetricSyncGuestCallStack",
                "_jcoInitializeSymmetricSyncGuestCallStack",
            ),
            Self::InitializeAsyncSubtaskClass => (
                "initializeAsyncSubtaskClass",
                "_jcoInitializeAsyncSubtaskClass",
            ),
            Self::InitializeAsyncTaskClass => {
                ("initializeAsyncTaskClass", "_jcoInitializeAsyncTaskClass")
            }
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/async-task",
            export,
            local_name,
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContextIntrinsic] {
        use RuntimeContextIntrinsic::{Component, Core, Task, Waitable};
        match self {
            Self::GetCurrentThread => &[
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Core(CoreContextIntrinsic::InitializeTaskRegisters),
            ],
            Self::InitializeAsyncThreadClass => &[
                Task(Self::GetCurrentThread),
                Component(ComponentContextIntrinsic::RecordTrap),
            ],
            Self::ThreadSuspend => &[
                Task(Self::GetCurrentThread),
                Task(Self::InitializeAsyncThreadClass),
            ],
            Self::ThreadNewIndirect => &[
                Task(Self::ThreadSuspend),
                Task(Self::InitializeThreadStartChecks),
            ],
            Self::SubtaskDrop => &[
                Task(Self::InitializeAsyncSubtaskClass),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::GetCurrentTask => &[
                Task(Self::InitializeTasksByComponent),
                Core(CoreContextIntrinsic::InitializeTaskRegisters),
            ],
            Self::ClearCurrentThread => &[
                Task(Self::InitializeTasksByComponent),
                Task(Self::InitializeCurrentTaskIds),
                Task(Self::InitializeCurrentComponentIdxs),
            ],
            Self::InitializeAsyncSubtaskClass => &[
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Core(CoreContextIntrinsic::InitializeComponentMemoryMap),
                Core(CoreContextIntrinsic::InitializeSymbolDispose),
            ],
            Self::InitializeAsyncTaskClass => &[
                Task(Self::InitializeAsyncSubtaskClass),
                Component(ComponentContextIntrinsic::PostReturnTrap),
                Component(ComponentContextIntrinsic::RecordTrap),
                Waitable(WaitableContextIntrinsic::InitializeWaitableClass),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Core(CoreContextIntrinsic::InitializeAsyncDeterminism),
                RuntimeContextIntrinsic::InitializeResourceScopeCounter,
                RuntimeContextIntrinsic::InitializeResourceScopeTasks,
                Component(ComponentContextIntrinsic::InitializeStoreTrap),
                Task(Self::ClearCurrentThread),
                Core(CoreContextIntrinsic::InitializeTaskRegisters),
                RuntimeContextIntrinsic::Future(
                    super::FutureContextIntrinsic::InitializeFutureValueClass,
                ),
            ],
            Self::CreateNewCurrentImplicitThread => &[
                Task(Self::InitializeAsyncTaskClass),
                Task(Self::InitializeAsyncThreadClass),
                Task(Self::ClearCurrentThread),
            ],
            Self::UnpackCallbackResult => &[Core(
                CoreContextIntrinsic::InitializeRuntimeErrorConstructor,
            )],
            Self::TaskReturn => &[
                Task(Self::GetCurrentTask),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
            ],
            Self::TaskCancel => &[
                Task(Self::GetCurrentTask),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::SubtaskCancel => &[
                Task(Self::TaskCancel),
                Task(Self::InitializeAsyncSubtaskClass),
            ],
            Self::DriverLoop => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Waitable(WaitableContextIntrinsic::InitializeWaitableSetClass),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                RuntimeContextIntrinsic::NumericConversion,
            ],
            Self::LowerImport => &[
                Task(Self::GetCurrentTask),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Component(ComponentContextIntrinsic::CheckMayLeave),
                Task(Self::InitializeAsyncTaskClass),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
            ],
            Self::LowerImportBackwardsCompat => &[
                Task(Self::GetCurrentTask),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Component(ComponentContextIntrinsic::CheckMayLeave),
                Task(Self::CreateNewCurrentImplicitThread),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
            ],
            Self::SymmetricSyncGuestCallEnter => &[
                Task(Self::GetCurrentTask),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Task(Self::CreateNewCurrentImplicitThread),
                Task(Self::InitializeCurrentTaskMayBlock),
                Task(Self::InitializeSymmetricSyncGuestCallStack),
            ],
            Self::SymmetricSyncGuestCallExit => &[
                Task(Self::GetCurrentTask),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Task(Self::InitializeCurrentTaskMayBlock),
                Task(Self::InitializeSymmetricSyncGuestCallStack),
            ],
            _ => &[],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        let properties = match self {
            Self::GetCurrentThread => {
                "lookup: _jcoComponentStateLookupContext, registers: CURRENT_TASK_META"
            }
            Self::InitializeAsyncThreadClass => {
                "{ lookup: _jcoComponentStateLookupContext, registers: CURRENT_TASK_META, traps: _jcoComponentRecordTrapContext }"
            }
            Self::ThreadSuspend => {
                "lookup: _jcoComponentStateLookupContext, registers: CURRENT_TASK_META, AsyncThread, RuntimeError: WebAssembly.RuntimeError"
            }
            Self::ThreadNewIndirect => {
                "lookup: _jcoComponentStateLookupContext, registers: CURRENT_TASK_META, AsyncThread, RuntimeError: WebAssembly.RuntimeError, start: _jcoThreadStartChecks"
            }
            Self::InitializeThreadStartChecks => "WebAssembly",
            Self::SubtaskDrop => {
                "lookup: _jcoComponentStateLookupContext, AsyncSubtask, RuntimeError: WebAssembly.RuntimeError"
            }
            Self::InitializeCurrentTaskMayBlock => {
                "typeof WebAssembly === 'undefined' ? false : { Global: WebAssembly.Global }"
            }
            Self::InitializeAsyncBlockingCallDepth => {
                "typeof WebAssembly === 'undefined' ? false : { Global: WebAssembly.Global }"
            }
            Self::InitializeTasksByComponent => "",
            Self::InitializeCurrentTaskIds => "",
            Self::InitializeCurrentComponentIdxs => "",
            Self::InitializeSymmetricSyncGuestCallStack => "",
            Self::GetCurrentTask => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META"
            }
            Self::ClearCurrentThread => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, taskIds: ASYNC_CURRENT_TASK_IDS, componentIdxs: ASYNC_CURRENT_COMPONENT_IDXS, checkIdle: () => _checkIdle()"
            }
            Self::InitializeAsyncSubtaskClass => {
                "{ RuntimeError: WebAssembly.RuntimeError, lookup: _jcoComponentStateLookupContext, memories: GLOBAL_COMPONENT_MEMORY_MAP, disposeSymbol: symbolDispose }"
            }
            Self::InitializeAsyncTaskClass => {
                "{ RuntimeError: WebAssemblyRuntimeError, postReturn: _jcoComponentPostReturnTrapContext, traps: _jcoComponentRecordTrapContext, AsyncSubtask, Waitable, lookup: _jcoComponentStateLookupContext, events: ASYNC_EVENT_CODE, determinism: ASYNC_DETERMINISM, scopeCounter: _jcoResourceScopeCounterContext, scopeTasks: RESOURCE_SCOPE_TASKS, storeTrap: STORE_TRAP, clearing: _jcoTaskClearContext, registers: CURRENT_TASK_META, FutureValue }"
            }
            Self::CreateNewCurrentImplicitThread => {
                "AsyncTask, AsyncThread, tasks: ASYNC_TASKS_BY_COMPONENT_IDX, taskIds: ASYNC_CURRENT_TASK_IDS, componentIdxs: ASYNC_CURRENT_COMPONENT_IDXS"
            }
            Self::UnpackCallbackResult => "RuntimeError: WebAssemblyRuntimeError",
            Self::TaskReturn => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, RuntimeError: WebAssemblyRuntimeError"
            }
            Self::TaskCancel => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext"
            }
            Self::SubtaskCancel => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext, AsyncSubtask, RuntimeError: WebAssembly.RuntimeError"
            }
            Self::DriverLoop => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, WaitableSet, events: ASYNC_EVENT_CODE, strictNumeric: _jcoStrictNumericContext, reportTrap: err => _reportTrap(err)"
            }
            Self::LowerImport => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext, AsyncTask, mayLeave: _jcoComponentMayLeaveContext, events: ASYNC_EVENT_CODE"
            }
            Self::LowerImportBackwardsCompat => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext, creation: _jcoTaskCreateContext, mayLeave: _jcoComponentMayLeaveContext, events: ASYNC_EVENT_CODE"
            }
            Self::SymmetricSyncGuestCallEnter => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext, creation: _jcoTaskCreateContext, mayBlock: CURRENT_TASK_MAY_BLOCK, stack: SYMMETRIC_SYNC_GUEST_CALL_STACK"
            }
            Self::SymmetricSyncGuestCallExit => {
                "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META, lookup: _jcoComponentStateLookupContext, mayBlock: CURRENT_TASK_MAY_BLOCK, stack: SYMMETRIC_SYNC_GUEST_CALL_STACK"
            }
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
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::InitializeCurrentTaskMayBlock,
            )),
            RuntimeImportKind::InitializedValue,
        ),
        AsyncBlockingCallDepth => (
            "initializeAsyncBlockingCallDepth",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::InitializeAsyncBlockingCallDepth,
            )),
            RuntimeImportKind::InitializedValue,
        ),
        AsyncBlockedConstant => ("asyncBlockedCode", None, RuntimeImportKind::Value),
        AsyncSubtaskClass => (
            "initializeAsyncSubtaskClass",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::InitializeAsyncSubtaskClass,
            )),
            RuntimeImportKind::InitializedConstructor,
        ),
        AsyncTaskClass => (
            "initializeAsyncTaskClass",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::InitializeAsyncTaskClass,
            )),
            RuntimeImportKind::InitializedConstructor,
        ),
        GlobalAsyncCurrentTaskMap => (
            "initializeTasksByComponent",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::InitializeTasksByComponent,
            )),
            RuntimeImportKind::InitializedValue,
        ),
        GlobalAsyncCurrentTaskIds => (
            "initializeCurrentTaskIds",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::InitializeCurrentTaskIds,
            )),
            RuntimeImportKind::InitializedValue,
        ),
        GlobalAsyncCurrentComponentIdxs => (
            "initializeCurrentComponentIdxs",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::InitializeCurrentComponentIdxs,
            )),
            RuntimeImportKind::InitializedValue,
        ),
        SymmetricSyncGuestCallStack => (
            "initializeSymmetricSyncGuestCallStack",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::InitializeSymmetricSyncGuestCallStack,
            )),
            RuntimeImportKind::InitializedValue,
        ),
        ContextGet => (
            "contextGet",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::GetCurrentThread,
            )),
            RuntimeImportKind::Call,
        ),
        ContextSet => (
            "contextSet",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::GetCurrentThread,
            )),
            RuntimeImportKind::Call,
        ),
        GetCurrentTask => (
            "getCurrentTask",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::GetCurrentTask,
            )),
            RuntimeImportKind::Call,
        ),
        SubtaskCancel => (
            "subtaskCancel",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::SubtaskCancel,
            )),
            RuntimeImportKind::Call,
        ),
        SubtaskDrop => (
            "subtaskDrop",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::SubtaskDrop,
            )),
            RuntimeImportKind::Call,
        ),
        TaskCancel => (
            "taskCancel",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::TaskCancel,
            )),
            RuntimeImportKind::Call,
        ),
        TaskReturn => (
            "taskReturn",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::TaskReturn,
            )),
            RuntimeImportKind::Call,
        ),
        UnpackCallbackResult => (
            "unpackCallbackResult",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::UnpackCallbackResult,
            )),
            RuntimeImportKind::Call,
        ),
        DriverLoop => (
            "driverLoop",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::DriverLoop,
            )),
            RuntimeImportKind::Call,
        ),
        LowerImport => (
            "lowerImport",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::LowerImport,
            )),
            RuntimeImportKind::Call,
        ),
        LowerImportBackwardsCompat => (
            "lowerImportBackwardsCompat",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::LowerImportBackwardsCompat,
            )),
            RuntimeImportKind::Call,
        ),
        EnterSymmetricSyncGuestCall => (
            "symmetricSyncGuestCallEnter",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::SymmetricSyncGuestCallEnter,
            )),
            RuntimeImportKind::Call,
        ),
        ExitSymmetricSyncGuestCall => (
            "symmetricSyncGuestCallExit",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::SymmetricSyncGuestCallExit,
            )),
            RuntimeImportKind::Call,
        ),
        AsyncThreadClass => (
            "initializeAsyncThreadClass",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::InitializeAsyncThreadClass,
            )),
            RuntimeImportKind::InitializedConstructor,
        ),
        GetCurrentThread => (
            "getCurrentThread",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::GetCurrentThread,
            )),
            RuntimeImportKind::Call,
        ),
        CurrentThreadOrThrow => (
            "currentThreadOrThrow",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::GetCurrentThread,
            )),
            RuntimeImportKind::Call,
        ),
        CreateNewCurrentImplicitThread => (
            "createNewCurrentImplicitThread",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::CreateNewCurrentImplicitThread,
            )),
            RuntimeImportKind::Call,
        ),
        ClearCurrentThread => (
            "clearCurrentThread",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::ClearCurrentThread,
            )),
            RuntimeImportKind::Call,
        ),
        ThreadYield => (
            "asyncYield",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::ThreadSuspend,
            )),
            RuntimeImportKind::Call,
        ),
        ThreadIndex => (
            "threadIndex",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::GetCurrentThread,
            )),
            RuntimeImportKind::Call,
        ),
        ThreadNewIndirect => (
            "threadNewIndirect",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::ThreadNewIndirect,
            )),
            RuntimeImportKind::Call,
        ),
        ThreadSuspend => (
            "threadSuspend",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::ThreadSuspend,
            )),
            RuntimeImportKind::Call,
        ),
        ThreadResumeLater => (
            "threadResumeLater",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::ThreadSuspend,
            )),
            RuntimeImportKind::Call,
        ),
        ThreadSuspendThenResume => (
            "threadSuspendThenResume",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::ThreadSuspend,
            )),
            RuntimeImportKind::Call,
        ),
        ThreadYieldThenResume => (
            "threadYieldThenResume",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::ThreadSuspend,
            )),
            RuntimeImportKind::Call,
        ),
        ThreadSuspendThenPromote => (
            "threadSuspendThenPromote",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::ThreadSuspend,
            )),
            RuntimeImportKind::Call,
        ),
        ThreadYieldThenPromote => (
            "threadYieldThenPromote",
            Some(RuntimeContextIntrinsic::Task(
                TaskContextIntrinsic::ThreadSuspend,
            )),
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
/// Requires the inline functions that the contexts of `intrinsic` call back into.
/// They stay inline in every runtime, so no context can name them as a dependency.
pub(crate) fn discover_dependencies(intrinsic: Intrinsic, args: &RenderIntrinsicsArgs<'_>) {
    if let Some(import) = super::ExternalRuntime::import(intrinsic)
        && let Some(context) = import.context
    {
        let mut contexts = Vec::new();
        context.collect(&mut contexts);
        if contexts.contains(&RuntimeContextIntrinsic::Task(
            TaskContextIntrinsic::ClearCurrentThread,
        )) {
            args.require_intrinsic(crate::intrinsics::component::ComponentIntrinsic::CheckIdle);
        }
        if contexts.contains(&RuntimeContextIntrinsic::Task(
            TaskContextIntrinsic::DriverLoop,
        )) {
            args.require_intrinsic(crate::intrinsics::component::ComponentIntrinsic::ReportTrap);
        }
        if contexts.contains(&RuntimeContextIntrinsic::Component(
            ComponentContextIntrinsic::InitializeComponentAsyncStateClass,
        )) {
            args.require_intrinsic(crate::intrinsics::component::ComponentIntrinsic::ReportTrap);
            args.require_intrinsic(crate::intrinsics::component::ComponentIntrinsic::CheckIdle);
        }
    }
}
#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::intrinsics::p3::async_future::AsyncFutureIntrinsic;
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
    fn task_retirement_selects_the_instance_idle_tracker() {
        let source = generated([Intrinsic::AsyncTask(AsyncTaskIntrinsic::ClearCurrentThread)]);
        assert!(source.contains("checkIdle: () => _checkIdle()"));
        assert!(source.contains("function _checkIdle()"));
    }

    #[test]
    fn driver_reports_background_traps_through_the_instance_notifier() {
        let source = generated([Intrinsic::AsyncTask(AsyncTaskIntrinsic::DriverLoop)]);
        assert!(source.contains("reportTrap: err => _reportTrap(err)"));
        assert!(source.contains("function _reportTrap(err)"));
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
        assert!(!source.contains("class FutureValue"));
        assert!(
            source.contains("const FutureValue = _jcoInitializeFutureValueClass(symbolDispose);")
        );
    }

    #[test]
    fn tasks_share_the_selected_future_value_constructor() {
        let source = generated([
            Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass),
            Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureValueClass),
        ]);
        assert_eq!(
            source
                .matches("const FutureValue = _jcoInitializeFutureValueClass(symbolDispose);")
                .count(),
            1
        );
        assert!(!source.contains("value => value instanceof FutureValue"));
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
