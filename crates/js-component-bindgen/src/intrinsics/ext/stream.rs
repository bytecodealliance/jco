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
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum StreamContextIntrinsic {
    Streams,
    Tables,
    EndClass,
    ReadableClass,
    WritableClass,
    InternalClass,
    ExternalClass,
    HostClass,
    QueueClass,
    Creation,
    Table,
    Lookup,
    New,
    FromLift,
    Read,
    Write,
    CancelRead,
    CancelWrite,
    DropRead,
    DropWrite,
    Lowerable,
    Source,
    Inject,
}
impl StreamContextIntrinsic {
    const ALL: &'static [Self] = &[
        Self::Streams,
        Self::Tables,
        Self::EndClass,
        Self::ReadableClass,
        Self::WritableClass,
        Self::InternalClass,
        Self::ExternalClass,
        Self::HostClass,
        Self::QueueClass,
        Self::Creation,
        Self::Table,
        Self::Lookup,
        Self::New,
        Self::FromLift,
        Self::Read,
        Self::Write,
        Self::CancelRead,
        Self::CancelWrite,
        Self::DropRead,
        Self::DropWrite,
        Self::Lowerable,
        Self::Source,
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
            Self::Streams => "STREAMS",
            Self::Tables => "STREAM_TABLES",
            Self::EndClass => "StreamEnd",
            Self::ReadableClass => "StreamReadableEnd",
            Self::WritableClass => "StreamWritableEnd",
            Self::InternalClass => "InternalStream",
            Self::ExternalClass => "Stream",
            Self::HostClass => "HostStream",
            Self::QueueClass => "PendingValueQueue",
            Self::Creation => "_jcoStreamCreateContext",
            Self::Table => "_jcoStreamTableContext",
            Self::Lookup => "_jcoStreamEndLookupContext",
            Self::New => "_jcoStreamNewContext",
            Self::FromLift => "_jcoStreamFromLiftContext",
            Self::Read => "_jcoStreamReadContext",
            Self::Write => "_jcoStreamWriteContext",
            Self::CancelRead => "_jcoStreamCancelReadContext",
            Self::CancelWrite => "_jcoStreamCancelWriteContext",
            Self::DropRead => "_jcoStreamDropReadContext",
            Self::DropWrite => "_jcoStreamDropWriteContext",
            Self::Lowerable => "_jcoStreamLowerableContext",
            Self::Source => "_jcoStreamSourceContext",
            Self::Inject => "_jcoStreamHostInjectContext",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::Streams => ("initializeStreams", "_jcoInitializeStreams"),
            Self::Tables => ("initializeStreamTables", "_jcoInitializeStreamTables"),
            Self::EndClass => ("initializeStreamEndClass", "_jcoInitializeStreamEndClass"),
            Self::ReadableClass => (
                "initializeStreamReadableEndClass",
                "_jcoInitializeStreamReadableEndClass",
            ),
            Self::WritableClass => (
                "initializeStreamWritableEndClass",
                "_jcoInitializeStreamWritableEndClass",
            ),
            Self::InternalClass => (
                "initializeInternalStreamClass",
                "_jcoInitializeInternalStreamClass",
            ),
            Self::ExternalClass => (
                "initializeExternalStreamClass",
                "_jcoInitializeExternalStreamClass",
            ),
            Self::HostClass => ("initializeHostStreamClass", "_jcoInitializeHostStreamClass"),
            Self::QueueClass => (
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
            Self::Streams => &[Core(CoreContextIntrinsic::InitializeRepTableClass)],
            Self::Tables => &[],
            Self::EndClass => &[Core(CoreContextIntrinsic::InitializeAsyncEventCodes)],
            Self::ReadableClass => &[
                Stream(Self::EndClass),
                Core(CoreContextIntrinsic::InitializeManagedBufferClass),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Core(CoreContextIntrinsic::InitializeBufferManager),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Component(ComponentContextIntrinsic::TrackHostOperation),
                Task(TaskContextIntrinsic::GetCurrentTask),
            ],
            Self::WritableClass => &[
                Stream(Self::EndClass),
                Core(CoreContextIntrinsic::InitializeManagedBufferClass),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Core(CoreContextIntrinsic::InitializeBufferManager),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Component(ComponentContextIntrinsic::TrackHostOperation),
                Task(TaskContextIntrinsic::GetCurrentTask),
            ],
            Self::InternalClass => &[Stream(Self::ReadableClass), Stream(Self::WritableClass)],
            Self::ExternalClass => &[
                Core(CoreContextIntrinsic::InitializeSymbolDispose),
                Core(CoreContextIntrinsic::InitializeSymbolAsyncIterator),
                Core(CoreContextIntrinsic::InitializeSymbolResourceRep),
            ],
            Self::HostClass => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::Lookup),
                Stream(Self::ExternalClass),
            ],
            Self::QueueClass => &[Component(ComponentContextIntrinsic::TrackHostOperation)],
            Self::Creation => &[
                Stream(Self::InternalClass),
                Stream(Self::Streams),
                Stream(Self::Tables),
            ],
            Self::Table => &[
                Stream(Self::Tables),
                Stream(Self::EndClass),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::Lookup => &[
                Stream(Self::EndClass),
                Stream(Self::Tables),
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
            ],
            Self::New => &[
                Task(TaskContextIntrinsic::GetCurrentTask),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::Creation),
            ],
            Self::FromLift => &[Stream(Self::HostClass), Stream(Self::Streams)],
            Self::Read => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::Lookup),
                Task(TaskContextIntrinsic::InitializeCurrentTaskMayBlock),
                Core(CoreContextIntrinsic::InitializeManagedBufferClass),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Stream(Self::ReadableClass),
            ],
            Self::Write => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::Lookup),
                Task(TaskContextIntrinsic::InitializeCurrentTaskMayBlock),
                Core(CoreContextIntrinsic::InitializeManagedBufferClass),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Stream(Self::WritableClass),
            ],
            Self::CancelRead => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::Lookup),
                Task(TaskContextIntrinsic::GetCurrentTask),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Stream(Self::ReadableClass),
            ],
            Self::CancelWrite => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::Lookup),
                Task(TaskContextIntrinsic::GetCurrentTask),
                Core(CoreContextIntrinsic::InitializeAsyncEventCodes),
                Stream(Self::WritableClass),
            ],
            Self::DropRead => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::Lookup),
                Task(TaskContextIntrinsic::GetCurrentTask),
                Stream(Self::ReadableClass),
            ],
            Self::DropWrite => &[
                Core(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
                Component(ComponentContextIntrinsic::GetOrCreateAsyncState),
                Stream(Self::Lookup),
                Task(TaskContextIntrinsic::GetCurrentTask),
                Stream(Self::WritableClass),
            ],
            Self::Lowerable => &[
                Stream(Self::ExternalClass),
                Core(CoreContextIntrinsic::InitializeSymbolAsyncIterator),
                Core(CoreContextIntrinsic::InitializeSymbolIterator),
                Core(CoreContextIntrinsic::InitializeReadableStream),
            ],
            Self::Source => &[
                Stream(Self::Lowerable),
                Core(CoreContextIntrinsic::InitializeSymbolDispose),
            ],
            Self::Inject => &[Stream(Self::QueueClass)],
        }
    }
    pub(crate) fn render(self, output: &mut Source, _args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(init) = self.initializer() {
            let initialize = init.local_name;
            let arguments = match self {
                Self::Streams => "RepTable",
                Self::Tables => "",
                Self::EndClass => "ASYNC_EVENT_CODE",
                Self::ReadableClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, StreamEnd, ManagedBuffer, buffers: BUFFER_MGR, events: ASYNC_EVENT_CODE, lookup: _jcoComponentStateLookupContext, taskLookup: _jcoTaskLookupContext, tracking: _jcoComponentHostOperationContext }"
                }
                Self::WritableClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, StreamEnd, ManagedBuffer, buffers: BUFFER_MGR, events: ASYNC_EVENT_CODE, lookup: _jcoComponentStateLookupContext, taskLookup: _jcoTaskLookupContext, tracking: _jcoComponentHostOperationContext }"
                }
                Self::InternalClass => "{ StreamReadableEnd, StreamWritableEnd }",
                Self::ExternalClass => {
                    "{ disposeSymbol: symbolDispose, asyncIteratorSymbol: symbolAsyncIterator, resourceRep: symbolRscRep }"
                }
                Self::HostClass => {
                    "{ RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, Stream }"
                }
                Self::QueueClass => "_jcoComponentHostOperationContext",
                _ => unreachable!(),
            };
            uwriteln!(output, "const {local} = {initialize}({arguments});");
            return;
        }
        let properties = match self {
            Self::Creation => "InternalStream, streams: STREAMS, tables: STREAM_TABLES",
            Self::Table => {
                "StreamEnd, RuntimeError: WebAssemblyRuntimeError, tables: STREAM_TABLES, lookup: _jcoComponentStateLookupContext"
            }
            Self::Lookup => {
                "StreamEnd, RuntimeError: WebAssemblyRuntimeError, tables: STREAM_TABLES, lookup: _jcoComponentStateLookupContext"
            }
            Self::New => {
                "taskLookup: _jcoTaskLookupContext, lookup: _jcoComponentStateLookupContext, creation: _jcoStreamCreateContext"
            }
            Self::FromLift => "HostStream, streams: STREAMS",
            Self::Read => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, mayBlock: CURRENT_TASK_MAY_BLOCK, ManagedBuffer, events: ASYNC_EVENT_CODE, StreamEnd: StreamReadableEnd"
            }
            Self::Write => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, mayBlock: CURRENT_TASK_MAY_BLOCK, ManagedBuffer, events: ASYNC_EVENT_CODE, StreamEnd: StreamWritableEnd"
            }
            Self::CancelRead => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, taskLookup: _jcoTaskLookupContext, events: ASYNC_EVENT_CODE, StreamEnd: StreamReadableEnd"
            }
            Self::CancelWrite => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, taskLookup: _jcoTaskLookupContext, events: ASYNC_EVENT_CODE, StreamEnd: StreamWritableEnd"
            }
            Self::DropRead => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, taskLookup: _jcoTaskLookupContext, StreamEnd: StreamReadableEnd"
            }
            Self::DropWrite => {
                "RuntimeError: WebAssemblyRuntimeError, lookup: _jcoComponentStateLookupContext, ends: _jcoStreamEndLookupContext, taskLookup: _jcoTaskLookupContext, StreamEnd: StreamWritableEnd"
            }
            Self::Lowerable => {
                "Stream, asyncIteratorSymbol: symbolAsyncIterator, iteratorSymbol: symbolIterator, ReadableStream: _PlatformReadableStream"
            }
            Self::Source => "lowerable: _jcoStreamLowerableContext, disposeSymbol: symbolDispose",
            Self::Inject => "PendingValueQueue",
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
            StreamContextIntrinsic::Streams,
            RuntimeImportKind::InitializedValue,
        ),
        GlobalStreamTableMap => (
            "initializeStreamTables",
            StreamContextIntrinsic::Tables,
            RuntimeImportKind::InitializedValue,
        ),
        StreamEndClass => (
            "initializeStreamEndClass",
            StreamContextIntrinsic::EndClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        StreamReadableEndClass => (
            "initializeStreamReadableEndClass",
            StreamContextIntrinsic::ReadableClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        StreamWritableEndClass => (
            "initializeStreamWritableEndClass",
            StreamContextIntrinsic::WritableClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        InternalStreamClass => (
            "initializeInternalStreamClass",
            StreamContextIntrinsic::InternalClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        ExternalStreamClass => (
            "initializeExternalStreamClass",
            StreamContextIntrinsic::ExternalClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        HostStreamClass => (
            "initializeHostStreamClass",
            StreamContextIntrinsic::HostClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        PendingValueQueueClass => (
            "initializePendingValueQueueClass",
            StreamContextIntrinsic::QueueClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        CreateStream => (
            "createStream",
            StreamContextIntrinsic::Creation,
            RuntimeImportKind::Call,
        ),
        GetStreamEnd => (
            "getStreamEnd",
            StreamContextIntrinsic::Lookup,
            RuntimeImportKind::Call,
        ),
        AddStreamEndToTable => (
            "addStreamEndToTable",
            StreamContextIntrinsic::Table,
            RuntimeImportKind::Call,
        ),
        DeleteStreamEnd => (
            "deleteStreamEnd",
            StreamContextIntrinsic::Table,
            RuntimeImportKind::Call,
        ),
        RemoveStreamEndFromTable => (
            "removeStreamEndFromTable",
            StreamContextIntrinsic::Table,
            RuntimeImportKind::Call,
        ),
        StreamNew => (
            "streamNew",
            StreamContextIntrinsic::New,
            RuntimeImportKind::Call,
        ),
        StreamNewFromLift => (
            "streamNewFromLift",
            StreamContextIntrinsic::FromLift,
            RuntimeImportKind::Call,
        ),
        StreamRead => (
            "streamRead",
            StreamContextIntrinsic::Read,
            RuntimeImportKind::Call,
        ),
        StreamWrite => (
            "streamWrite",
            StreamContextIntrinsic::Write,
            RuntimeImportKind::Call,
        ),
        StreamCancelRead => (
            "streamCancelRead",
            StreamContextIntrinsic::CancelRead,
            RuntimeImportKind::Call,
        ),
        StreamCancelWrite => (
            "streamCancelWrite",
            StreamContextIntrinsic::CancelWrite,
            RuntimeImportKind::Call,
        ),
        StreamDropReadable => (
            "streamDropReadable",
            StreamContextIntrinsic::DropRead,
            RuntimeImportKind::Call,
        ),
        StreamDropWritable => (
            "streamDropWritable",
            StreamContextIntrinsic::DropWrite,
            RuntimeImportKind::Call,
        ),
        StreamTransfer => (
            "streamTransfer",
            StreamContextIntrinsic::Lookup,
            RuntimeImportKind::Call,
        ),
        IsStreamLowerableObject => (
            "isStreamLowerableObject",
            StreamContextIntrinsic::Lowerable,
            RuntimeImportKind::Call,
        ),
        GenReadFnFromLowerableStream => (
            "genReadFnFromLowerableStream",
            StreamContextIntrinsic::Source,
            RuntimeImportKind::Call,
        ),
        GenStreamHostInjectFn => (
            "genStreamHostInjectFn",
            StreamContextIntrinsic::Inject,
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
    use super::*;
    use crate::intrinsics::runtime;
    use crate::{
        TranspileOpts,
        intrinsics::{
            Intrinsic, RenderIntrinsicsArgs, lift::LiftIntrinsic, lower::LowerIntrinsic,
            render_intrinsics,
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
                crate::intrinsics::runtime::IntrinsicBinding::Imported { .. }
            ));
        }
        for line in [
            "const StreamEnd = _jcoInitializeStreamEndClass(ASYNC_EVENT_CODE);",
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
