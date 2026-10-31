//! Selected waitable constructors and the narrow contexts for their operations.
use super::{
    ComponentContext, CoreContext, RuntimeContext, RuntimeImport, RuntimeImportKind,
    RuntimeInitializer,
};
use crate::{
    intrinsics::{RenderIntrinsicsArgs, p3::waitable::WaitableIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum WaitableContext {
    Class,
    SetClass,
    New,
    Wait,
    Poll,
    Drop,
    Remove,
    Join,
}
impl WaitableContext {
    const ALL: [Self; 8] = [
        Self::Class,
        Self::SetClass,
        Self::New,
        Self::Wait,
        Self::Poll,
        Self::Drop,
        Self::Remove,
        Self::Join,
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
            Self::Class => "Waitable",
            Self::SetClass => "WaitableSet",
            Self::New => "_jcoWaitableSetNewContext",
            Self::Wait => "_jcoWaitableSetWaitContext",
            Self::Poll => "_jcoWaitableSetPollContext",
            Self::Drop => "_jcoWaitableSetDropContext",
            Self::Remove => "_jcoWaitableSetRemoveContext",
            Self::Join => "_jcoWaitableJoinContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::Class => ("initializeWaitableClass", "_jcoInitializeWaitableClass"),
            Self::SetClass => (
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
    pub(crate) fn dependencies(self) -> &'static [RuntimeContext] {
        use RuntimeContext::{Component as C, Core, Waitable as W};
        match self {
            Self::Class => &[],
            Self::SetClass => &[Core(CoreContext::AsyncEventCodeEnum)],
            Self::New => &[C(ComponentContext::StateLookup), W(Self::SetClass)],
            Self::Wait => &[
                C(ComponentContext::StateLookup),
                W(Self::SetClass),
                RuntimeContext::Task(super::TaskContext::Lookup),
            ],
            Self::Poll => &[
                RuntimeContext::Task(super::TaskContext::Lookup),
                C(ComponentContext::StateLookup),
                W(Self::SetClass),
                Core(CoreContext::AsyncEventCodeEnum),
            ],
            Self::Remove => &[W(Self::SetClass)],
            Self::Drop => &[
                C(ComponentContext::StateLookup),
                W(Self::SetClass),
                RuntimeContext::Task(super::TaskContext::Lookup),
            ],
            Self::Join => &[
                C(ComponentContext::StateLookup),
                W(Self::Class),
                W(Self::SetClass),
            ],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(initializer) = self.initializer() {
            let initialize = initializer.local_name;
            let args = if self == Self::SetClass {
                "ASYNC_EVENT_CODE"
            } else {
                ""
            };
            uwriteln!(output, "const {local} = {initialize}({args});");
            return;
        }
        let properties = match self {
            Self::New => "lookup: _jcoComponentStateLookupContext, WaitableSet",
            Self::Wait => {
                "RuntimeError: WebAssembly.RuntimeError, lookup: _jcoComponentStateLookupContext, WaitableSet, taskLookup: _jcoTaskLookupContext"
            }
            Self::Poll => {
                "RuntimeError: WebAssembly.RuntimeError, lookup: _jcoComponentStateLookupContext, WaitableSet, taskLookup: _jcoTaskLookupContext, events: ASYNC_EVENT_CODE"
            }
            Self::Remove => "RuntimeError: WebAssembly.RuntimeError, WaitableSet",
            Self::Drop => {
                "RuntimeError: WebAssembly.RuntimeError, lookup: _jcoComponentStateLookupContext, WaitableSet, taskLookup: _jcoTaskLookupContext"
            }
            Self::Join => {
                "RuntimeError: WebAssembly.RuntimeError, lookup: _jcoComponentStateLookupContext, Waitable, WaitableSet"
            }
            _ => unreachable!("constructors handled above"),
        };
        uwriteln!(output, "const {local} = {{ {properties} }};");
    }
}

pub(crate) fn import(intrinsic: WaitableIntrinsic) -> RuntimeImport {
    use RuntimeImportKind as K;
    use WaitableContext as C;
    use WaitableIntrinsic::*;
    let (export, context, kind) = match intrinsic {
        WaitableClass => (
            "initializeWaitableClass",
            RuntimeContext::Waitable(C::Class),
            K::InitializedConstructor,
        ),
        WaitableSetClass => (
            "initializeWaitableSetClass",
            RuntimeContext::Waitable(C::SetClass),
            K::InitializedConstructor,
        ),
        WaitableSetNew => ("waitableSetNew", RuntimeContext::Waitable(C::New), K::Call),
        WaitableSetWait => (
            "waitableSetWait",
            RuntimeContext::Waitable(C::Wait),
            K::Call,
        ),
        WaitableSetPoll => (
            "waitableSetPoll",
            RuntimeContext::Waitable(C::Poll),
            K::Call,
        ),
        WaitableSetDrop => (
            "waitableSetDrop",
            RuntimeContext::Waitable(C::Drop),
            K::Call,
        ),
        RemoveWaitableSet => (
            "removeWaitableSet",
            RuntimeContext::Waitable(C::Remove),
            K::Call,
        ),
        WaitableJoin => ("waitableJoin", RuntimeContext::Waitable(C::Join), K::Call),
    };
    RuntimeImport {
        suffix: "intrinsics/waitable",
        export,
        context: Some(context),
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
            p3::{async_task::AsyncTaskIntrinsic, host::HostIntrinsic},
            render_intrinsics,
        },
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
    fn waitable_operations_share_task_owners_without_a_host_bridge() {
        let (source, intrinsics) = generated(WaitableIntrinsic::WaitableSetPoll);
        assert!(!intrinsics.contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask)));
        assert!(!source.contains("function getCurrentTask("));
        assert!(!intrinsics.contains(&Intrinsic::Host(HostIntrinsic::StoreEventInComponentMemory)));
        assert!(source.contains("taskLookup: _jcoTaskLookupContext"));
        assert!(!source.contains("storeEventInComponentMemory"));
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
