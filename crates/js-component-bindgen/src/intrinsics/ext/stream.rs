//! Stream operations use per-store table owners and selected constructor identities.
use super::{
    ComponentContext, CoreContext, RuntimeContext, RuntimeImport, RuntimeImportKind,
    RuntimeInitializer, TaskContext,
};
use crate::{
    intrinsics::{RenderIntrinsicsArgs, p3::async_stream::AsyncStreamIntrinsic},
    source::Source,
    uwriteln,
};
use std::fmt::Write;
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum StreamContext {
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
impl StreamContext {
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
    pub(crate) fn dependencies(self) -> &'static [RuntimeContext] {
        use RuntimeContext::{Component, Core, Stream, Task};
        match self {
            Self::Streams => &[Core(CoreContext::RepTableClass)],
            Self::Tables => &[],
            Self::EndClass => &[Core(CoreContext::AsyncEventCodeEnum)],
            Self::ReadableClass => &[
                Stream(Self::EndClass),
                Core(CoreContext::ManagedBufferClass),
                Core(CoreContext::WebAssemblyRuntimeError),
                Core(CoreContext::GlobalBufferManager),
                Core(CoreContext::AsyncEventCodeEnum),
                Component(ComponentContext::StateLookup),
                Component(ComponentContext::HostOperation),
                Task(TaskContext::Lookup),
            ],
            Self::WritableClass => &[
                Stream(Self::EndClass),
                Core(CoreContext::ManagedBufferClass),
                Core(CoreContext::WebAssemblyRuntimeError),
                Core(CoreContext::GlobalBufferManager),
                Core(CoreContext::AsyncEventCodeEnum),
                Component(ComponentContext::StateLookup),
                Component(ComponentContext::HostOperation),
                Task(TaskContext::Lookup),
            ],
            Self::InternalClass => &[Stream(Self::ReadableClass), Stream(Self::WritableClass)],
            Self::ExternalClass => &[
                Core(CoreContext::SymbolDispose),
                Core(CoreContext::SymbolAsyncIterator),
                Core(CoreContext::SymbolResourceRep),
            ],
            Self::HostClass => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
                Stream(Self::Lookup),
                Stream(Self::ExternalClass),
            ],
            Self::QueueClass => &[Component(ComponentContext::HostOperation)],
            Self::Creation => &[
                Stream(Self::InternalClass),
                Stream(Self::Streams),
                Stream(Self::Tables),
            ],
            Self::Table => &[
                Stream(Self::Tables),
                Stream(Self::EndClass),
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
            ],
            Self::Lookup => &[
                Stream(Self::EndClass),
                Stream(Self::Tables),
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
            ],
            Self::New => &[
                Task(TaskContext::Lookup),
                Component(ComponentContext::StateLookup),
                Stream(Self::Creation),
            ],
            Self::FromLift => &[Stream(Self::HostClass), Stream(Self::Streams)],
            Self::Read => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
                Stream(Self::Lookup),
                Task(TaskContext::MayBlock),
                Core(CoreContext::ManagedBufferClass),
                Core(CoreContext::AsyncEventCodeEnum),
                Stream(Self::ReadableClass),
            ],
            Self::Write => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
                Stream(Self::Lookup),
                Task(TaskContext::MayBlock),
                Core(CoreContext::ManagedBufferClass),
                Core(CoreContext::AsyncEventCodeEnum),
                Stream(Self::WritableClass),
            ],
            Self::CancelRead => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
                Stream(Self::Lookup),
                Task(TaskContext::Lookup),
                Core(CoreContext::AsyncEventCodeEnum),
                Stream(Self::ReadableClass),
            ],
            Self::CancelWrite => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
                Stream(Self::Lookup),
                Task(TaskContext::Lookup),
                Core(CoreContext::AsyncEventCodeEnum),
                Stream(Self::WritableClass),
            ],
            Self::DropRead => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
                Stream(Self::Lookup),
                Task(TaskContext::Lookup),
                Stream(Self::ReadableClass),
            ],
            Self::DropWrite => &[
                Core(CoreContext::WebAssemblyRuntimeError),
                Component(ComponentContext::StateLookup),
                Stream(Self::Lookup),
                Task(TaskContext::Lookup),
                Stream(Self::WritableClass),
            ],
            Self::Lowerable => &[
                Stream(Self::ExternalClass),
                Core(CoreContext::SymbolAsyncIterator),
                Core(CoreContext::SymbolIterator),
                Core(CoreContext::PlatformReadableStreamClass),
            ],
            Self::Source => &[Stream(Self::Lowerable), Core(CoreContext::SymbolDispose)],
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
            StreamContext::Streams,
            RuntimeImportKind::InitializedValue,
        ),
        GlobalStreamTableMap => (
            "initializeStreamTables",
            StreamContext::Tables,
            RuntimeImportKind::InitializedValue,
        ),
        StreamEndClass => (
            "initializeStreamEndClass",
            StreamContext::EndClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        StreamReadableEndClass => (
            "initializeStreamReadableEndClass",
            StreamContext::ReadableClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        StreamWritableEndClass => (
            "initializeStreamWritableEndClass",
            StreamContext::WritableClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        InternalStreamClass => (
            "initializeInternalStreamClass",
            StreamContext::InternalClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        ExternalStreamClass => (
            "initializeExternalStreamClass",
            StreamContext::ExternalClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        HostStreamClass => (
            "initializeHostStreamClass",
            StreamContext::HostClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        PendingValueQueueClass => (
            "initializePendingValueQueueClass",
            StreamContext::QueueClass,
            RuntimeImportKind::InitializedConstructor,
        ),
        CreateStream => (
            "createStream",
            StreamContext::Creation,
            RuntimeImportKind::Call,
        ),
        GetStreamEnd => (
            "getStreamEnd",
            StreamContext::Lookup,
            RuntimeImportKind::Call,
        ),
        AddStreamEndToTable => (
            "addStreamEndToTable",
            StreamContext::Table,
            RuntimeImportKind::Call,
        ),
        DeleteStreamEnd => (
            "deleteStreamEnd",
            StreamContext::Table,
            RuntimeImportKind::Call,
        ),
        RemoveStreamEndFromTable => (
            "removeStreamEndFromTable",
            StreamContext::Table,
            RuntimeImportKind::Call,
        ),
        StreamNew => ("streamNew", StreamContext::New, RuntimeImportKind::Call),
        StreamNewFromLift => (
            "streamNewFromLift",
            StreamContext::FromLift,
            RuntimeImportKind::Call,
        ),
        StreamRead => ("streamRead", StreamContext::Read, RuntimeImportKind::Call),
        StreamWrite => ("streamWrite", StreamContext::Write, RuntimeImportKind::Call),
        StreamCancelRead => (
            "streamCancelRead",
            StreamContext::CancelRead,
            RuntimeImportKind::Call,
        ),
        StreamCancelWrite => (
            "streamCancelWrite",
            StreamContext::CancelWrite,
            RuntimeImportKind::Call,
        ),
        StreamDropReadable => (
            "streamDropReadable",
            StreamContext::DropRead,
            RuntimeImportKind::Call,
        ),
        StreamDropWritable => (
            "streamDropWritable",
            StreamContext::DropWrite,
            RuntimeImportKind::Call,
        ),
        StreamTransfer => (
            "streamTransfer",
            StreamContext::Lookup,
            RuntimeImportKind::Call,
        ),
        IsStreamLowerableObject => (
            "isStreamLowerableObject",
            StreamContext::Lowerable,
            RuntimeImportKind::Call,
        ),
        GenReadFnFromLowerableStream => (
            "genReadFnFromLowerableStream",
            StreamContext::Source,
            RuntimeImportKind::Call,
        ),
        GenStreamHostInjectFn => (
            "genStreamHostInjectFn",
            StreamContext::Inject,
            RuntimeImportKind::Call,
        ),
    };
    RuntimeImport {
        suffix: "intrinsics/stream",
        export,
        context: Some(RuntimeContext::Stream(context)),
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
