//! Consumer examples from the 2.16.0 API. Keep these literals and exhaustive
//! matches valid across 2.x releases.

use js_component_bindgen::{TranspileOpts, intrinsics::Intrinsic};

#[cfg(feature = "coop-threads")]
#[test]
fn cooperative_thread_names_alias_published_variants() {
    for (thread, task) in [
        (
            Intrinsic::GlobalCurrentThreadMeta,
            Intrinsic::GlobalCurrentTaskMeta,
        ),
        (
            Intrinsic::GetGlobalCurrentThreadMetaFn,
            Intrinsic::GetGlobalCurrentTaskMetaFn,
        ),
        (
            Intrinsic::SetGlobalCurrentThreadMetaFn,
            Intrinsic::SetGlobalCurrentTaskMetaFn,
        ),
        (
            Intrinsic::WithGlobalCurrentThreadMetaFn,
            Intrinsic::WithGlobalCurrentTaskMetaFn,
        ),
        (
            Intrinsic::WithGlobalCurrentThreadMetaFnAsync,
            Intrinsic::WithGlobalCurrentTaskMetaFnAsync,
        ),
        (
            Intrinsic::ClearGlobalCurrentThreadMetaFn,
            Intrinsic::ClearGlobalCurrentTaskMetaFn,
        ),
    ] {
        assert_eq!(thread, task);
        assert_eq!(thread.name(), task.name());
    }
}

#[test]
fn published_options_remain_exhaustively_constructible() {
    let opts = TranspileOpts {
        name: "component".into(),
        no_typescript: Default::default(),
        instantiation_mode: Default::default(),
        import_bindings: Default::default(),
        map: Default::default(),
        nodejs_compat_disabled: Default::default(),
        base64_cutoff: Default::default(),
        tla_compat: Default::default(),
        valid_lifting_optimization: Default::default(),
        tracing: Default::default(),
        no_component_error_wrapping: Default::default(),
        no_namespaced_exports: Default::default(),
        multi_memory: Default::default(),
        guest: Default::default(),
        async_mode: Default::default(),
        strict: Default::default(),
        perf_strings_skip_copy_utf8_validation: Default::default(),
        perf_strings_skip_copy_utf16_validation: Default::default(),
        flags_as_bigint: Default::default(),
        variants_inline_cases: Default::default(),
        use_namespace_objects: Default::default(),
        enum_values_screaming_snake_case: Default::default(),
        asmjs: Default::default(),
        supports_wasm_exnref: Default::default(),
        emit_conditional_suspending_wasm: Default::default(),
    };
    assert_eq!(opts.name, "component");
}

#[test]
fn published_intrinsics_remain_exhaustively_matchable() {
    let intrinsic = Intrinsic::GlobalCurrentTaskMeta;
    match intrinsic {
        Intrinsic::JsHelper(_)
        | Intrinsic::WebIdl(_)
        | Intrinsic::Conversion(_)
        | Intrinsic::String(_)
        | Intrinsic::Resource(_)
        | Intrinsic::ErrCtx(_)
        | Intrinsic::AsyncTask(_)
        | Intrinsic::Waitable(_)
        | Intrinsic::Lift(_)
        | Intrinsic::Lower(_)
        | Intrinsic::AsyncStream(_)
        | Intrinsic::AsyncFuture(_)
        | Intrinsic::Component(_)
        | Intrinsic::Host(_)
        | Intrinsic::PromiseWithResolversPonyfill
        | Intrinsic::DebugLog
        | Intrinsic::GlobalAsyncDeterminism
        | Intrinsic::CoinFlip
        | Intrinsic::ConstantI32Max
        | Intrinsic::ConstantI32Min
        | Intrinsic::TypeCheckValidI32
        | Intrinsic::TypeCheckAsyncFn
        | Intrinsic::AsyncFunctionCtor
        | Intrinsic::Base64Compile
        | Intrinsic::ClampGuest
        | Intrinsic::FetchCompile
        | Intrinsic::SymbolCabiDispose
        | Intrinsic::SymbolCabiLower
        | Intrinsic::SymbolResourceHandle
        | Intrinsic::SymbolResourceRep
        | Intrinsic::SymbolDispose
        | Intrinsic::SymbolAsyncIterator
        | Intrinsic::SymbolIterator
        | Intrinsic::DisposeHostValue
        | Intrinsic::ScopeId
        | Intrinsic::HandleTables
        | Intrinsic::PlatformReadableStreamClass
        | Intrinsic::FinalizationRegistryCreate
        | Intrinsic::ComponentError
        | Intrinsic::WebAssemblyRuntimeError
        | Intrinsic::FactTrapMessages
        | Intrinsic::GetErrorPayload
        | Intrinsic::GetErrorPayloadString
        | Intrinsic::ManagedBufferClass
        | Intrinsic::BufferManagerClass
        | Intrinsic::GlobalBufferManager
        | Intrinsic::RepTableClass
        | Intrinsic::AsyncEventCodeEnum
        | Intrinsic::IsLE
        | Intrinsic::ThrowInvalidBool
        | Intrinsic::ThrowUninitialized
        | Intrinsic::HasOwnProperty
        | Intrinsic::InstantiateCore
        | Intrinsic::GlobalComponentMemoryMap
        | Intrinsic::RegisterGlobalMemoryForComponent
        | Intrinsic::LookupMemoriesForComponent
        | Intrinsic::GlobalCurrentTaskMeta
        | Intrinsic::GetGlobalCurrentTaskMetaFn
        | Intrinsic::SetGlobalCurrentTaskMetaFn
        | Intrinsic::WithGlobalCurrentTaskMetaFn
        | Intrinsic::WithGlobalCurrentTaskMetaFnAsync
        | Intrinsic::ClearGlobalCurrentTaskMetaFn
        | Intrinsic::SuspendingImportWrapperFn
        | Intrinsic::ConditionalSuspending1I32ToI32Fn
        | Intrinsic::ConditionalSuspending2I32ToI32Fn
        | Intrinsic::ConditionalSuspending3I32ToI32Fn
        | Intrinsic::ConditionalSuspending3I32ToVoidFn
        | Intrinsic::ConditionalSuspendingWasm => {}
    }
}
