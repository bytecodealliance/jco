//! Host-call contexts share the actual task owners and selected platform.
use super::{
    ComponentContextIntrinsic, CoreContextIntrinsic, RuntimeContextIntrinsic, RuntimeImport,
    RuntimeImportKind, RuntimeInitializer, TaskContextIntrinsic,
};
use crate::{
    intrinsics::{RenderIntrinsicsArgs, p3::host::HostIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;

/// Capability contexts for external host-call intrinsics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[allow(clippy::enum_variant_names)]
pub(crate) enum HostContextIntrinsic {
    /// Task lookup, thread creation, and trap capabilities for `prepareCall`.
    PrepareCall,
    /// Task, component, and async driver capabilities for `asyncStartCall`.
    AsyncStartCall,
    /// Task, component, and driver capabilities for `syncStartCall`.
    SyncStartCall,
}
impl HostContextIntrinsic {
    const ALL: [Self; 3] = [Self::PrepareCall, Self::AsyncStartCall, Self::SyncStartCall];
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
            Self::PrepareCall => "_jcoHostPrepareContext",
            Self::AsyncStartCall => "_jcoHostAsyncStartContext",
            Self::SyncStartCall => "_jcoHostSyncStartContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        None
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContextIntrinsic] {
        use RuntimeContextIntrinsic::{Component, Core, Task};
        match self {
            Self::PrepareCall => &[
                Task(TaskContextIntrinsic::GetCurrentTask),
                Task(TaskContextIntrinsic::CreateNewCurrentImplicitThread),
                Task(TaskContextIntrinsic::InitializeCurrentTaskMayBlock),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
            ],
            Self::AsyncStartCall => &[
                Task(TaskContextIntrinsic::GetCurrentTask),
                Task(TaskContextIntrinsic::InitializeCurrentComponentIdxs),
                Task(TaskContextIntrinsic::InitializeAsyncBlockingCallDepth),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Task(TaskContextIntrinsic::DriverLoop),
                Core(CoreContextIntrinsic::InitializeComponentMemoryMap),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
            ],
            Self::SyncStartCall => &[
                Task(TaskContextIntrinsic::GetCurrentTask),
                Task(TaskContextIntrinsic::InitializeCurrentComponentIdxs),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Task(TaskContextIntrinsic::DriverLoop),
            ],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        let lookup = "tasks: ASYNC_TASKS_BY_COMPONENT_IDX, registers: CURRENT_TASK_META";
        let properties = match self {
            Self::PrepareCall => format!(
                "{lookup}, creation: _jcoTaskCreateContext, mayBlock: CURRENT_TASK_MAY_BLOCK, RuntimeError: WebAssemblyRuntimeError"
            ),
            Self::AsyncStartCall | Self::SyncStartCall => {
                // Keep promising optional and lazy, with the selected namespace
                // as its receiver. Capturing its function here would read it
                // before a call needs JSPI and would lose that receiver.
                let mut properties = format!(
                    "{lookup}, componentIdxs: ASYNC_CURRENT_COMPONENT_IDXS, lookup: _jcoComponentStateLookupContext, driver: _jcoTaskDriverContext, platform: typeof WebAssembly === 'undefined' ? undefined : WebAssembly"
                );
                if self == Self::AsyncStartCall {
                    properties.push_str(
                        ", blockingDepth: ASYNC_BLOCKING_CALL_DEPTH, memories: GLOBAL_COMPONENT_MEMORY_MAP, events: ASYNC_EVENT_CODE",
                    );
                }
                properties
            }
        };
        uwriteln!(output, "const {local} = {{ {properties} }};");
    }
}

pub(crate) fn import(intrinsic: HostIntrinsic) -> RuntimeImport {
    let (export, context) = match intrinsic {
        HostIntrinsic::PrepareCall => ("prepareCall", Some(HostContextIntrinsic::PrepareCall)),
        HostIntrinsic::AsyncStartCall => {
            ("asyncStartCall", Some(HostContextIntrinsic::AsyncStartCall))
        }
        HostIntrinsic::SyncStartCall => {
            ("syncStartCall", Some(HostContextIntrinsic::SyncStartCall))
        }
        HostIntrinsic::StoreEventInComponentMemory => ("storeEventInComponentMemory", None),
    };
    RuntimeImport {
        suffix: "intrinsics/host",
        export,
        context: context.map(RuntimeContextIntrinsic::Host),
        kind: RuntimeImportKind::Call,
    }
}

#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::{
        TranspileOpts,
        intrinsics::{
            Intrinsic, render_intrinsics,
            runtime::{self, IntrinsicBinding},
        },
    };

    fn generated(selected: impl IntoIterator<Item = HostIntrinsic>) -> String {
        let mut intrinsics = selected.into_iter().map(Intrinsic::Host).collect();
        let opts = TranspileOpts::builder().name("host".into()).build();
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
    fn event_writer_has_no_context_or_state_initializers() {
        let intrinsic = Intrinsic::Host(HostIntrinsic::StoreEventInComponentMemory);
        let source = generated([HostIntrinsic::StoreEventInComponentMemory]);
        assert_eq!(
            runtime::select(true).call(intrinsic, "event"),
            "_storeEventInComponentMemory(event)"
        );
        let mut imports = Source::default();
        super::super::ExternalRuntime.render_imports(
            &mut imports,
            &std::collections::BTreeSet::from([intrinsic]),
            "custom-runtime",
        );
        assert!(
            imports
                .to_string()
                .contains("storeEventInComponentMemory as _storeEventInComponentMemory")
        );
        for absent in [
            "const ",
            "WebAssembly",
            "AsyncTask",
            "CURRENT_TASK",
            "function _storeEvent",
        ] {
            assert!(!source.contains(absent), "{absent}");
        }
    }

    #[test]
    fn start_contexts_share_owners_without_selecting_task_constructors_or_reading_jspi() {
        let source = generated([HostIntrinsic::AsyncStartCall, HostIntrinsic::SyncStartCall]);
        assert!(
            source
                .contains("platform: typeof WebAssembly === 'undefined' ? undefined : WebAssembly")
        );
        assert!(source.contains("registers: CURRENT_TASK_META"));
        assert!(source.contains("memories: GLOBAL_COMPONENT_MEMORY_MAP"));
        assert!(source.contains("blockingDepth: ASYNC_BLOCKING_CALL_DEPTH"));
        assert_eq!(source.matches("const CURRENT_TASK_META = ").count(), 1);
        assert_eq!(
            source
                .matches("const ASYNC_TASKS_BY_COMPONENT_IDX = ")
                .count(),
            1
        );
        for absent in [
            "WebAssembly.promising",
            "initializeAsyncTaskClass",
            "initializeAsyncSubtaskClass",
            "_jcoTaskCreateContext",
            "function _asyncStartCall(",
        ] {
            assert!(!source.contains(absent), "{absent}");
        }
        let sync = generated([HostIntrinsic::SyncStartCall]);
        assert!(!sync.contains("ASYNC_BLOCKING_CALL_DEPTH"));
        assert!(!sync.contains("GLOBAL_COMPONENT_MEMORY_MAP"));
    }

    #[test]
    fn host_callbacks_bind_context_before_metadata_and_keep_inline_receivers() {
        for (variant, context) in [
            (HostIntrinsic::PrepareCall, "_jcoHostPrepareContext"),
            (HostIntrinsic::AsyncStartCall, "_jcoHostAsyncStartContext"),
            (HostIntrinsic::SyncStartCall, "_jcoHostSyncStartContext"),
        ] {
            let intrinsic = Intrinsic::Host(variant);
            let IntrinsicBinding::Imported { .. } =
                runtime::binding(runtime::select(true), intrinsic)
            else {
                panic!("missing host mapping")
            };
            let import = super::import(variant);
            assert_eq!(import.suffix, "intrinsics/host");
            assert_eq!(
                runtime::select(true).bind_callback(intrinsic, "metadata, getter"),
                format!(
                    "{}.bind(null, {context}, metadata, getter)",
                    intrinsic.name()
                )
            );
            assert_eq!(
                runtime::select(false).bind_callback(intrinsic, "metadata, getter"),
                format!("{}.bind(null, metadata, getter)", intrinsic.name())
            );
        }
        let prepare = generated([HostIntrinsic::PrepareCall]);
        assert_eq!(
            prepare
                .matches("const AsyncTask = _jcoInitializeAsyncTaskClass(")
                .count(),
            1
        );
        assert_eq!(
            prepare
                .matches("const AsyncSubtask = _jcoInitializeAsyncSubtaskClass(")
                .count(),
            1
        );
        assert!(prepare.contains("creation: _jcoTaskCreateContext, mayBlock: CURRENT_TASK_MAY_BLOCK, RuntimeError: WebAssemblyRuntimeError"));
        assert!(!prepare.contains("promising"));
    }
}
