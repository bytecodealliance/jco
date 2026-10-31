//! Central metadata for named core operations and selected state/constructor owners.
use super::super::{Intrinsic, RenderIntrinsicsArgs};
use super::{
    ComponentContextIntrinsic, RuntimeContextIntrinsic, RuntimeImport, RuntimeImportKind,
    RuntimeInitializer,
};
use crate::{source::Source, uwriteln};
use std::fmt::Write;

/// Initializers and capability contexts for external JS helpers and core Wasm operations.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum CoreContextIntrinsic {
    /// The configured async determinism profile returned by `initializeAsyncDeterminism`.
    InitializeAsyncDeterminism,
    /// The `cabiDispose` symbol returned by `initializeSymbolCabiDispose`.
    InitializeSymbolCabiDispose,
    /// The `cabiLower` symbol returned by `initializeSymbolCabiLower`.
    InitializeSymbolCabiLower,
    /// The resource-handle symbol returned by `initializeSymbolResourceHandle`.
    InitializeSymbolResourceHandle,
    /// The resource-representation symbol returned by `initializeSymbolResourceRep`.
    InitializeSymbolResourceRep,
    /// The disposal symbol returned by `initializeSymbolDispose`.
    InitializeSymbolDispose,
    /// The async-iterator symbol returned by `initializeSymbolAsyncIterator`.
    InitializeSymbolAsyncIterator,
    /// The iterator symbol returned by `initializeSymbolIterator`.
    InitializeSymbolIterator,
    /// The async-function constructor returned by `initializeAsyncFunctionConstructor`.
    InitializeAsyncFunctionConstructor,
    /// The platform readable-stream constructor returned by `initializeReadableStream`.
    InitializeReadableStream,
    /// The component-error constructor returned by `initializeComponentErrorClass`.
    InitializeComponentErrorClass,
    /// The selected Wasm runtime-error constructor returned by `initializeRuntimeErrorConstructor`.
    InitializeRuntimeErrorConstructor,
    /// The managed-buffer constructor returned by `initializeManagedBufferClass`.
    InitializeManagedBufferClass,
    /// The buffer-manager constructor returned by `initializeBufferManagerClass`.
    InitializeBufferManagerClass,
    /// The representation-table constructor returned by `initializeRepTableClass`.
    InitializeRepTableClass,
    /// The own-property predicate returned by `initializeHasOwnProperty`.
    InitializeHasOwnProperty,
    /// The fact-trap message table returned by `initializeFactTrapMessages`.
    InitializeFactTrapMessages,
    /// The shared buffer manager returned by `initializeBufferManager`.
    InitializeBufferManager,
    /// The async-event code constants returned by `initializeAsyncEventCodes`.
    InitializeAsyncEventCodes,
    /// The component-indexed memory map returned by `initializeComponentMemoryMap`.
    InitializeComponentMemoryMap,
    /// The current task registers returned by `initializeTaskRegisters`.
    InitializeTaskRegisters,
    /// The Wasm modules returned by `initializeConditionalSuspendingWasm`
    /// for the `conditionalSuspending*` wrappers.
    InitializeConditionalSuspendingWasm,
    /// The platform endianness flag returned by `initializeEndianness`.
    InitializeEndianness,
    /// Capabilities for `base64Compile`, which compiles an embedded core Wasm module.
    Base64Compile,
    /// Capabilities for `fetchCompile`, which loads and compiles a core Wasm module.
    FetchCompile,
    /// The selected `WebAssembly` implementation passed to `instantiateCore`.
    InstantiateCore,
    /// Capabilities for `suspendingImport`, which wraps an import with task bookkeeping.
    SuspendingImport,
    /// Shared capabilities for the `conditionalSuspending*` JSPI wrappers.
    ConditionalSuspending,
    /// The file compilation cache returned by `initializeFileCompileCache`.
    InitializeFileCompileCache,
}
impl CoreContextIntrinsic {
    const ALL: &'static [Self] = &[
        Self::InitializeAsyncDeterminism,
        Self::InitializeSymbolCabiDispose,
        Self::InitializeSymbolCabiLower,
        Self::InitializeSymbolResourceHandle,
        Self::InitializeSymbolResourceRep,
        Self::InitializeSymbolDispose,
        Self::InitializeSymbolAsyncIterator,
        Self::InitializeSymbolIterator,
        Self::InitializeAsyncFunctionConstructor,
        Self::InitializeReadableStream,
        Self::InitializeComponentErrorClass,
        Self::InitializeRuntimeErrorConstructor,
        Self::InitializeManagedBufferClass,
        Self::InitializeBufferManagerClass,
        Self::InitializeRepTableClass,
        Self::InitializeHasOwnProperty,
        Self::InitializeFactTrapMessages,
        Self::InitializeBufferManager,
        Self::InitializeAsyncEventCodes,
        Self::InitializeComponentMemoryMap,
        Self::InitializeTaskRegisters,
        Self::InitializeConditionalSuspendingWasm,
        Self::InitializeEndianness,
        Self::Base64Compile,
        Self::FetchCompile,
        Self::InstantiateCore,
        Self::SuspendingImport,
        Self::ConditionalSuspending,
        Self::InitializeFileCompileCache,
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
            Self::InitializeAsyncDeterminism => "ASYNC_DETERMINISM",
            Self::InitializeSymbolCabiDispose => "symbolCabiDispose",
            Self::InitializeSymbolCabiLower => "symbolCabiLower",
            Self::InitializeSymbolResourceHandle => "symbolRscHandle",
            Self::InitializeSymbolResourceRep => "symbolRscRep",
            Self::InitializeSymbolDispose => "symbolDispose",
            Self::InitializeSymbolAsyncIterator => "symbolAsyncIterator",
            Self::InitializeSymbolIterator => "symbolIterator",
            Self::InitializeAsyncFunctionConstructor => "ASYNC_FN_CTOR",
            Self::InitializeReadableStream => "_PlatformReadableStream",
            Self::InitializeComponentErrorClass => "ComponentError",
            Self::InitializeRuntimeErrorConstructor => "WebAssemblyRuntimeError",
            Self::InitializeManagedBufferClass => "ManagedBuffer",
            Self::InitializeBufferManagerClass => "BufferManager",
            Self::InitializeRepTableClass => "RepTable",
            Self::InitializeHasOwnProperty => "hasOwnProperty",
            Self::InitializeFactTrapMessages => "FACT_TRAP_MESSAGES",
            Self::InitializeBufferManager => "BUFFER_MGR",
            Self::InitializeAsyncEventCodes => "ASYNC_EVENT_CODE",
            Self::InitializeComponentMemoryMap => "GLOBAL_COMPONENT_MEMORY_MAP",
            Self::InitializeTaskRegisters => "CURRENT_TASK_META",
            Self::InitializeConditionalSuspendingWasm => "CONDITIONAL_SUSPENDING_WASM",
            Self::InitializeEndianness => "isLE",
            Self::Base64Compile => "_jcoBase64CompileContext",
            Self::FetchCompile => "_jcoFetchCompileContext",
            Self::InstantiateCore => "WebAssembly",
            Self::SuspendingImport => "_jcoSuspendingImportContext",
            Self::ConditionalSuspending => "_jcoConditionalSuspendingContext",
            Self::InitializeFileCompileCache => "_jcoFileCompileCache",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::InitializeAsyncDeterminism => (
                "initializeAsyncDeterminism",
                "_jcoInitializeAsyncDeterminism",
            ),
            Self::InitializeSymbolCabiDispose => (
                "initializeSymbolCabiDispose",
                "_jcoInitializeSymbolCabiDispose",
            ),
            Self::InitializeSymbolCabiLower => {
                ("initializeSymbolCabiLower", "_jcoInitializeSymbolCabiLower")
            }
            Self::InitializeSymbolResourceHandle => (
                "initializeSymbolResourceHandle",
                "_jcoInitializeSymbolResourceHandle",
            ),
            Self::InitializeSymbolResourceRep => (
                "initializeSymbolResourceRep",
                "_jcoInitializeSymbolResourceRep",
            ),
            Self::InitializeSymbolDispose => {
                ("initializeSymbolDispose", "_jcoInitializeSymbolDispose")
            }
            Self::InitializeSymbolAsyncIterator => (
                "initializeSymbolAsyncIterator",
                "_jcoInitializeSymbolAsyncIterator",
            ),
            Self::InitializeSymbolIterator => {
                ("initializeSymbolIterator", "_jcoInitializeSymbolIterator")
            }
            Self::InitializeAsyncFunctionConstructor => (
                "initializeAsyncFunctionConstructor",
                "_jcoInitializeAsyncFunctionConstructor",
            ),
            Self::InitializeReadableStream => {
                ("initializeReadableStream", "_jcoInitializeReadableStream")
            }
            Self::InitializeComponentErrorClass => (
                "initializeComponentErrorClass",
                "_jcoInitializeComponentErrorClass",
            ),
            Self::InitializeRuntimeErrorConstructor => (
                "initializeRuntimeErrorConstructor",
                "_jcoInitializeRuntimeErrorConstructor",
            ),
            Self::InitializeManagedBufferClass => (
                "initializeManagedBufferClass",
                "_jcoInitializeManagedBufferClass",
            ),
            Self::InitializeBufferManagerClass => (
                "initializeBufferManagerClass",
                "_jcoInitializeBufferManagerClass",
            ),
            Self::InitializeRepTableClass => {
                ("initializeRepTableClass", "_jcoInitializeRepTableClass")
            }
            Self::InitializeHasOwnProperty => {
                ("initializeHasOwnProperty", "_jcoInitializeHasOwnProperty")
            }
            Self::InitializeFactTrapMessages => (
                "initializeFactTrapMessages",
                "_jcoInitializeFactTrapMessages",
            ),
            Self::InitializeBufferManager => {
                ("initializeBufferManager", "_jcoInitializeBufferManager")
            }
            Self::InitializeAsyncEventCodes => {
                ("initializeAsyncEventCodes", "_jcoInitializeAsyncEventCodes")
            }
            Self::InitializeComponentMemoryMap => (
                "initializeComponentMemoryMap",
                "_jcoInitializeComponentMemoryMap",
            ),
            Self::InitializeTaskRegisters => {
                ("initializeTaskRegisters", "_jcoInitializeTaskRegisters")
            }
            Self::InitializeConditionalSuspendingWasm => (
                "initializeConditionalSuspendingWasm",
                "_jcoInitializeConditionalSuspendingWasm",
            ),
            Self::InitializeEndianness => ("initializeEndianness", "_jcoInitializeEndianness"),
            Self::InitializeFileCompileCache => (
                "initializeFileCompileCache",
                "_jcoInitializeFileCompileCache",
            ),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/core",
            export,
            local_name,
        })
    }
    pub(crate) fn dependencies(self) -> &'static [RuntimeContextIntrinsic] {
        match self {
            Self::InitializeManagedBufferClass => &[RuntimeContextIntrinsic::ResourceTransferOwn],
            Self::InitializeBufferManagerClass => &[RuntimeContextIntrinsic::Core(
                Self::InitializeManagedBufferClass,
            )],
            Self::InitializeRepTableClass => &[RuntimeContextIntrinsic::ResourceTableGet],
            Self::InitializeBufferManager => &[RuntimeContextIntrinsic::Core(
                Self::InitializeBufferManagerClass,
            )],
            Self::FetchCompile => &[RuntimeContextIntrinsic::Core(
                Self::InitializeFileCompileCache,
            )],
            Self::SuspendingImport => &[
                RuntimeContextIntrinsic::Task(super::TaskContext::ThreadLookup),
                RuntimeContextIntrinsic::Task(super::TaskContext::MayBlock),
                RuntimeContextIntrinsic::Core(Self::InitializeTaskRegisters),
                RuntimeContextIntrinsic::Component(ComponentContextIntrinsic::CheckMayLeave),
                RuntimeContextIntrinsic::Component(ComponentContextIntrinsic::RecordTrap),
                RuntimeContextIntrinsic::Component(
                    ComponentContextIntrinsic::GetOrCreateAsyncState,
                ),
            ],
            Self::ConditionalSuspending => &[RuntimeContextIntrinsic::Core(
                Self::InitializeConditionalSuspendingWasm,
            )],
            _ => &[],
        }
    }
    pub(crate) fn render(self, output: &mut Source, args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(initializer) = self.initializer() {
            let initialize = initializer.local_name;
            let arguments: String = match self {
                Self::InitializeAsyncDeterminism => format!("'{}'", args.determinism_profile),
                Self::InitializeRuntimeErrorConstructor => "WebAssembly".into(),
                Self::InitializeReadableStream => "ReadableStream".into(),
                Self::InitializeManagedBufferClass => "_jcoResourceTransferOwnContext".into(),
                Self::InitializeBufferManagerClass => "ManagedBuffer".into(),
                Self::InitializeRepTableClass => "_jcoResourceTableGetContext".into(),
                Self::InitializeFactTrapMessages => super::super::fact_trap_messages_js(),
                Self::InitializeBufferManager => "BufferManager".into(),
                Self::InitializeFileCompileCache => {
                    (!args.transpile_opts.nodejs_compat_disabled).to_string()
                }
                _ => String::new(),
            };
            uwriteln!(output, "const {local} = {initialize}({arguments});");
            return;
        }
        let nodejs_compat = !args.transpile_opts.nodejs_compat_disabled;
        match self {
            Self::InstantiateCore => {}
            Self::Base64Compile => uwriteln!(
                output,
                "const {local} = {{ WebAssembly, nodejsCompat: {nodejs_compat} }};"
            ),
            Self::FetchCompile => uwriteln!(
                output,
                "const {local} = {{ WebAssembly, nodejsCompat: {nodejs_compat}, fileCache: _jcoFileCompileCache }};"
            ),
            Self::ConditionalSuspending => uwriteln!(
                output,
                "const {local} = {{ WebAssembly, modules: CONDITIONAL_SUSPENDING_WASM }};"
            ),
            Self::SuspendingImport => uwriteln!(
                output,
                "const {local} = {{ registers: CURRENT_TASK_META, RuntimeError: WebAssembly.RuntimeError, mayLeave: _jcoComponentMayLeaveContext, traps: _jcoComponentRecordTrapContext, states: _jcoComponentStateLookupContext, threadLookup: _jcoThreadLookupContext, mayBlock: CURRENT_TASK_MAY_BLOCK }};"
            ),
            _ => unreachable!("all other core contexts have selected initializers"),
        }
    }
}

pub(crate) fn import(intrinsic: Intrinsic) -> Option<RuntimeImport> {
    let (export, context, kind) = match intrinsic {
        Intrinsic::PromiseWithResolversPonyfill => {
            ("promiseWithResolvers", None, RuntimeImportKind::Call)
        }
        Intrinsic::DebugLog => ("debugLog", None, RuntimeImportKind::Call),
        Intrinsic::CoinFlip => ("coinFlip", None, RuntimeImportKind::Call),
        Intrinsic::TypeCheckValidI32 => ("typeCheckValidI32", None, RuntimeImportKind::Call),
        Intrinsic::TypeCheckAsyncFn => (
            "typeCheckAsyncFn",
            Some(CoreContextIntrinsic::InitializeAsyncFunctionConstructor),
            RuntimeImportKind::Call,
        ),
        Intrinsic::Base64Compile => (
            "base64Compile",
            Some(CoreContextIntrinsic::Base64Compile),
            RuntimeImportKind::Call,
        ),
        Intrinsic::ClampGuest => ("clampGuest", None, RuntimeImportKind::Call),
        Intrinsic::FetchCompile => (
            "fetchCompile",
            Some(CoreContextIntrinsic::FetchCompile),
            RuntimeImportKind::Call,
        ),
        Intrinsic::DisposeHostValue => (
            "disposeHostValue",
            Some(CoreContextIntrinsic::InitializeSymbolDispose),
            RuntimeImportKind::Call,
        ),
        Intrinsic::FinalizationRegistryCreate => {
            ("finalizationRegistryCreate", None, RuntimeImportKind::Call)
        }
        Intrinsic::GetErrorPayload => (
            "getErrorPayload",
            Some(CoreContextIntrinsic::InitializeHasOwnProperty),
            RuntimeImportKind::Call,
        ),
        Intrinsic::GetErrorPayloadString => (
            "getErrorPayloadString",
            Some(CoreContextIntrinsic::InitializeHasOwnProperty),
            RuntimeImportKind::Call,
        ),
        Intrinsic::ThrowInvalidBool => ("throwInvalidBool", None, RuntimeImportKind::Call),
        Intrinsic::ThrowUninitialized => ("throwUninitialized", None, RuntimeImportKind::Call),
        Intrinsic::InstantiateCore => (
            "instantiateCore",
            Some(CoreContextIntrinsic::InstantiateCore),
            RuntimeImportKind::Call,
        ),
        Intrinsic::RegisterGlobalMemoryForComponent => (
            "registerMemory",
            Some(CoreContextIntrinsic::InitializeComponentMemoryMap),
            RuntimeImportKind::Call,
        ),
        Intrinsic::LookupMemoriesForComponent => (
            "lookupMemories",
            Some(CoreContextIntrinsic::InitializeComponentMemoryMap),
            RuntimeImportKind::Call,
        ),
        Intrinsic::GetGlobalCurrentTaskMetaFn => (
            "getCurrentTaskMeta",
            Some(CoreContextIntrinsic::InitializeTaskRegisters),
            RuntimeImportKind::Call,
        ),
        Intrinsic::SetGlobalCurrentTaskMetaFn => (
            "setCurrentTaskMeta",
            Some(CoreContextIntrinsic::InitializeTaskRegisters),
            RuntimeImportKind::Call,
        ),
        Intrinsic::WithGlobalCurrentTaskMetaFn => (
            "withCurrentTaskMeta",
            Some(CoreContextIntrinsic::InitializeTaskRegisters),
            RuntimeImportKind::Call,
        ),
        Intrinsic::WithGlobalCurrentTaskMetaFnAsync => (
            "withCurrentTaskMetaAsync",
            Some(CoreContextIntrinsic::InitializeTaskRegisters),
            RuntimeImportKind::Call,
        ),
        Intrinsic::ClearGlobalCurrentTaskMetaFn => (
            "clearCurrentTaskMeta",
            Some(CoreContextIntrinsic::InitializeTaskRegisters),
            RuntimeImportKind::Call,
        ),
        Intrinsic::SuspendingImportWrapperFn => (
            "suspendingImport",
            Some(CoreContextIntrinsic::SuspendingImport),
            RuntimeImportKind::Call,
        ),
        Intrinsic::ConditionalSuspending1I32ToI32Fn => (
            "conditionalSuspending1I32ToI32",
            Some(CoreContextIntrinsic::ConditionalSuspending),
            RuntimeImportKind::Call,
        ),
        Intrinsic::ConditionalSuspending2I32ToI32Fn => (
            "conditionalSuspending2I32ToI32",
            Some(CoreContextIntrinsic::ConditionalSuspending),
            RuntimeImportKind::Call,
        ),
        Intrinsic::ConditionalSuspending3I32ToI32Fn => (
            "conditionalSuspending3I32ToI32",
            Some(CoreContextIntrinsic::ConditionalSuspending),
            RuntimeImportKind::Call,
        ),
        Intrinsic::ConditionalSuspending3I32ToVoidFn => (
            "conditionalSuspending3I32ToVoid",
            Some(CoreContextIntrinsic::ConditionalSuspending),
            RuntimeImportKind::Call,
        ),
        Intrinsic::GlobalAsyncDeterminism => (
            "initializeAsyncDeterminism",
            Some(CoreContextIntrinsic::InitializeAsyncDeterminism),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::ConstantI32Max => ("i32Max", None, RuntimeImportKind::Value),
        Intrinsic::ConstantI32Min => ("i32Min", None, RuntimeImportKind::Value),
        Intrinsic::SymbolCabiDispose => (
            "initializeSymbolCabiDispose",
            Some(CoreContextIntrinsic::InitializeSymbolCabiDispose),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::SymbolCabiLower => (
            "initializeSymbolCabiLower",
            Some(CoreContextIntrinsic::InitializeSymbolCabiLower),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::SymbolResourceHandle => (
            "initializeSymbolResourceHandle",
            Some(CoreContextIntrinsic::InitializeSymbolResourceHandle),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::SymbolResourceRep => (
            "initializeSymbolResourceRep",
            Some(CoreContextIntrinsic::InitializeSymbolResourceRep),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::SymbolDispose => (
            "initializeSymbolDispose",
            Some(CoreContextIntrinsic::InitializeSymbolDispose),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::SymbolAsyncIterator => (
            "initializeSymbolAsyncIterator",
            Some(CoreContextIntrinsic::InitializeSymbolAsyncIterator),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::SymbolIterator => (
            "initializeSymbolIterator",
            Some(CoreContextIntrinsic::InitializeSymbolIterator),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::AsyncFunctionCtor => (
            "initializeAsyncFunctionConstructor",
            Some(CoreContextIntrinsic::InitializeAsyncFunctionConstructor),
            RuntimeImportKind::InitializedConstructor,
        ),
        Intrinsic::PlatformReadableStreamClass => (
            "initializeReadableStream",
            Some(CoreContextIntrinsic::InitializeReadableStream),
            RuntimeImportKind::InitializedConstructor,
        ),
        Intrinsic::ComponentError => (
            "initializeComponentErrorClass",
            Some(CoreContextIntrinsic::InitializeComponentErrorClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        Intrinsic::WebAssemblyRuntimeError => (
            "initializeRuntimeErrorConstructor",
            Some(CoreContextIntrinsic::InitializeRuntimeErrorConstructor),
            RuntimeImportKind::InitializedConstructor,
        ),
        Intrinsic::ManagedBufferClass => (
            "initializeManagedBufferClass",
            Some(CoreContextIntrinsic::InitializeManagedBufferClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        Intrinsic::BufferManagerClass => (
            "initializeBufferManagerClass",
            Some(CoreContextIntrinsic::InitializeBufferManagerClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        Intrinsic::RepTableClass => (
            "initializeRepTableClass",
            Some(CoreContextIntrinsic::InitializeRepTableClass),
            RuntimeImportKind::InitializedConstructor,
        ),
        Intrinsic::HasOwnProperty => (
            "initializeHasOwnProperty",
            Some(CoreContextIntrinsic::InitializeHasOwnProperty),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::FactTrapMessages => (
            "initializeFactTrapMessages",
            Some(CoreContextIntrinsic::InitializeFactTrapMessages),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::GlobalBufferManager => (
            "initializeBufferManager",
            Some(CoreContextIntrinsic::InitializeBufferManager),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::AsyncEventCodeEnum => (
            "initializeAsyncEventCodes",
            Some(CoreContextIntrinsic::InitializeAsyncEventCodes),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::GlobalComponentMemoryMap => (
            "initializeComponentMemoryMap",
            Some(CoreContextIntrinsic::InitializeComponentMemoryMap),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::GlobalCurrentTaskMeta => (
            "initializeTaskRegisters",
            Some(CoreContextIntrinsic::InitializeTaskRegisters),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::ConditionalSuspendingWasm => (
            "initializeConditionalSuspendingWasm",
            Some(CoreContextIntrinsic::InitializeConditionalSuspendingWasm),
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::IsLE => (
            "initializeEndianness",
            Some(CoreContextIntrinsic::InitializeEndianness),
            RuntimeImportKind::InitializedValue,
        ),
        _ => return None,
    };
    Some(RuntimeImport {
        suffix: "intrinsics/core",
        export,
        context: context.map(RuntimeContextIntrinsic::Core),
        kind,
    })
}

pub(crate) fn discover(intrinsic: Intrinsic, args: &RenderIntrinsicsArgs<'_>) {
    if intrinsic.conditional_suspending_wasm().is_some() {
        args.require_intrinsic(Intrinsic::ConditionalSuspendingWasm);
    }
}
