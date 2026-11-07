//! Selected waitable constructors and the narrow contexts for their operations.
use super::{
    ComponentContextIntrinsic, CoreContextIntrinsic, RuntimeContextIntrinsic, RuntimeImport,
    RuntimeImportKind, RuntimeInitializer,
};
use crate::{
    intrinsics::{
        Intrinsic, RenderIntrinsicsArgs,
        p3::{host::HostIntrinsic, waitable::WaitableIntrinsic},
    },
    source::Source,
    uwriteln,
};
use std::fmt::Write;

/// Constructors and capability contexts for external waitable intrinsics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum WaitableContextIntrinsic {
    /// The `initializeWaitableClass` constructor factory; a JS helper, not a canonical operation.
    InitializeWaitableClass,
    /// The `initializeWaitableSetClass` constructor factory; a JS helper, not a canonical operation.
    InitializeWaitableSetClass,
    /// Capabilities for `waitableSetNew`, implementing `canon waitable-set.new`.
    WaitableSetNew,
    /// Capabilities for `waitableSetWait`, implementing `canon waitable-set.wait`.
    WaitableSetWait,
    /// Capabilities for `waitableSetPoll`, implementing `canon waitable-set.poll`.
    WaitableSetPoll,
    /// Capabilities for `waitableSetDrop`, implementing `canon waitable-set.drop`.
    WaitableSetDrop,
    /// Capabilities for the `removeWaitableSet` JS helper used by `canon waitable-set.drop`.
    RemoveWaitableSet,
    /// Capabilities for `waitableJoin`, implementing `canon waitable.join`.
    WaitableJoin,
}
impl WaitableContextIntrinsic {
    const ALL: [Self; 8] = [
        Self::InitializeWaitableClass,
        Self::InitializeWaitableSetClass,
        Self::WaitableSetNew,
        Self::WaitableSetWait,
        Self::WaitableSetPoll,
        Self::WaitableSetDrop,
        Self::RemoveWaitableSet,
        Self::WaitableJoin,
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
            Self::InitializeWaitableClass => "Waitable",
            Self::InitializeWaitableSetClass => "WaitableSet",
            Self::WaitableSetNew => "_jcoWaitableSetNewContext",
            Self::WaitableSetWait => "_jcoWaitableSetWaitContext",
            Self::WaitableSetPoll => "_jcoWaitableSetPollContext",
            Self::WaitableSetDrop => "_jcoWaitableSetDropContext",
            Self::RemoveWaitableSet => "_jcoWaitableSetRemoveContext",
            Self::WaitableJoin => "_jcoWaitableJoinContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::InitializeWaitableClass => {
                ("initializeWaitableClass", "_jcoInitializeWaitableClass")
            }
            Self::InitializeWaitableSetClass => (
                "initializeWaitableSetClass",
                "_jcoInitializeWaitableSetClass",
            ),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/waitable",
            export,
            local_name,
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContextIntrinsic] {
        use RuntimeContextIntrinsic::{Component, Core, Waitable};
        match self {
            Self::InitializeWaitableClass => &[],
            Self::InitializeWaitableSetClass => {
                &[Core(CoreContextIntrinsic::InitializeAsyncEventCodes)]
            }
            Self::WaitableSetNew => &[
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Waitable(Self::InitializeWaitableSetClass),
            ],
            Self::WaitableSetWait => &[
                RuntimeContextIntrinsic::Task(super::TaskContextIntrinsic::GetCurrentTask),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Waitable(Self::InitializeWaitableSetClass),
            ],
            Self::WaitableSetPoll => &[
                RuntimeContextIntrinsic::Task(super::TaskContextIntrinsic::GetCurrentTask),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Waitable(Self::InitializeWaitableSetClass),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
            ],
            Self::RemoveWaitableSet => &[Waitable(Self::InitializeWaitableSetClass)],
            Self::WaitableSetDrop => &[
                RuntimeContextIntrinsic::Task(super::TaskContextIntrinsic::GetCurrentTask),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Waitable(Self::InitializeWaitableSetClass),
            ],
            Self::WaitableJoin => &[
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Waitable(Self::InitializeWaitableClass),
                Waitable(Self::InitializeWaitableSetClass),
            ],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(initializer) = self.initializer() {
            let initialize = initializer.local_name;
            let args = if self == Self::InitializeWaitableSetClass {
                "ASYNC_EVENT_CODE"
            } else {
                ""
            };
            uwriteln!(output, "const {local} = {initialize}({args});");
            return;
        }
        // Only the event-writing bridge remains, until host operations migrate at N12.
        let properties = match self {
            Self::WaitableSetNew => "lookup: _jcoComponentStateLookupContext, WaitableSet",
            Self::WaitableSetWait => {
                "RuntimeError: WebAssembly.RuntimeError, lookup: _jcoComponentStateLookupContext, WaitableSet, taskLookup: _jcoTaskLookupContext, storeEventInComponentMemory: args => _storeEventInComponentMemory(args)"
            }
            Self::WaitableSetPoll => {
                "RuntimeError: WebAssembly.RuntimeError, lookup: _jcoComponentStateLookupContext, WaitableSet, taskLookup: _jcoTaskLookupContext, storeEventInComponentMemory: args => _storeEventInComponentMemory(args), events: ASYNC_EVENT_CODE"
            }
            Self::RemoveWaitableSet => "RuntimeError: WebAssembly.RuntimeError, WaitableSet",
            Self::WaitableSetDrop => {
                "RuntimeError: WebAssembly.RuntimeError, lookup: _jcoComponentStateLookupContext, WaitableSet, taskLookup: _jcoTaskLookupContext"
            }
            Self::WaitableJoin => {
                "RuntimeError: WebAssembly.RuntimeError, lookup: _jcoComponentStateLookupContext, Waitable, WaitableSet"
            }
            _ => unreachable!("constructors handled above"),
        };
        uwriteln!(output, "const {local} = {{ {properties} }};");
    }
}

pub(crate) fn import(intrinsic: WaitableIntrinsic) -> RuntimeImport {
    use WaitableIntrinsic::*;
    let (export, context, kind) = match intrinsic {
        WaitableClass => (
            "initializeWaitableClass",
            RuntimeContextIntrinsic::Waitable(WaitableContextIntrinsic::InitializeWaitableClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        WaitableSetClass => (
            "initializeWaitableSetClass",
            RuntimeContextIntrinsic::Waitable(WaitableContextIntrinsic::InitializeWaitableSetClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        WaitableSetNew => (
            "waitableSetNew",
            RuntimeContextIntrinsic::Waitable(WaitableContextIntrinsic::WaitableSetNew),
            RuntimeImportKind::Call,
        ),
        WaitableSetWait => (
            "waitableSetWait",
            RuntimeContextIntrinsic::Waitable(WaitableContextIntrinsic::WaitableSetWait),
            RuntimeImportKind::Call,
        ),
        WaitableSetPoll => (
            "waitableSetPoll",
            RuntimeContextIntrinsic::Waitable(WaitableContextIntrinsic::WaitableSetPoll),
            RuntimeImportKind::Call,
        ),
        WaitableSetDrop => (
            "waitableSetDrop",
            RuntimeContextIntrinsic::Waitable(WaitableContextIntrinsic::WaitableSetDrop),
            RuntimeImportKind::Call,
        ),
        RemoveWaitableSet => (
            "removeWaitableSet",
            RuntimeContextIntrinsic::Waitable(WaitableContextIntrinsic::RemoveWaitableSet),
            RuntimeImportKind::Call,
        ),
        WaitableJoin => (
            "waitableJoin",
            RuntimeContextIntrinsic::Waitable(WaitableContextIntrinsic::WaitableJoin),
            RuntimeImportKind::Call,
        ),
    };
    RuntimeImport {
        suffix: "intrinsics/waitable",
        export,
        context: Some(context),
        kind,
    }
}

pub(crate) fn discover(intrinsic: Intrinsic, args: &RenderIntrinsicsArgs<'_>) {
    if matches!(
        intrinsic,
        Intrinsic::Waitable(
            WaitableIntrinsic::WaitableSetWait | WaitableIntrinsic::WaitableSetPoll
        )
    ) {
        args.require_intrinsic(HostIntrinsic::StoreEventInComponentMemory);
    }
}

#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::{
        TranspileOpts,
        intrinsics::{p3::async_task::AsyncTaskIntrinsic, render_intrinsics},
    };
    use std::collections::BTreeSet;

    fn generated(intrinsic: WaitableIntrinsic) -> (String, BTreeSet<Intrinsic>) {
        let mut intrinsics = BTreeSet::from([Intrinsic::Waitable(intrinsic)]);
        let opts = TranspileOpts::builder().name("waitable".into()).build();
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
    fn waitable_constructors_select_only_their_actual_capabilities() {
        let (source, _) = generated(WaitableIntrinsic::WaitableClass);
        assert!(source.contains("const Waitable = _jcoInitializeWaitableClass();"));
        for unrelated in [
            "ComponentAsyncState",
            "ASYNC_EVENT_CODE",
            "RuntimeError",
            "getCurrentTask",
            "class Waitable",
        ] {
            assert!(!source.contains(unrelated), "{unrelated}");
        }
        let (source, _) = generated(WaitableIntrinsic::WaitableSetClass);
        assert!(
            source
                .contains("const WaitableSet = _jcoInitializeWaitableSetClass(ASYNC_EVENT_CODE);")
        );
        assert!(!source.contains("ComponentAsyncState"));
        assert!(!source.contains("getCurrentTask"));
    }

    #[test]
    fn waitable_operations_share_task_owners_and_keep_only_the_host_bridge() {
        let (source, intrinsics) = generated(WaitableIntrinsic::WaitableSetPoll);
        assert!(!intrinsics.contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask)));
        assert!(!source.contains("function getCurrentTask("));
        assert!(intrinsics.contains(&Intrinsic::Host(HostIntrinsic::StoreEventInComponentMemory)));
        assert!(source.contains("taskLookup: _jcoTaskLookupContext"));
        assert!(
            source.contains(
                "storeEventInComponentMemory: args => _storeEventInComponentMemory(args)"
            )
        );
        assert!(!source.contains("createWaitable: args =>"));
        assert!(!source.contains("function waitableSetPoll("));
        assert_eq!(
            source
                .matches("const Waitable = _jcoInitializeWaitableClass();")
                .count(),
            1
        );
        assert_eq!(
            source
                .matches("const WaitableSet = _jcoInitializeWaitableSetClass(")
                .count(),
            1
        );
        let (source, intrinsics) = generated(WaitableIntrinsic::RemoveWaitableSet);
        assert!(!intrinsics.contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask)));
        for unrelated in ["ASYNC_STATE", "getCurrentTask", "STORE_TRAP"] {
            assert!(!source.contains(unrelated), "{unrelated}");
        }
    }

    #[test]
    fn waitable_trampoline_callbacks_bind_capabilities_before_operands() {
        for (intrinsic, context) in [
            (
                WaitableIntrinsic::WaitableSetNew,
                "_jcoWaitableSetNewContext",
            ),
            (
                WaitableIntrinsic::WaitableSetWait,
                "_jcoWaitableSetWaitContext",
            ),
            (
                WaitableIntrinsic::WaitableSetPoll,
                "_jcoWaitableSetPollContext",
            ),
            (
                WaitableIntrinsic::WaitableSetDrop,
                "_jcoWaitableSetDropContext",
            ),
            (WaitableIntrinsic::WaitableJoin, "_jcoWaitableJoinContext"),
        ] {
            let intrinsic = Intrinsic::Waitable(intrinsic);
            assert_eq!(
                crate::intrinsics::runtime::select(true).bind_callback(intrinsic, "operand"),
                format!("{}.bind(null, {context}, operand)", intrinsic.name())
            );
            assert_eq!(
                crate::intrinsics::runtime::select(false).bind_callback(intrinsic, "operand"),
                format!("{}.bind(null, operand)", intrinsic.name())
            );
        }
    }
}
