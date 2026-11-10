//! Stream operations use per-store table owners and selected constructor identities.
use super::{
    ComponentContextIntrinsic, CoreContextIntrinsic, RuntimeContextIntrinsic, RuntimeImport,
    RuntimeImportKind, RuntimeInitializer, TaskContextIntrinsic,
};
use crate::{
    intrinsics::{RenderIntrinsicsArgs, p3::async_stream::AsyncStreamIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;

/// State initializers and capability contexts for external stream intrinsics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum StreamContextIntrinsic {
    /// State returned by `initializeStreams`.
    InitializeStreams,
    /// State returned by `initializeStreamTables`.
    InitializeStreamTables,
    /// The base endpoint constructor returned by `initializeStreamEndClass`.
    InitializeStreamEndClass,
    /// The readable endpoint constructor returned by `initializeStreamReadableEndClass`.
    InitializeStreamReadableEndClass,
    /// The writable endpoint constructor returned by `initializeStreamWritableEndClass`.
    InitializeStreamWritableEndClass,
    /// The endpoint pair constructor returned by `initializeInternalStreamClass`.
    InitializeInternalStreamClass,
    /// The guest-facing constructor returned by `initializeExternalStreamClass`.
    InitializeExternalStreamClass,
    /// The host adapter constructor returned by `initializeHostStreamClass`.
    InitializeHostStreamClass,
    /// The host value queue constructor returned by `initializePendingValueQueueClass`.
    InitializePendingValueQueueClass,
    /// Capabilities for `createStream`.
    CreateStream,
    /// Shared table capabilities for `addStreamEndToTable`, `deleteStreamEnd`,
    /// and `removeStreamEndFromTable`.
    AddStreamEndToTable,
    /// Shared lookup capabilities for `getStreamEnd` and `streamTransfer`.
    GetStreamEnd,
    /// Capabilities for `streamNew`.
    StreamNew,
    /// Capabilities for `streamNewFromLift`.
    StreamNewFromLift,
    /// Capabilities for `streamRead`.
    StreamRead,
    /// Capabilities for `streamWrite`.
    StreamWrite,
    /// Capabilities for `streamCancelRead`.
    StreamCancelRead,
    /// Capabilities for `streamCancelWrite`.
    StreamCancelWrite,
    /// Capabilities for `streamDropReadable`.
    StreamDropReadable,
    /// Capabilities for `streamDropWritable`.
    StreamDropWritable,
    /// Capabilities for `isStreamLowerableObject`.
    IsStreamLowerableObject,
    /// Capabilities for `genReadFnFromLowerableStream`.
    GenReadFnFromLowerableStream,
    /// Capabilities for `genStreamHostInjectFn`.
    GenStreamHostInjectFn,
}
impl StreamContextIntrinsic {
    const ALL: [Self; 23] = [
        Self::InitializeStreams,
        Self::InitializeStreamTables,
        Self::InitializeStreamEndClass,
        Self::InitializeStreamReadableEndClass,
        Self::InitializeStreamWritableEndClass,
        Self::InitializeInternalStreamClass,
        Self::InitializeExternalStreamClass,
        Self::InitializeHostStreamClass,
        Self::InitializePendingValueQueueClass,
        Self::CreateStream,
        Self::AddStreamEndToTable,
        Self::GetStreamEnd,
        Self::StreamNew,
        Self::StreamNewFromLift,
        Self::StreamRead,
        Self::StreamWrite,
        Self::StreamCancelRead,
        Self::StreamCancelWrite,
        Self::StreamDropReadable,
        Self::StreamDropWritable,
        Self::IsStreamLowerableObject,
        Self::GenReadFnFromLowerableStream,
        Self::GenStreamHostInjectFn,
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
            Self::InitializeStreams => "STREAMS",
            Self::InitializeStreamTables => "STREAM_TABLES",
            Self::InitializeStreamEndClass => "StreamEnd",
            Self::InitializeStreamReadableEndClass => "StreamReadableEnd",
            Self::InitializeStreamWritableEndClass => "StreamWritableEnd",
            Self::InitializeInternalStreamClass => "InternalStream",
            Self::InitializeExternalStreamClass => "Stream",
            Self::InitializeHostStreamClass => "HostStream",
            Self::InitializePendingValueQueueClass => "PendingValueQueue",
            Self::CreateStream => "_jcoStreamCreateContext",
            Self::AddStreamEndToTable => "_jcoStreamTableContext",
            Self::GetStreamEnd => "_jcoStreamEndLookupContext",
            Self::StreamNew => "_jcoStreamNewContext",
            Self::StreamNewFromLift => "_jcoStreamFromLiftContext",
            Self::StreamRead => "_jcoStreamReadContext",
            Self::StreamWrite => "_jcoStreamWriteContext",
            Self::StreamCancelRead => "_jcoStreamCancelReadContext",
            Self::StreamCancelWrite => "_jcoStreamCancelWriteContext",
            Self::StreamDropReadable => "_jcoStreamDropReadContext",
            Self::StreamDropWritable => "_jcoStreamDropWriteContext",
            Self::IsStreamLowerableObject => "_jcoStreamLowerableContext",
            Self::GenReadFnFromLowerableStream => "_jcoStreamSourceContext",
            Self::GenStreamHostInjectFn => "_jcoStreamHostInjectContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::InitializeStreams => ("initializeStreams", "_jcoInitializeStreams"),
            Self::InitializeStreamTables => {
                ("initializeStreamTables", "_jcoInitializeStreamTables")
            }
            Self::InitializeStreamEndClass => {
                ("initializeStreamEndClass", "_jcoInitializeStreamEndClass")
            }
            Self::InitializeStreamReadableEndClass => (
                "initializeStreamReadableEndClass",
                "_jcoInitializeStreamReadableEndClass",
            ),
            Self::InitializeStreamWritableEndClass => (
                "initializeStreamWritableEndClass",
                "_jcoInitializeStreamWritableEndClass",
            ),
            Self::InitializeInternalStreamClass => (
                "initializeInternalStreamClass",
                "_jcoInitializeInternalStreamClass",
            ),
            Self::InitializeExternalStreamClass => (
                "initializeExternalStreamClass",
                "_jcoInitializeExternalStreamClass",
            ),
            Self::InitializeHostStreamClass => {
                ("initializeHostStreamClass", "_jcoInitializeHostStreamClass")
            }
            Self::InitializePendingValueQueueClass => (
                "initializePendingValueQueueClass",
                "_jcoInitializePendingValueQueueClass",
            ),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/stream",
            export,
            local_name,
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContextIntrinsic] {
        use RuntimeContextIntrinsic::{Component, Core, Stream, Task};
        match self {
            Self::InitializeStreams => &[Core(CoreContextIntrinsic::InitializeRepTableClass)],
            Self::InitializeStreamTables => &[],
            Self::InitializeStreamEndClass => &[
                Core(CoreContextIntrinsic::InitializeManagedBufferClass),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Core(CoreContextIntrinsic::InitializeBufferManager),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Component(ComponentContextIntrinsic::TrackHostOperation),
                Task(TaskContextIntrinsic::GetCurrentTask),
            ],
            Self::InitializeStreamReadableEndClass => &[
                Stream(Self::InitializeStreamEndClass),
                Core(CoreContextIntrinsic::InitializeManagedBufferClass),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Core(CoreContextIntrinsic::InitializeBufferManager),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::InitializeStreamWritableEndClass => &[
                Stream(Self::InitializeStreamEndClass),
                Core(CoreContextIntrinsic::InitializeManagedBufferClass),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Core(CoreContextIntrinsic::InitializeBufferManager),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::InitializeInternalStreamClass => &[
                Stream(Self::InitializeStreamReadableEndClass),
                Stream(Self::InitializeStreamWritableEndClass),
            ],
            Self::InitializeExternalStreamClass => &[
                Core(CoreContextIntrinsic::InitializeSymbolDispose),
                Core(CoreContextIntrinsic::InitializeSymbolAsyncIterator),
                Core(CoreContextIntrinsic::InitializeSymbolResourceRep),
            ],
            Self::InitializeHostStreamClass => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::GetStreamEnd),
                Stream(Self::InitializeExternalStreamClass),
            ],
            Self::InitializePendingValueQueueClass => {
                &[Component(ComponentContextIntrinsic::TrackHostOperation)]
            }
            Self::CreateStream => &[
                Stream(Self::InitializeInternalStreamClass),
                Stream(Self::InitializeStreams),
                Stream(Self::InitializeStreamTables),
            ],
            Self::AddStreamEndToTable => &[
                Stream(Self::InitializeStreamTables),
                Stream(Self::InitializeStreamEndClass),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::GetStreamEnd => &[
                Stream(Self::InitializeStreamEndClass),
                Stream(Self::InitializeStreamTables),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::StreamNew => &[
                Task(TaskContextIntrinsic::GetCurrentTask),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::CreateStream),
            ],
            Self::StreamNewFromLift => &[
                Stream(Self::InitializeHostStreamClass),
                Stream(Self::InitializeStreams),
            ],
            Self::StreamRead => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::GetStreamEnd),
                Core(CoreContextIntrinsic::InitializeManagedBufferClass),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Stream(Self::InitializeStreamReadableEndClass),
            ],
            Self::StreamWrite => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::GetStreamEnd),
                Core(CoreContextIntrinsic::InitializeManagedBufferClass),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Stream(Self::InitializeStreamWritableEndClass),
            ],
            Self::StreamCancelRead => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::GetStreamEnd),
                Task(TaskContextIntrinsic::GetCurrentTask),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Stream(Self::InitializeStreamReadableEndClass),
            ],
            Self::StreamCancelWrite => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::GetStreamEnd),
                Task(TaskContextIntrinsic::GetCurrentTask),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Stream(Self::InitializeStreamWritableEndClass),
            ],
            Self::StreamDropReadable => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Stream(Self::GetStreamEnd),
                Task(TaskContextIntrinsic::GetCurrentTask),
                Stream(Self::InitializeStreamReadableEndClass),
            ],
            Self::StreamDropWritable => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Stream(Self::GetStreamEnd),
                Task(TaskContextIntrinsic::GetCurrentTask),
                Stream(Self::InitializeStreamWritableEndClass),
            ],
            Self::IsStreamLowerableObject => &[
                Stream(Self::InitializeExternalStreamClass),
                Core(CoreContextIntrinsic::InitializeSymbolAsyncIterator),
                Core(CoreContextIntrinsic::InitializeSymbolIterator),
                Core(CoreContextIntrinsic::InitializeReadableStream),
            ],
            Self::GenReadFnFromLowerableStream => &[
                Stream(Self::IsStreamLowerableObject),
                Core(CoreContextIntrinsic::InitializeSymbolDispose),
            ],
            Self::GenStreamHostInjectFn => &[Stream(Self::InitializePendingValueQueueClass)],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(init) = self.initializer() {
            let initialize = init.local_name;
            let arguments = match self {
                Self::InitializeStreams => "RepTable",
                Self::InitializeStreamTables => "",
                Self::InitializeStreamEndClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, ManagedBuffer, buffers: BUFFER_MGR, events: ASYNC_EVENT_CODE, taskLookup: _jcoTaskLookupContext, tracking: _jcoComponentHostOperationContext }"
                }
                Self::InitializeStreamReadableEndClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, StreamEnd, ManagedBuffer, buffers: BUFFER_MGR, events: ASYNC_EVENT_CODE, lookup: _jcoComponentStateLookupContext }"
                }
                Self::InitializeStreamWritableEndClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, StreamEnd, ManagedBuffer, buffers: BUFFER_MGR, events: ASYNC_EVENT_CODE, lookup: _jcoComponentStateLookupContext }"
                }
                Self::InitializeInternalStreamClass => "{ StreamReadableEnd, StreamWritableEnd }",
                Self::InitializeExternalStreamClass => {
                    "{ disposeSymbol: symbolDispose, asyncIteratorSymbol: symbolAsyncIterator, resourceRep: symbolRscRep }"
                }
                Self::InitializeHostStreamClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, Stream }"
                }
                Self::InitializePendingValueQueueClass => "_jcoComponentHostOperationContext",
                _ => unreachable!(),
            };
            uwriteln!(output, "const {local} = {initialize}({arguments});");
            return;
        }
        let properties = match self {
            Self::CreateStream => "InternalStream, streams: STREAMS, tables: STREAM_TABLES",
            Self::AddStreamEndToTable => {
                "StreamEnd, RuntimeError: WebAssemblyRuntimeError, tables: STREAM_TABLES, lookup: _jcoComponentStateLookupContext"
            }
            Self::GetStreamEnd => {
                "StreamEnd, RuntimeError: WebAssemblyRuntimeError, tables: STREAM_TABLES, lookup: _jcoComponentStateLookupContext"
            }
            Self::StreamNew => {
                "taskLookup: _jcoTaskLookupContext, lookup: _jcoComponentStateLookupContext, creation: _jcoStreamCreateContext"
            }
            Self::StreamNewFromLift => "HostStream, streams: STREAMS",
            Self::StreamRead => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, ManagedBuffer, events: ASYNC_EVENT_CODE, StreamEnd: StreamReadableEnd"
            }
            Self::StreamWrite => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, ManagedBuffer, events: ASYNC_EVENT_CODE, StreamEnd: StreamWritableEnd"
            }
            Self::StreamCancelRead => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, taskLookup: _jcoTaskLookupContext, events: ASYNC_EVENT_CODE, StreamEnd: StreamReadableEnd"
            }
            Self::StreamCancelWrite => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, taskLookup: _jcoTaskLookupContext, events: ASYNC_EVENT_CODE, StreamEnd: StreamWritableEnd"
            }
            Self::StreamDropReadable => {
                "RuntimeError: WebAssemblyRuntimeError, ends: _jcoStreamEndLookupContext, taskLookup: _jcoTaskLookupContext, StreamEnd: StreamReadableEnd"
            }
            Self::StreamDropWritable => {
                "RuntimeError: WebAssemblyRuntimeError, ends: _jcoStreamEndLookupContext, taskLookup: _jcoTaskLookupContext, StreamEnd: StreamWritableEnd"
            }
            Self::IsStreamLowerableObject => {
                "Stream, asyncIteratorSymbol: symbolAsyncIterator, iteratorSymbol: symbolIterator, ReadableStream: _PlatformReadableStream"
            }
            Self::GenReadFnFromLowerableStream => {
                "lowerable: _jcoStreamLowerableContext, disposeSymbol: symbolDispose"
            }
            Self::GenStreamHostInjectFn => "PendingValueQueue",
            _ => unreachable!(),
        };
        uwriteln!(output, "const {local} = {{ {properties} }};");
    }
}
pub(crate) fn import(intrinsic: AsyncStreamIntrinsic) -> RuntimeImport {
    use AsyncStreamIntrinsic::*;
    let (export, context, kind) = match intrinsic {
        GlobalStreamMap => (
            "initializeStreams",
            StreamContextIntrinsic::InitializeStreams,
            RuntimeImportKind::InitializedValue,
        ),
        GlobalStreamTableMap => (
            "initializeStreamTables",
            StreamContextIntrinsic::InitializeStreamTables,
            RuntimeImportKind::InitializedValue,
        ),
        StreamEndClass => (
            "initializeStreamEndClass",
            StreamContextIntrinsic::InitializeStreamEndClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        StreamReadableEndClass => (
            "initializeStreamReadableEndClass",
            StreamContextIntrinsic::InitializeStreamReadableEndClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        StreamWritableEndClass => (
            "initializeStreamWritableEndClass",
            StreamContextIntrinsic::InitializeStreamWritableEndClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        InternalStreamClass => (
            "initializeInternalStreamClass",
            StreamContextIntrinsic::InitializeInternalStreamClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        ExternalStreamClass => (
            "initializeExternalStreamClass",
            StreamContextIntrinsic::InitializeExternalStreamClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        HostStreamClass => (
            "initializeHostStreamClass",
            StreamContextIntrinsic::InitializeHostStreamClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        PendingValueQueueClass => (
            "initializePendingValueQueueClass",
            StreamContextIntrinsic::InitializePendingValueQueueClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        CreateStream => (
            "createStream",
            StreamContextIntrinsic::CreateStream,
            RuntimeImportKind::Call,
        ),
        GetStreamEnd => (
            "getStreamEnd",
            StreamContextIntrinsic::GetStreamEnd,
            RuntimeImportKind::Call,
        ),
        AddStreamEndToTable => (
            "addStreamEndToTable",
            StreamContextIntrinsic::AddStreamEndToTable,
            RuntimeImportKind::Call,
        ),
        DeleteStreamEnd => (
            "deleteStreamEnd",
            StreamContextIntrinsic::AddStreamEndToTable,
            RuntimeImportKind::Call,
        ),
        RemoveStreamEndFromTable => (
            "removeStreamEndFromTable",
            StreamContextIntrinsic::AddStreamEndToTable,
            RuntimeImportKind::Call,
        ),
        StreamNew => (
            "streamNew",
            StreamContextIntrinsic::StreamNew,
            RuntimeImportKind::Call,
        ),
        StreamNewFromLift => (
            "streamNewFromLift",
            StreamContextIntrinsic::StreamNewFromLift,
            RuntimeImportKind::Call,
        ),
        StreamRead => (
            "streamRead",
            StreamContextIntrinsic::StreamRead,
            RuntimeImportKind::Call,
        ),
        StreamWrite => (
            "streamWrite",
            StreamContextIntrinsic::StreamWrite,
            RuntimeImportKind::Call,
        ),
        StreamCancelRead => (
            "streamCancelRead",
            StreamContextIntrinsic::StreamCancelRead,
            RuntimeImportKind::Call,
        ),
        StreamCancelWrite => (
            "streamCancelWrite",
            StreamContextIntrinsic::StreamCancelWrite,
            RuntimeImportKind::Call,
        ),
        StreamDropReadable => (
            "streamDropReadable",
            StreamContextIntrinsic::StreamDropReadable,
            RuntimeImportKind::Call,
        ),
        StreamDropWritable => (
            "streamDropWritable",
            StreamContextIntrinsic::StreamDropWritable,
            RuntimeImportKind::Call,
        ),
        StreamTransfer => (
            "streamTransfer",
            StreamContextIntrinsic::GetStreamEnd,
            RuntimeImportKind::Call,
        ),
        IsStreamLowerableObject => (
            "isStreamLowerableObject",
            StreamContextIntrinsic::IsStreamLowerableObject,
            RuntimeImportKind::Call,
        ),
        GenReadFnFromLowerableStream => (
            "genReadFnFromLowerableStream",
            StreamContextIntrinsic::GenReadFnFromLowerableStream,
            RuntimeImportKind::Call,
        ),
        GenStreamHostInjectFn => (
            "genStreamHostInjectFn",
            StreamContextIntrinsic::GenStreamHostInjectFn,
            RuntimeImportKind::Call,
        ),
    };
    RuntimeImport {
        suffix: "intrinsics/stream",
        export,
        context: Some(RuntimeContextIntrinsic::Stream(context)),
        kind,
    }
}

#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    #[test]
    fn stream_contexts_select_the_inline_functions_component_state_calls() {
        use crate::intrinsics::{
            Intrinsic, RenderIntrinsicsArgs, p3::async_stream::AsyncStreamIntrinsic,
            render_intrinsics,
        };
        let mut intrinsics = [Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamNew)]
            .into_iter()
            .collect();
        let opts = crate::TranspileOpts::builder()
            .name("stream".into())
            .build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .external_runtime(true)
                .build(),
        )
        .to_string();
        assert!(source.contains("reportTrap: err => _reportTrap(err)"));
        assert!(source.contains("function _reportTrap(err)"));
        assert!(source.contains("function _checkIdle()"));
    }

    use super::*;
    use crate::{
        TranspileOpts,
        intrinsics::{
            Intrinsic, RenderIntrinsicsArgs, lift::LiftIntrinsic, lower::LowerIntrinsic,
            render_intrinsics, runtime,
        },
    };
    #[test]
    fn all_stream_variants_use_named_descriptors_and_shared_initializers() {
        let variants = [
            AsyncStreamIntrinsic::GlobalStreamMap,
            AsyncStreamIntrinsic::GlobalStreamTableMap,
            AsyncStreamIntrinsic::StreamEndClass,
            AsyncStreamIntrinsic::StreamReadableEndClass,
            AsyncStreamIntrinsic::StreamWritableEndClass,
            AsyncStreamIntrinsic::InternalStreamClass,
            AsyncStreamIntrinsic::ExternalStreamClass,
            AsyncStreamIntrinsic::HostStreamClass,
            AsyncStreamIntrinsic::PendingValueQueueClass,
            AsyncStreamIntrinsic::CreateStream,
            AsyncStreamIntrinsic::GetStreamEnd,
            AsyncStreamIntrinsic::AddStreamEndToTable,
            AsyncStreamIntrinsic::DeleteStreamEnd,
            AsyncStreamIntrinsic::RemoveStreamEndFromTable,
            AsyncStreamIntrinsic::StreamNew,
            AsyncStreamIntrinsic::StreamNewFromLift,
            AsyncStreamIntrinsic::StreamRead,
            AsyncStreamIntrinsic::StreamWrite,
            AsyncStreamIntrinsic::StreamCancelRead,
            AsyncStreamIntrinsic::StreamCancelWrite,
            AsyncStreamIntrinsic::StreamDropReadable,
            AsyncStreamIntrinsic::StreamDropWritable,
            AsyncStreamIntrinsic::StreamTransfer,
            AsyncStreamIntrinsic::IsStreamLowerableObject,
            AsyncStreamIntrinsic::GenReadFnFromLowerableStream,
            AsyncStreamIntrinsic::GenStreamHostInjectFn,
        ];
        assert_eq!(variants.len(), 26);
        let mut intrinsics = variants.map(Intrinsic::AsyncStream).into_iter().collect();
        let opts = TranspileOpts::builder().name("streams".into()).build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .external_runtime(true)
                .build(),
        )
        .to_string();
        for variant in variants {
            assert!(matches!(
                runtime::binding(runtime::select(true), Intrinsic::AsyncStream(variant)),
                runtime::IntrinsicBinding::Imported { .. }
            ));
        }
        for line in [
            "const StreamEnd = _jcoInitializeStreamEndClass({ RuntimeError: WebAssemblyRuntimeError, ManagedBuffer, buffers: BUFFER_MGR, events: ASYNC_EVENT_CODE, taskLookup: _jcoTaskLookupContext, tracking: _jcoComponentHostOperationContext });",
            "const STREAM_TABLES = _jcoInitializeStreamTables();",
            "const STREAMS = _jcoInitializeStreams(RepTable);",
        ] {
            assert_eq!(source.matches(line).count(), 1, "{line}");
        }
        for inline in [
            "class StreamEnd",
            "class StreamReadableEnd",
            "class StreamWritableEnd",
            "class PendingValueQueue",
            "function createStream(",
        ] {
            assert!(!source.contains(inline), "{inline}");
        }
        assert_eq!(
            runtime::select(true).bind_callback(
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamRead),
                "meta"
            ),
            "streamRead.bind(null, _jcoStreamReadContext, meta)"
        );
        assert_eq!(
            runtime::select(false).bind_callback(
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamRead),
                "meta"
            ),
            "streamRead.bind(null, meta)"
        );
        assert_eq!(
            runtime::select(true)
                .callback_reference(Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamTransfer)),
            "streamTransfer.bind(void 0, _jcoStreamEndLookupContext)"
        );
    }
    #[test]
    fn lift_and_lower_streams_have_no_inline_family_bridges() {
        let mut intrinsics = [
            Intrinsic::Lift(LiftIntrinsic::LiftFlatStream),
            Intrinsic::Lower(LowerIntrinsic::LowerFlatStream),
        ]
        .into_iter()
        .collect();
        let opts = TranspileOpts::builder().name("streams".into()).build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .external_runtime(true)
                .build(),
        )
        .to_string();
        assert!(source.contains("tables: STREAM_TABLES, Stream"));
        assert!(
            source.contains(
                "streams: STREAMS, InternalStream, lowerable: _jcoStreamLowerableContext"
            )
        );
        for inline in [
            "getTables:",
            "getGlobal:",
            "getExternalStream:",
            "getExternalClass:",
            "getInternalClass:",
            "class Stream",
            "function createStream(",
        ] {
            assert!(!source.contains(inline), "{inline}");
        }
        assert_eq!(
            source
                .matches("const Stream = _jcoInitializeExternalStreamClass(")
                .count(),
            1
        );
    }
}
