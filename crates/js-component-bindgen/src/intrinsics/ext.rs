//! Runtime that imports named exports from an external Component Model runtime
//! package, rendering every intrinsic it does not import inline. Keep public suffix
//! selection and base resolution here.

use anyhow::{Result, bail, ensure};

use super::component::ComponentIntrinsic;
use super::conversion::ConversionIntrinsic;
use super::inline::InlineRuntime;
use super::js_helper::JsHelperIntrinsic;
use super::lift::LiftIntrinsic;
use super::lower::LowerIntrinsic;
use super::p3::async_future::AsyncFutureIntrinsic;
use super::p3::async_stream::AsyncStreamIntrinsic;
use super::p3::async_task::AsyncTaskIntrinsic;
use super::p3::error_context::ErrCtxIntrinsic;
use super::p3::host::HostIntrinsic;
use super::p3::waitable::WaitableIntrinsic;
use super::resource::ResourceIntrinsic;
use super::runtime::{self, BaseIntrinsic, IntrinsicBinding, IntrinsicRuntime, Provides};
use super::string::StringIntrinsic;
use super::webidl::WebIdlIntrinsic;
use super::{Intrinsic, RenderIntrinsicsArgs};
use crate::{names::js_string_literal, source::Source, uwriteln};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write;

mod async_task;
use async_task::TaskContext;
mod component;
pub(crate) mod conversion;
mod core;
mod error_context;
mod future;
pub(crate) use future::FutureContext;
mod host;
mod lift;
mod lower;
mod stream;
use error_context::ErrCtxContext;
use host::HostContext;
use lift::LiftContext;
use lower::LowerContext;
use stream::StreamContext;
mod waitable;
use component::ComponentContext;
use core::CoreContext;
use waitable::WaitableContext;
pub(crate) mod js_helper;
pub(crate) mod resource;
pub(crate) mod string;
pub(crate) mod webidl;

pub(crate) const CM_RUNTIME_API_VERSION: u32 = 1;
pub(crate) const VERSION_LOCAL: &str = "_jcoRuntimeApiVersion";
pub(crate) const TABLE_GET_CONTEXT: &str = "_jcoResourceTableGetContext";

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum RuntimeContext {
    Core(CoreContext),
    Component(ComponentContext),
    Waitable(WaitableContext),
    ErrCtx(ErrCtxContext),
    Task(TaskContext),
    Host(HostContext),
    Lift(LiftContext),
    Lower(LowerContext),
    Future(FutureContext),
    Stream(StreamContext),
    ResourceTableGet,
    HandleIndexSpaces,
    HandleTables,
    CallBorrows,
    CurrentBorrows,
    ResourceScopeCounter,
    ResourceScopeTasks,
    ScopeId,
    ResourceRemove,
    ResourceTransferOwn,
    ResourceTransferBorrow,
    ResourceDestructor,
    StrictNumeric,
    Bitcast32,
    Bitcast64,
    DataViewCache,
    Utf8Decoder,
    Utf16Decoder,
    Utf8Encoder,
    Utf16Encoding,
    WebIdlProxyCache,
}

impl RuntimeContext {
    pub(crate) fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            TABLE_GET_CONTEXT,
            "HANDLE_INDEX_SPACES",
            "_jcoInitializeHandleIndexSpaces",
            "HANDLE_TABLES",
            "_jcoInitializeHandleTables",
            "_jcoCallBorrowContext",
            "_jcoInitializeCallBorrows",
            "_jcoCurrentBorrowContext",
            "_jcoInitializeCurrentBorrows",
            "_jcoResourceScopeCounterContext",
            "_jcoInitializeResourceScopeCounter",
            "RESOURCE_SCOPE_TASKS",
            "_jcoInitializeResourceScopeTasks",
            "_jcoScopeIdContext",
            "_jcoInitializeScopeId",
            "_jcoResourceRemoveContext",
            "_jcoResourceTransferOwnContext",
            "_jcoResourceTransferBorrowContext",
            "_jcoResourceDestructorContext",
            "_jcoStrictNumericContext",
            "_jcoBitcast32Context",
            "_jcoBitcast64Context",
            "_jcoInitializeBitcast32",
            "_jcoInitializeBitcast64",
            "_jcoDataViewCacheContext",
            "_jcoInitializeDataViewCache",
            "_jcoInitializeUtf8Decoder",
            "_jcoInitializeUtf16Decoder",
            "_jcoInitializeUtf8Encoder",
            "_jcoInitializeUtf16Encoding",
            "_jcoUtf16EncodingContext",
            "_jcoWebIdlProxyCacheContext",
            "_jcoInitializeWebIdlProxyCache",
        ]
        .into_iter()
        .chain(CoreContext::get_global_names())
        .chain(ComponentContext::get_global_names())
        .chain(WaitableContext::get_global_names())
        .chain(ErrCtxContext::get_global_names())
        .chain(TaskContext::get_global_names())
        .chain(HostContext::get_global_names())
        .chain(LiftContext::get_global_names())
        .chain(LowerContext::get_global_names())
        .chain(FutureContext::get_global_names())
        .chain(StreamContext::get_global_names())
    }

    pub(crate) fn local_name(self) -> &'static str {
        match self {
            Self::Core(context) => context.local_name(),
            Self::Component(context) => context.local_name(),
            Self::Waitable(context) => context.local_name(),
            Self::ErrCtx(context) => context.local_name(),
            Self::Task(context) => context.local_name(),
            Self::Host(context) => context.local_name(),
            Self::Lift(context) => context.local_name(),
            Self::Lower(context) => context.local_name(),
            Self::Future(context) => context.local_name(),
            Self::Stream(context) => context.local_name(),
            Self::ResourceTableGet => TABLE_GET_CONTEXT,
            Self::HandleIndexSpaces => "HANDLE_INDEX_SPACES",
            Self::HandleTables => "HANDLE_TABLES",
            Self::CallBorrows => "_jcoCallBorrowContext",
            Self::CurrentBorrows => "_jcoCurrentBorrowContext",
            Self::ResourceScopeCounter => "_jcoResourceScopeCounterContext",
            Self::ResourceScopeTasks => "RESOURCE_SCOPE_TASKS",
            Self::ScopeId => "_jcoScopeIdContext",
            Self::ResourceRemove => "_jcoResourceRemoveContext",
            Self::ResourceTransferOwn => "_jcoResourceTransferOwnContext",
            Self::ResourceTransferBorrow => "_jcoResourceTransferBorrowContext",
            Self::ResourceDestructor => "_jcoResourceDestructorContext",
            Self::StrictNumeric => "_jcoStrictNumericContext",
            Self::Bitcast32 => "_jcoBitcast32Context",
            Self::Bitcast64 => "_jcoBitcast64Context",
            Self::DataViewCache => "_jcoDataViewCacheContext",
            Self::Utf8Decoder => "TEXT_DECODER_UTF8",
            Self::Utf16Decoder => "utf16Decoder",
            Self::Utf8Encoder => "TEXT_ENCODER_UTF8",
            Self::Utf16Encoding => "_jcoUtf16EncodingContext",
            Self::WebIdlProxyCache => "_jcoWebIdlProxyCacheContext",
        }
    }

    /// Initializers return narrow state, never operation tables.
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (suffix, export, local_name) = match self {
            Self::Core(context) => return context.initializer(),
            Self::Component(context) => return context.initializer(),
            Self::Waitable(context) => return context.initializer(),
            Self::ErrCtx(context) => return context.initializer(),
            Self::Task(context) => return context.initializer(),
            Self::Host(context) => return context.initializer(),
            Self::Lift(context) => return context.initializer(),
            Self::Lower(context) => return context.initializer(),
            Self::Future(context) => return context.initializer(),
            Self::Stream(context) => return context.initializer(),
            Self::HandleIndexSpaces => (
                "intrinsics/resource",
                "initializeHandleIndexSpaces",
                "_jcoInitializeHandleIndexSpaces",
            ),
            Self::HandleTables => (
                "intrinsics/resource",
                "initializeHandleTables",
                "_jcoInitializeHandleTables",
            ),
            Self::CallBorrows => (
                "intrinsics/resource",
                "initializeCallBorrows",
                "_jcoInitializeCallBorrows",
            ),
            Self::CurrentBorrows => (
                "intrinsics/resource",
                "initializeCurrentBorrows",
                "_jcoInitializeCurrentBorrows",
            ),
            Self::ResourceScopeCounter => (
                "intrinsics/resource",
                "initializeResourceScopeCounter",
                "_jcoInitializeResourceScopeCounter",
            ),
            Self::ResourceScopeTasks => (
                "intrinsics/resource",
                "initializeResourceScopeTasks",
                "_jcoInitializeResourceScopeTasks",
            ),
            Self::ScopeId => (
                "intrinsics/resource",
                "initializeScopeId",
                "_jcoInitializeScopeId",
            ),
            Self::Bitcast32 => (
                "intrinsics/conversion",
                "initializeBitcast32",
                "_jcoInitializeBitcast32",
            ),
            Self::Bitcast64 => (
                "intrinsics/conversion",
                "initializeBitcast64",
                "_jcoInitializeBitcast64",
            ),
            Self::DataViewCache => (
                "intrinsics/js-helper",
                "initializeDataViewCache",
                "_jcoInitializeDataViewCache",
            ),
            Self::Utf8Decoder => (
                "intrinsics/string",
                "initializeUtf8Decoder",
                "_jcoInitializeUtf8Decoder",
            ),
            Self::Utf16Decoder => (
                "intrinsics/string",
                "initializeUtf16Decoder",
                "_jcoInitializeUtf16Decoder",
            ),
            Self::Utf8Encoder => (
                "intrinsics/string",
                "initializeUtf8Encoder",
                "_jcoInitializeUtf8Encoder",
            ),
            Self::Utf16Encoding => (
                "intrinsics/string",
                "initializeUtf16Encoding",
                "_jcoInitializeUtf16Encoding",
            ),
            Self::WebIdlProxyCache => (
                "intrinsics/webidl",
                "initializeWebIdlProxyCache",
                "_jcoInitializeWebIdlProxyCache",
            ),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix,
            export,
            local_name,
        })
    }

    pub(crate) fn dependencies(self) -> &'static [Self] {
        match self {
            Self::Core(context) => context.dependencies(),
            Self::Component(context) => context.dependencies(),
            Self::Waitable(context) => context.dependencies(),
            Self::ErrCtx(context) => context.dependencies(),
            Self::Task(context) => context.dependencies(),
            Self::Host(context) => context.dependencies(),
            Self::Lift(context) => context.dependencies(),
            Self::Lower(context) => context.dependencies(),
            Self::Future(context) => context.dependencies(),
            Self::Stream(context) => context.dependencies(),
            Self::ResourceRemove => &[Self::HandleIndexSpaces, Self::ResourceScopeTasks],
            Self::ResourceTransferOwn => &[
                Self::HandleIndexSpaces,
                Self::ResourceScopeTasks,
                Self::HandleTables,
            ],
            Self::ResourceTransferBorrow => &[
                Self::HandleIndexSpaces,
                Self::HandleTables,
                Self::ScopeId,
                Self::CallBorrows,
                Self::Task(TaskContext::Lookup),
            ],
            Self::ResourceDestructor => &[
                Self::Core(CoreContext::GlobalCurrentTaskMeta),
                Self::Task(TaskContext::Creation),
            ],
            _ => &[],
        }
    }

    pub(crate) fn collect(self, contexts: &mut Vec<Self>) {
        if contexts.contains(&self) {
            return;
        }
        for dep in self.dependencies() {
            dep.collect(contexts);
        }
        contexts.push(self);
    }

    pub(crate) fn render(self, output: &mut Source, args: &super::RenderIntrinsicsArgs<'_>) {
        let strict = args.transpile_opts.strict;
        let local = self.local_name();
        match self {
            Self::Core(context) => context.render(output, args),
            Self::Component(context) => context.render(output, args),
            Self::Waitable(context) => context.render(output, args),
            Self::ErrCtx(context) => context.render(output, args),
            Self::Task(context) => context.render(output, args),
            Self::Host(context) => context.render(output, args),
            Self::Lift(context) => context.render(output, args),
            Self::Lower(context) => context.render(output, args),
            Self::Future(context) => context.render(output, args),
            Self::Stream(context) => context.render(output, args),
            Self::ResourceRemove => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, indexSpaces: HANDLE_INDEX_SPACES, scopeTasks: RESOURCE_SCOPE_TASKS }};"
            ),
            Self::ResourceTransferOwn => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, indexSpaces: HANDLE_INDEX_SPACES, scopeTasks: RESOURCE_SCOPE_TASKS, tables: HANDLE_TABLES }};"
            ),
            Self::ResourceTransferBorrow => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, indexSpaces: HANDLE_INDEX_SPACES, tables: HANDLE_TABLES, scope: _jcoScopeIdContext, callBorrows: _jcoCallBorrowContext, taskLookup: _jcoTaskLookupContext }};"
            ),
            Self::ResourceDestructor => uwriteln!(
                output,
                "const {local} = {{ registers: CURRENT_TASK_META, creation: _jcoTaskCreateContext }};"
            ),
            Self::ResourceTableGet => uwriteln!(
                output,
                "const {TABLE_GET_CONTEXT} = {{ RuntimeError: WebAssembly.RuntimeError }};"
            ),
            Self::StrictNumeric => {
                uwriteln!(output, "const {local} = {{ strict: {strict} }};")
            }
            Self::HandleIndexSpaces
            | Self::HandleTables
            | Self::CallBorrows
            | Self::CurrentBorrows
            | Self::ResourceScopeCounter
            | Self::ResourceScopeTasks
            | Self::ScopeId
            | Self::Bitcast32
            | Self::Bitcast64
            | Self::DataViewCache
            | Self::Utf8Decoder
            | Self::Utf16Decoder
            | Self::Utf8Encoder
            | Self::Utf16Encoding
            | Self::WebIdlProxyCache => {
                let initialize = self.initializer().unwrap().local_name;
                uwriteln!(output, "const {local} = {initialize}();")
            }
        }
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) struct RuntimeInitializer {
    pub(crate) suffix: &'static str,
    pub(crate) export: &'static str,
    pub(crate) local_name: &'static str,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum RuntimeImportKind {
    Call,
    Value,
    LiveReference {
        expression: &'static str,
    },
    /// The binding refers to the selected context initializer's returned value.
    InitializedValue,
    /// Selected class or native constructor; preserve new/instanceof/statics.
    InitializedConstructor,
}

/// A named operation or initialized value, with separately selected capabilities.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) struct RuntimeImport {
    pub(crate) suffix: &'static str,
    pub(crate) export: &'static str,
    pub(crate) context: Option<RuntimeContext>,
    pub(crate) kind: RuntimeImportKind,
}

/// Imports what the external runtime implements and delegates the rest to
/// [`InlineRuntime`]. To move an intrinsic into the runtime package, describe its
/// import in the corresponding external-runtime module and give that family an
/// explicit [`Provides`] impl.
#[derive(Debug, Default, Copy, Clone)]
pub(crate) struct ExternalRuntime;

impl ExternalRuntime {
    /// Exports of `<base>/intrinsics/resource`.
    fn import(intrinsic: Intrinsic) -> Option<RuntimeImport> {
        if let Some(import) = core::import(intrinsic) {
            return Some(import);
        }
        match intrinsic {
            Intrinsic::AsyncStream(i) => Some(stream::import(i)),
            Intrinsic::AsyncFuture(i) => Some(future::import(i)),
            Intrinsic::Lower(i) => Some(lower::import(i)),
            Intrinsic::Lift(i) => Some(lift::import(i)),
            Intrinsic::Host(i) => Some(host::import(i)),
            Intrinsic::AsyncTask(i) => async_task::import(i),
            Intrinsic::ErrCtx(i) => Some(error_context::import(i)),
            Intrinsic::Waitable(i) => Some(waitable::import(i)),
            Intrinsic::Component(i) => Some(component::import(i)),
            Intrinsic::Resource(i) => Some(resource::resource_import(i)),
            Intrinsic::HandleTables | Intrinsic::ScopeId => {
                Some(resource::resource_owner_import(intrinsic))
            }
            Intrinsic::Conversion(i) => Some(conversion::import(i)),
            Intrinsic::JsHelper(i) => js_helper::import(i),
            Intrinsic::String(i) => Some(string::import(i)),
            Intrinsic::WebIdl(i) => Some(webidl::import(i)),
            _ => None,
        }
    }

    fn imports(
        intrinsics: &BTreeSet<Intrinsic>,
    ) -> impl Iterator<Item = (Intrinsic, RuntimeImport)> + '_ {
        intrinsics
            .iter()
            .filter_map(|&intrinsic| Some((intrinsic, Self::import(intrinsic)?)))
    }

    /// Called after dependency discovery, so transitive inline calls also get their imports.
    pub(crate) fn render_imports(
        &self,
        output: &mut Source,
        intrinsics: &BTreeSet<Intrinsic>,
        base: &str,
    ) {
        let mut modules = BTreeMap::<&str, BTreeSet<(&str, &str)>>::new();
        for (intrinsic, import) in Self::imports(intrinsics) {
            if matches!(
                import.kind,
                RuntimeImportKind::Call | RuntimeImportKind::Value
            ) {
                modules
                    .entry(import.suffix)
                    .or_default()
                    .insert((import.export, intrinsic.name()));
            }
            let mut contexts = Vec::new();
            if let Some(context) = import.context {
                context.collect(&mut contexts);
            }
            for initializer in contexts.into_iter().filter_map(RuntimeContext::initializer) {
                modules
                    .entry(initializer.suffix)
                    .or_default()
                    .insert((initializer.export, initializer.local_name));
            }
        }
        if modules.is_empty() {
            return;
        }
        modules
            .entry("runtime")
            .or_default()
            .insert(("CM_RUNTIME_API_VERSION", VERSION_LOCAL));
        for (suffix, names) in modules {
            let names = names
                .into_iter()
                .map(|(export, local)| format!("{export} as {local}"))
                .collect::<Vec<_>>()
                .join(", ");
            let specifier =
                module_specifier(base, suffix).expect("runtime base was validated before codegen");
            uwriteln!(
                output,
                "import {{ {names} }} from {};",
                js_string_literal(&specifier)
            );
        }
    }
}

impl Provides<ResourceIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: ResourceIntrinsic) -> IntrinsicBinding {
        let _ = resource::resource_import(intrinsic);
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }
    fn render(
        &self,
        _intrinsic: ResourceIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

impl Provides<BaseIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: BaseIntrinsic) -> IntrinsicBinding {
        let i = Intrinsic::from(intrinsic);
        if Self::import(i).is_some() {
            IntrinsicBinding::Imported {
                local_name: i.name(),
            }
        } else {
            InlineRuntime.binding(intrinsic)
        }
    }
    fn render(
        &self,
        intrinsic: BaseIntrinsic,
        output: &mut Source,
        args: &RenderIntrinsicsArgs<'_>,
    ) {
        let i = Intrinsic::from(intrinsic);
        if Self::import(i).is_none() {
            InlineRuntime.render(intrinsic, output, args);
        } else {
            core::discover(i, args);
            if i.conditional_suspending_wasm().is_some() {
                output.push_str(&i.register_conditional_suspending_js(args));
            }
        }
    }
}

impl Provides<ConversionIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: ConversionIntrinsic) -> IntrinsicBinding {
        // Exhaustive import selection keeps new conversion variants from silently
        // falling back to inline code.
        let _ = conversion::import(intrinsic);
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }

    fn render(
        &self,
        _intrinsic: ConversionIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

impl Provides<JsHelperIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: JsHelperIntrinsic) -> IntrinsicBinding {
        match js_helper::import(intrinsic) {
            Some(_) => IntrinsicBinding::Imported {
                local_name: intrinsic.name(),
            },
            None => InlineRuntime.binding(intrinsic),
        }
    }

    fn render(
        &self,
        intrinsic: JsHelperIntrinsic,
        output: &mut Source,
        args: &RenderIntrinsicsArgs<'_>,
    ) {
        if js_helper::import(intrinsic).is_none() {
            InlineRuntime.render(intrinsic, output, args);
        }
    }
}

impl Provides<StringIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: StringIntrinsic) -> IntrinsicBinding {
        let _ = string::import(intrinsic);
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }
    fn render(
        &self,
        _intrinsic: StringIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

impl Provides<WebIdlIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: WebIdlIntrinsic) -> IntrinsicBinding {
        let _ = webidl::import(intrinsic);
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }
    fn render(
        &self,
        _intrinsic: WebIdlIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

impl Provides<ComponentIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: ComponentIntrinsic) -> IntrinsicBinding {
        let _ = component::import(intrinsic);
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }
    fn render(
        &self,
        _intrinsic: ComponentIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

impl Provides<WaitableIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: WaitableIntrinsic) -> IntrinsicBinding {
        let _ = waitable::import(intrinsic);
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }
    fn render(
        &self,
        _intrinsic: WaitableIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

impl Provides<ErrCtxIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: ErrCtxIntrinsic) -> IntrinsicBinding {
        let _ = error_context::import(intrinsic);
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }
    fn render(
        &self,
        _intrinsic: ErrCtxIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

impl Provides<AsyncTaskIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: AsyncTaskIntrinsic) -> IntrinsicBinding {
        if async_task::import(intrinsic).is_some() {
            IntrinsicBinding::Imported {
                local_name: intrinsic.name(),
            }
        } else {
            InlineRuntime.binding(intrinsic)
        }
    }
    fn render(
        &self,
        intrinsic: AsyncTaskIntrinsic,
        output: &mut Source,
        args: &RenderIntrinsicsArgs<'_>,
    ) {
        if async_task::import(intrinsic).is_some() {
        } else {
            InlineRuntime.render(intrinsic, output, args);
        }
    }
}

impl Provides<HostIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: HostIntrinsic) -> IntrinsicBinding {
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }
    fn render(
        &self,
        _intrinsic: HostIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

impl Provides<LiftIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: LiftIntrinsic) -> IntrinsicBinding {
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }
    fn render(
        &self,
        _intrinsic: LiftIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

impl Provides<LowerIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: LowerIntrinsic) -> IntrinsicBinding {
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }
    fn render(
        &self,
        _intrinsic: LowerIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

impl Provides<AsyncFutureIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: AsyncFutureIntrinsic) -> IntrinsicBinding {
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }
    fn render(
        &self,
        _intrinsic: AsyncFutureIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

pub(crate) fn uses_context(intrinsics: &BTreeSet<Intrinsic>, requested: RuntimeContext) -> bool {
    let mut contexts = Vec::new();
    for intrinsic in intrinsics {
        if let Some(context) = ExternalRuntime::import(*intrinsic).and_then(|import| import.context)
        {
            context.collect(&mut contexts);
        }
    }
    contexts.contains(&requested)
}

impl Provides<AsyncStreamIntrinsic> for ExternalRuntime {
    fn binding(&self, intrinsic: AsyncStreamIntrinsic) -> IntrinsicBinding {
        IntrinsicBinding::Imported {
            local_name: intrinsic.name(),
        }
    }
    fn render(
        &self,
        _intrinsic: AsyncStreamIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs<'_>,
    ) {
    }
}

impl IntrinsicRuntime for ExternalRuntime {
    fn render_prelude(&self, args: &RenderIntrinsicsArgs<'_>, output: &mut Source) {
        let intrinsics = &*args.intrinsics;
        let mut imports = Self::imports(intrinsics).peekable();
        if imports.peek().is_none() {
            return;
        }
        uwriteln!(
            output,
            r#"
                if ({VERSION_LOCAL} !== {CM_RUNTIME_API_VERSION}) {{
                    throw new Error(`incompatible Jco JavaScript Component Model runtime API: requested {CM_RUNTIME_API_VERSION}, supported ${{{VERSION_LOCAL}}}`);
                }}
            "#,
        );
        let mut contexts = Vec::new();
        for (_, import) in imports {
            if let Some(context) = import.context {
                context.collect(&mut contexts);
            }
        }
        for context in contexts {
            context.render(output, args);
        }
    }

    fn reference(&self, intrinsic: Intrinsic) -> &'static str {
        match Self::import(intrinsic).map(|i| i.kind) {
            Some(RuntimeImportKind::LiveReference { expression }) => expression,
            _ => runtime::binding(self, intrinsic).local_name(),
        }
    }

    /// Begin a call with the context required by this operation.
    fn call_prefix(&self, intrinsic: Intrinsic, has_operands: bool) -> String {
        let name = runtime::binding(self, intrinsic).local_name();
        let import = Self::import(intrinsic);
        assert!(
            import.is_none_or(|i| i.kind == RuntimeImportKind::Call),
            "runtime values and constructors must be used as values"
        );
        match import.and_then(|i| i.context) {
            Some(context) => format!(
                "{name}({}{}",
                context.local_name(),
                if has_operands { ", " } else { "" }
            ),
            None => format!("{name}("),
        }
    }
}

/// Resolve an informal runtime package/directory contract without consulting the filesystem.
pub(crate) fn module_specifier(base: &str, suffix: &str) -> Result<String> {
    ensure!(
        !base.trim().is_empty() && !base.chars().any(char::is_control),
        "cmRuntimeEsModule must be a non-empty base specifier without control characters"
    );
    let directory_path = base == "."
        || base == ".."
        || base.starts_with("./")
        || base.starts_with("../")
        || base.starts_with('/');
    let url = if !directory_path
        && let Some((scheme, _)) = base
            .split_once(':')
            .filter(|(prefix, _)| !prefix.contains('/'))
    {
        ensure!(
            ["file", "http", "https"]
                .iter()
                .any(|supported| scheme.eq_ignore_ascii_case(supported))
                && base.starts_with(&format!("{scheme}://")),
            "cmRuntimeEsModule has an unsupported URL scheme; use a package, directory, or file/HTTP(S) URL (including file URLs on Windows)"
        );
        true
    } else {
        false
    };
    let directory = url || directory_path;
    let base = base.strip_suffix('/').unwrap_or(base);
    if directory {
        ensure!(
            !base.contains(['?', '#']),
            "cmRuntimeEsModule directory bases must not contain a query or fragment"
        );
        if [".js", ".mjs", ".cjs"]
            .iter()
            .any(|ext| base.ends_with(ext))
        {
            bail!(
                "cmRuntimeEsModule now identifies a runtime directory base, not a provider file; replace the file specifier with a directory containing runtime.js and intrinsics/*.js"
            );
        }
    }
    Ok(format!(
        "{base}/{suffix}{}",
        if directory { ".js" } else { "" }
    ))
}

#[cfg(all(test, feature = "external-runtime"))]
mod tests {
    use super::*;
    use crate::TranspileOpts;
    use crate::intrinsics::{RenderIntrinsicsArgs, render_intrinsics, resource::ResourceIntrinsic};

    #[test]
    fn transitive_named_calls_share_task_owners_and_deduplicate_imports() {
        let mut intrinsics = BTreeSet::from([Intrinsic::Resource(
            ResourceIntrinsic::ResourceTransferBorrow,
        )]);
        let opts = TranspileOpts::builder().name("mixed".into()).build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .external_runtime(true)
                .build(),
        );
        assert!(source.contains("taskLookup: _jcoTaskLookupContext"));
        assert!(source.contains("const CURRENT_TASK_META = _jcoInitializeTaskRegisters();"));
        assert!(!source.contains("function getCurrentTask("));
        assert!(!source.contains("getTask: (componentIdx, taskID) =>"));
        assert!(!source.contains("class FutureValue"));
        assert_eq!(
            source
                .matches("const ASYNC_TASKS_BY_COMPONENT_IDX =")
                .count(),
            1
        );
        assert!(!source.contains("function rscTableCreateBorrow("));
        assert!(source.contains("const HANDLE_TABLES"));
        assert!(!source.contains("function rscTableGet("));
        assert!(!source.contains("_jcoRuntimeProvider"));
        let mut imports = Source::default();
        ExternalRuntime.render_imports(&mut imports, &intrinsics, "custom-runtime");
        assert_eq!(
            imports
                .matches("transferBorrow as resourceTransferBorrow")
                .count(),
            1
        );
        assert_eq!(imports.matches("initializeHandleIndexSpaces as").count(), 1);
        assert_eq!(source.matches("const HANDLE_INDEX_SPACES =").count(), 1);
        assert_eq!(imports.matches("CM_RUNTIME_API_VERSION as").count(), 1);
    }

    #[test]
    fn resource_context_needs_no_unrelated_initializers() {
        let mut intrinsics =
            BTreeSet::from([Intrinsic::Resource(ResourceIntrinsic::ResourceTableGet)]);
        let opts = TranspileOpts::builder().name("resource".into()).build();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .external_runtime(true)
                .build(),
        );
        assert_eq!(intrinsics.len(), 1);
        assert!(source.contains("RuntimeError: WebAssembly.RuntimeError"));
        for unrelated in [
            "T_FLAG",
            "HANDLE_TABLES",
            "TextEncoder",
            "TextDecoder",
            "WebAssembly.Global",
            "Suspending",
            "new Map",
            "new Int32Array",
        ] {
            assert!(!source.contains(unrelated), "{unrelated}");
        }
    }

    #[test]
    fn resolves_runtime_bases() {
        for (base, expected) in [
            ("@scope/runtime", "@scope/runtime/intrinsics/resource"),
            ("custom-runtime/", "custom-runtime/intrinsics/resource"),
            ("something.js", "something.js/intrinsics/resource"),
            ("custom/nested", "custom/nested/intrinsics/resource"),
            ("./runtime", "./runtime/intrinsics/resource.js"),
            ("../runtime/", "../runtime/intrinsics/resource.js"),
            ("/runtime/", "/runtime/intrinsics/resource.js"),
            ("/", "/intrinsics/resource.js"),
            (
                "./runtime:version",
                "./runtime:version/intrinsics/resource.js",
            ),
            (".", "./intrinsics/resource.js"),
            (
                "file:///C:/runtime/",
                "file:///C:/runtime/intrinsics/resource.js",
            ),
            ("file:///a%20b/", "file:///a%20b/intrinsics/resource.js"),
            (
                "https://example.test/runtime/",
                "https://example.test/runtime/intrinsics/resource.js",
            ),
            (
                "HTTPS://example.test/runtime/",
                "HTTPS://example.test/runtime/intrinsics/resource.js",
            ),
            (
                "http://example.test/a//b",
                "http://example.test/a//b/intrinsics/resource.js",
            ),
            ("./a b'\"", "./a b'\"/intrinsics/resource.js"),
        ] {
            assert_eq!(
                module_specifier(base, "intrinsics/resource").unwrap(),
                expected
            );
        }
    }

    #[test]
    fn rejects_unsupported_bases() {
        for base in [
            "",
            " ",
            "a\nb",
            "a\0b",
            "data:text/javascript,",
            "ftp://example.test/a",
            "C:\\runtime",
            "./a?b",
            "file:///a#b",
            "https://example.test/a?q",
        ] {
            assert!(module_specifier(base, "runtime").is_err(), "{base}");
        }
        for base in [
            "./provider.js",
            "../provider.mjs/",
            "file:///provider.cjs",
            "https://example.test/provider.js",
        ] {
            assert!(
                module_specifier(base, "runtime")
                    .unwrap_err()
                    .to_string()
                    .contains("directory base")
            );
        }
    }
}
