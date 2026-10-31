//! Central metadata for named core operations and selected state/constructor owners.
use super::super::{
    Intrinsic, RenderIntrinsicsArgs, component::ComponentIntrinsic,
    p3::async_task::AsyncTaskIntrinsic,
};
use super::{RuntimeContext, RuntimeImport, RuntimeImportKind, RuntimeInitializer};
use crate::intrinsics::runtime::IntrinsicRuntime;
use crate::{source::Source, uwriteln};
use std::fmt::Write;

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum CoreContext {
    GlobalAsyncDeterminism,
    SymbolCabiDispose,
    SymbolCabiLower,
    SymbolResourceHandle,
    SymbolResourceRep,
    SymbolDispose,
    SymbolAsyncIterator,
    SymbolIterator,
    AsyncFunctionCtor,
    PlatformReadableStreamClass,
    ComponentError,
    WebAssemblyRuntimeError,
    ManagedBufferClass,
    BufferManagerClass,
    RepTableClass,
    HasOwnProperty,
    FactTrapMessages,
    GlobalBufferManager,
    AsyncEventCodeEnum,
    GlobalComponentMemoryMap,
    GlobalCurrentTaskMeta,
    ConditionalSuspendingWasm,
    IsLE,
    Base64Compile,
    FetchCompile,
    SelectedWebAssembly,
    SuspendingImport,
    ConditionalSuspending,
    FileCompileCache,
}
impl CoreContext {
    const ALL: &'static [Self] = &[
        Self::GlobalAsyncDeterminism,
        Self::SymbolCabiDispose,
        Self::SymbolCabiLower,
        Self::SymbolResourceHandle,
        Self::SymbolResourceRep,
        Self::SymbolDispose,
        Self::SymbolAsyncIterator,
        Self::SymbolIterator,
        Self::AsyncFunctionCtor,
        Self::PlatformReadableStreamClass,
        Self::ComponentError,
        Self::WebAssemblyRuntimeError,
        Self::ManagedBufferClass,
        Self::BufferManagerClass,
        Self::RepTableClass,
        Self::HasOwnProperty,
        Self::FactTrapMessages,
        Self::GlobalBufferManager,
        Self::AsyncEventCodeEnum,
        Self::GlobalComponentMemoryMap,
        Self::GlobalCurrentTaskMeta,
        Self::ConditionalSuspendingWasm,
        Self::IsLE,
        Self::Base64Compile,
        Self::FetchCompile,
        Self::SelectedWebAssembly,
        Self::SuspendingImport,
        Self::ConditionalSuspending,
        Self::FileCompileCache,
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
            Self::GlobalAsyncDeterminism => "ASYNC_DETERMINISM",
            Self::SymbolCabiDispose => "symbolCabiDispose",
            Self::SymbolCabiLower => "symbolCabiLower",
            Self::SymbolResourceHandle => "symbolRscHandle",
            Self::SymbolResourceRep => "symbolRscRep",
            Self::SymbolDispose => "symbolDispose",
            Self::SymbolAsyncIterator => "symbolAsyncIterator",
            Self::SymbolIterator => "symbolIterator",
            Self::AsyncFunctionCtor => "ASYNC_FN_CTOR",
            Self::PlatformReadableStreamClass => "_PlatformReadableStream",
            Self::ComponentError => "ComponentError",
            Self::WebAssemblyRuntimeError => "WebAssemblyRuntimeError",
            Self::ManagedBufferClass => "ManagedBuffer",
            Self::BufferManagerClass => "BufferManager",
            Self::RepTableClass => "RepTable",
            Self::HasOwnProperty => "hasOwnProperty",
            Self::FactTrapMessages => "FACT_TRAP_MESSAGES",
            Self::GlobalBufferManager => "BUFFER_MGR",
            Self::AsyncEventCodeEnum => "ASYNC_EVENT_CODE",
            Self::GlobalComponentMemoryMap => "GLOBAL_COMPONENT_MEMORY_MAP",
            Self::GlobalCurrentTaskMeta => "CURRENT_TASK_META",
            Self::ConditionalSuspendingWasm => "CONDITIONAL_SUSPENDING_WASM",
            Self::IsLE => "isLE",
            Self::Base64Compile => "_jcoBase64CompileContext",
            Self::FetchCompile => "_jcoFetchCompileContext",
            Self::SelectedWebAssembly => "WebAssembly",
            Self::SuspendingImport => "_jcoSuspendingImportContext",
            Self::ConditionalSuspending => "_jcoConditionalSuspendingContext",
            Self::FileCompileCache => "_jcoFileCompileCache",
        }
    }
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::GlobalAsyncDeterminism => (
                "initializeAsyncDeterminism",
                "_jcoInitializeAsyncDeterminism",
            ),
            Self::SymbolCabiDispose => (
                "initializeSymbolCabiDispose",
                "_jcoInitializeSymbolCabiDispose",
            ),
            Self::SymbolCabiLower => ("initializeSymbolCabiLower", "_jcoInitializeSymbolCabiLower"),
            Self::SymbolResourceHandle => (
                "initializeSymbolResourceHandle",
                "_jcoInitializeSymbolResourceHandle",
            ),
            Self::SymbolResourceRep => (
                "initializeSymbolResourceRep",
                "_jcoInitializeSymbolResourceRep",
            ),
            Self::SymbolDispose => ("initializeSymbolDispose", "_jcoInitializeSymbolDispose"),
            Self::SymbolAsyncIterator => (
                "initializeSymbolAsyncIterator",
                "_jcoInitializeSymbolAsyncIterator",
            ),
            Self::SymbolIterator => ("initializeSymbolIterator", "_jcoInitializeSymbolIterator"),
            Self::AsyncFunctionCtor => (
                "initializeAsyncFunctionConstructor",
                "_jcoInitializeAsyncFunctionConstructor",
            ),
            Self::PlatformReadableStreamClass => {
                ("initializeReadableStream", "_jcoInitializeReadableStream")
            }
            Self::ComponentError => (
                "initializeComponentErrorClass",
                "_jcoInitializeComponentErrorClass",
            ),
            Self::WebAssemblyRuntimeError => (
                "initializeRuntimeErrorConstructor",
                "_jcoInitializeRuntimeErrorConstructor",
            ),
            Self::ManagedBufferClass => (
                "initializeManagedBufferClass",
                "_jcoInitializeManagedBufferClass",
            ),
            Self::BufferManagerClass => (
                "initializeBufferManagerClass",
                "_jcoInitializeBufferManagerClass",
            ),
            Self::RepTableClass => ("initializeRepTableClass", "_jcoInitializeRepTableClass"),
            Self::HasOwnProperty => ("initializeHasOwnProperty", "_jcoInitializeHasOwnProperty"),
            Self::FactTrapMessages => (
                "initializeFactTrapMessages",
                "_jcoInitializeFactTrapMessages",
            ),
            Self::GlobalBufferManager => ("initializeBufferManager", "_jcoInitializeBufferManager"),
            Self::AsyncEventCodeEnum => {
                ("initializeAsyncEventCodes", "_jcoInitializeAsyncEventCodes")
            }
            Self::GlobalComponentMemoryMap => (
                "initializeComponentMemoryMap",
                "_jcoInitializeComponentMemoryMap",
            ),
            Self::GlobalCurrentTaskMeta => {
                ("initializeTaskRegisters", "_jcoInitializeTaskRegisters")
            }
            Self::ConditionalSuspendingWasm => (
                "initializeConditionalSuspendingWasm",
                "_jcoInitializeConditionalSuspendingWasm",
            ),
            Self::IsLE => ("initializeEndianness", "_jcoInitializeEndianness"),
            Self::FileCompileCache => (
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
    pub(crate) fn dependencies(self) -> &'static [RuntimeContext] {
        match self {
            Self::ManagedBufferClass => &[RuntimeContext::ResourceTransferOwn],
            Self::BufferManagerClass => &[RuntimeContext::Core(Self::ManagedBufferClass)],
            Self::RepTableClass => &[RuntimeContext::ResourceTableGet],
            Self::GlobalBufferManager => &[RuntimeContext::Core(Self::BufferManagerClass)],
            Self::FetchCompile => &[RuntimeContext::Core(Self::FileCompileCache)],
            Self::SuspendingImport => &[RuntimeContext::Core(Self::GlobalCurrentTaskMeta)],
            Self::ConditionalSuspending => &[RuntimeContext::Core(Self::ConditionalSuspendingWasm)],
            _ => &[],
        }
    }
    pub(crate) fn render(self, output: &mut Source, args: &RenderIntrinsicsArgs<'_>) {
        let local = self.local_name();
        if let Some(initializer) = self.initializer() {
            let initialize = initializer.local_name;
            let arguments: String = match self {
                Self::GlobalAsyncDeterminism => format!("'{}'", args.determinism_profile),
                Self::WebAssemblyRuntimeError => "WebAssembly".into(),
                Self::PlatformReadableStreamClass => "ReadableStream".into(),
                Self::ManagedBufferClass => "_jcoResourceTransferOwnContext".into(),
                Self::BufferManagerClass => "ManagedBuffer".into(),
                Self::RepTableClass => "_jcoResourceTableGetContext".into(),
                Self::FactTrapMessages => super::super::fact_trap_messages_js(),
                Self::GlobalBufferManager => "BufferManager".into(),
                Self::FileCompileCache => (!args.transpile_opts.nodejs_compat_disabled).to_string(),
                _ => String::new(),
            };
            uwriteln!(output, "const {local} = {initialize}({arguments});");
            return;
        }
        let nodejs_compat = !args.transpile_opts.nodejs_compat_disabled;
        match self {
            Self::SelectedWebAssembly => {}
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
            Self::SuspendingImport => {
                let call = |intrinsic: Intrinsic, operands| {
                    super::ExternalRuntime.call(intrinsic, operands)
                };
                let check = call(ComponentIntrinsic::CheckMayLeave.into(), "componentIdx");
                let record = call(
                    ComponentIntrinsic::RecordTrap.into(),
                    "componentIdx, error, convertsRangeErrors",
                );
                let state = call(
                    ComponentIntrinsic::GetOrCreateAsyncState.into(),
                    "componentIdx",
                );
                let task = call(
                    AsyncTaskIntrinsic::GetCurrentThread.into(),
                    "componentIdx, threadID, taskID",
                );
                let block = super::ExternalRuntime.reference(Intrinsic::AsyncTask(
                    AsyncTaskIntrinsic::CurrentTaskMayBlock,
                ));
                uwriteln!(
                    output,
                    "const {local} = {{ registers: CURRENT_TASK_META, RuntimeError: WebAssembly.RuntimeError, checkMayLeave: componentIdx => {check}, recordTrap: (componentIdx, error, convertsRangeErrors) => {record}, throwIfInterrupted: componentIdx => {state}.throwIfInterrupted(), getCurrentThread: (componentIdx, threadID, taskID) => {task}, currentTaskMayBlock: () => {block}.value }};"
                );
            }
            _ => unreachable!("all other core contexts have selected initializers"),
        }
    }
}

pub(crate) fn import(intrinsic: Intrinsic) -> Option<RuntimeImport> {
    use RuntimeImportKind as K;
    let (export, context, kind) = match intrinsic {
        Intrinsic::PromiseWithResolversPonyfill => ("promiseWithResolvers", None, K::Call),
        Intrinsic::DebugLog => ("debugLog", None, K::Call),
        Intrinsic::CoinFlip => ("coinFlip", None, K::Call),
        Intrinsic::TypeCheckValidI32 => ("typeCheckValidI32", None, K::Call),
        Intrinsic::TypeCheckAsyncFn => (
            "typeCheckAsyncFn",
            Some(CoreContext::AsyncFunctionCtor),
            K::Call,
        ),
        Intrinsic::Base64Compile => ("base64Compile", Some(CoreContext::Base64Compile), K::Call),
        Intrinsic::ClampGuest => ("clampGuest", None, K::Call),
        Intrinsic::FetchCompile => ("fetchCompile", Some(CoreContext::FetchCompile), K::Call),
        Intrinsic::DisposeHostValue => (
            "disposeHostValue",
            Some(CoreContext::SymbolDispose),
            K::Call,
        ),
        Intrinsic::FinalizationRegistryCreate => ("finalizationRegistryCreate", None, K::Call),
        Intrinsic::GetErrorPayload => (
            "getErrorPayload",
            Some(CoreContext::HasOwnProperty),
            K::Call,
        ),
        Intrinsic::GetErrorPayloadString => (
            "getErrorPayloadString",
            Some(CoreContext::HasOwnProperty),
            K::Call,
        ),
        Intrinsic::ThrowInvalidBool => ("throwInvalidBool", None, K::Call),
        Intrinsic::ThrowUninitialized => ("throwUninitialized", None, K::Call),
        Intrinsic::InstantiateCore => (
            "instantiateCore",
            Some(CoreContext::SelectedWebAssembly),
            K::Call,
        ),
        Intrinsic::RegisterGlobalMemoryForComponent => (
            "registerMemory",
            Some(CoreContext::GlobalComponentMemoryMap),
            K::Call,
        ),
        Intrinsic::LookupMemoriesForComponent => (
            "lookupMemories",
            Some(CoreContext::GlobalComponentMemoryMap),
            K::Call,
        ),
        Intrinsic::GetGlobalCurrentTaskMetaFn => (
            "getCurrentTaskMeta",
            Some(CoreContext::GlobalCurrentTaskMeta),
            K::Call,
        ),
        Intrinsic::SetGlobalCurrentTaskMetaFn => (
            "setCurrentTaskMeta",
            Some(CoreContext::GlobalCurrentTaskMeta),
            K::Call,
        ),
        Intrinsic::WithGlobalCurrentTaskMetaFn => (
            "withCurrentTaskMeta",
            Some(CoreContext::GlobalCurrentTaskMeta),
            K::Call,
        ),
        Intrinsic::WithGlobalCurrentTaskMetaFnAsync => (
            "withCurrentTaskMetaAsync",
            Some(CoreContext::GlobalCurrentTaskMeta),
            K::Call,
        ),
        Intrinsic::ClearGlobalCurrentTaskMetaFn => (
            "clearCurrentTaskMeta",
            Some(CoreContext::GlobalCurrentTaskMeta),
            K::Call,
        ),
        Intrinsic::SuspendingImportWrapperFn => (
            "suspendingImport",
            Some(CoreContext::SuspendingImport),
            K::Call,
        ),
        Intrinsic::ConditionalSuspending1I32ToI32Fn => (
            "conditionalSuspending1I32ToI32",
            Some(CoreContext::ConditionalSuspending),
            K::Call,
        ),
        Intrinsic::ConditionalSuspending2I32ToI32Fn => (
            "conditionalSuspending2I32ToI32",
            Some(CoreContext::ConditionalSuspending),
            K::Call,
        ),
        Intrinsic::ConditionalSuspending3I32ToI32Fn => (
            "conditionalSuspending3I32ToI32",
            Some(CoreContext::ConditionalSuspending),
            K::Call,
        ),
        Intrinsic::ConditionalSuspending3I32ToVoidFn => (
            "conditionalSuspending3I32ToVoid",
            Some(CoreContext::ConditionalSuspending),
            K::Call,
        ),
        Intrinsic::GlobalAsyncDeterminism => (
            "initializeAsyncDeterminism",
            Some(CoreContext::GlobalAsyncDeterminism),
            K::InitializedValue,
        ),
        Intrinsic::ConstantI32Max => ("i32Max", None, K::Value),
        Intrinsic::ConstantI32Min => ("i32Min", None, K::Value),
        Intrinsic::SymbolCabiDispose => (
            "initializeSymbolCabiDispose",
            Some(CoreContext::SymbolCabiDispose),
            K::InitializedValue,
        ),
        Intrinsic::SymbolCabiLower => (
            "initializeSymbolCabiLower",
            Some(CoreContext::SymbolCabiLower),
            K::InitializedValue,
        ),
        Intrinsic::SymbolResourceHandle => (
            "initializeSymbolResourceHandle",
            Some(CoreContext::SymbolResourceHandle),
            K::InitializedValue,
        ),
        Intrinsic::SymbolResourceRep => (
            "initializeSymbolResourceRep",
            Some(CoreContext::SymbolResourceRep),
            K::InitializedValue,
        ),
        Intrinsic::SymbolDispose => (
            "initializeSymbolDispose",
            Some(CoreContext::SymbolDispose),
            K::InitializedValue,
        ),
        Intrinsic::SymbolAsyncIterator => (
            "initializeSymbolAsyncIterator",
            Some(CoreContext::SymbolAsyncIterator),
            K::InitializedValue,
        ),
        Intrinsic::SymbolIterator => (
            "initializeSymbolIterator",
            Some(CoreContext::SymbolIterator),
            K::InitializedValue,
        ),
        Intrinsic::AsyncFunctionCtor => (
            "initializeAsyncFunctionConstructor",
            Some(CoreContext::AsyncFunctionCtor),
            K::InitializedConstructor,
        ),
        Intrinsic::PlatformReadableStreamClass => (
            "initializeReadableStream",
            Some(CoreContext::PlatformReadableStreamClass),
            K::InitializedConstructor,
        ),
        Intrinsic::ComponentError => (
            "initializeComponentErrorClass",
            Some(CoreContext::ComponentError),
            K::InitializedConstructor,
        ),
        Intrinsic::WebAssemblyRuntimeError => (
            "initializeRuntimeErrorConstructor",
            Some(CoreContext::WebAssemblyRuntimeError),
            K::InitializedConstructor,
        ),
        Intrinsic::ManagedBufferClass => (
            "initializeManagedBufferClass",
            Some(CoreContext::ManagedBufferClass),
            K::InitializedConstructor,
        ),
        Intrinsic::BufferManagerClass => (
            "initializeBufferManagerClass",
            Some(CoreContext::BufferManagerClass),
            K::InitializedConstructor,
        ),
        Intrinsic::RepTableClass => (
            "initializeRepTableClass",
            Some(CoreContext::RepTableClass),
            K::InitializedConstructor,
        ),
        Intrinsic::HasOwnProperty => (
            "initializeHasOwnProperty",
            Some(CoreContext::HasOwnProperty),
            K::InitializedValue,
        ),
        Intrinsic::FactTrapMessages => (
            "initializeFactTrapMessages",
            Some(CoreContext::FactTrapMessages),
            K::InitializedValue,
        ),
        Intrinsic::GlobalBufferManager => (
            "initializeBufferManager",
            Some(CoreContext::GlobalBufferManager),
            K::InitializedValue,
        ),
        Intrinsic::AsyncEventCodeEnum => (
            "initializeAsyncEventCodes",
            Some(CoreContext::AsyncEventCodeEnum),
            K::InitializedValue,
        ),
        Intrinsic::GlobalComponentMemoryMap => (
            "initializeComponentMemoryMap",
            Some(CoreContext::GlobalComponentMemoryMap),
            K::InitializedValue,
        ),
        Intrinsic::GlobalCurrentTaskMeta => (
            "initializeTaskRegisters",
            Some(CoreContext::GlobalCurrentTaskMeta),
            K::InitializedValue,
        ),
        Intrinsic::ConditionalSuspendingWasm => (
            "initializeConditionalSuspendingWasm",
            Some(CoreContext::ConditionalSuspendingWasm),
            K::InitializedValue,
        ),
        Intrinsic::IsLE => (
            "initializeEndianness",
            Some(CoreContext::IsLE),
            K::InitializedValue,
        ),
        _ => return None,
    };
    Some(RuntimeImport {
        suffix: "intrinsics/core",
        export,
        context: context.map(RuntimeContext::Core),
        kind,
    })
}

pub(crate) fn discover(intrinsic: Intrinsic, args: &RenderIntrinsicsArgs<'_>) {
    if intrinsic.conditional_suspending_wasm().is_some() {
        args.require_intrinsic(Intrinsic::ConditionalSuspendingWasm);
    }
    if intrinsic == Intrinsic::SuspendingImportWrapperFn {
        for dependency in [
            Intrinsic::Component(ComponentIntrinsic::CheckMayLeave),
            Intrinsic::Component(ComponentIntrinsic::RecordTrap),
            Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
            Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentThread),
            Intrinsic::AsyncTask(AsyncTaskIntrinsic::CurrentTaskMayBlock),
        ] {
            args.require_intrinsic(dependency);
        }
    }
}
