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

mod component;
pub(crate) mod conversion;
mod core;
mod error_context;
use error_context::ErrCtxContextIntrinsic;
mod waitable;
use component::ComponentContextIntrinsic;
use core::CoreContextIntrinsic;
use waitable::WaitableContextIntrinsic;
pub(crate) mod js_helper;
pub(crate) mod resource;
pub(crate) mod string;
pub(crate) mod webidl;

pub(crate) const CM_RUNTIME_API_VERSION: u32 = 1;
pub(crate) const VERSION_LOCAL: &str = "_jcoRuntimeApiVersion";
pub(crate) const TABLE_GET_CONTEXT: &str = "_jcoResourceTableGetContext";

/// State initializers and capability contexts selected by external runtime intrinsics.
/// Shared contexts name their initializer or operation; they are not additional canonical operations.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum RuntimeContextIntrinsic {
    /// Context intrinsics for core Wasm operations and JS helpers.
    Core(CoreContextIntrinsic),
    /// Context intrinsics for component state and scheduling.
    Component(ComponentContextIntrinsic),
    /// Context intrinsics for waitables and waitable sets.
    Waitable(WaitableContextIntrinsic),
    /// Context intrinsics for error-context tables and operations.
    ErrCtx(ErrCtxContextIntrinsic),
    /// Capabilities for the `tableGet` resource-table helper.
    ResourceTableGet,
    /// The per-component resource handle index spaces returned by `initializeHandleIndexSpaces`.
    InitializeHandleIndexSpaces,
    /// The resource handle tables returned by `initializeHandleTables`.
    InitializeHandleTables,
    /// The current call-borrow list returned by `initializeCallBorrows`.
    InitializeCallBorrows,
    /// The active resource-borrow list returned by `initializeCurrentBorrows`.
    InitializeCurrentBorrows,
    /// The resource-scope counter returned by `initializeResourceScopeCounter`.
    InitializeResourceScopeCounter,
    /// The resource-scope task map returned by `initializeResourceScopeTasks`.
    InitializeResourceScopeTasks,
    /// The current scope identifier returned by `initializeScopeId`.
    InitializeScopeId,
    /// Capabilities for the `tableRemove` resource-table helper.
    ResourceTableRemove,
    /// Capabilities for the `transferOwn` resource-handle helper.
    ResourceTransferOwn,
    /// Shared capabilities for `transferBorrow` and `transferBorrowValidLifting`.
    ResourceTransferBorrow,
    /// Capabilities for `callDestructor`, which invokes a resource destructor.
    ResourceDestructorCall,
    /// The strictness setting shared by the `toInt*` and `toUint*` conversion helpers.
    NumericConversion,
    /// The shared 32-bit bitcast buffer views returned by `initializeBitcast32`.
    InitializeBitcast32,
    /// The shared 64-bit bitcast buffer views returned by `initializeBitcast64`.
    InitializeBitcast64,
    /// The memory data-view cache returned by `initializeDataViewCache`.
    InitializeDataViewCache,
    /// The UTF-8 decoder returned by `initializeUtf8Decoder`.
    InitializeUtf8Decoder,
    /// The UTF-16 decoder returned by `initializeUtf16Decoder`.
    InitializeUtf16Decoder,
    /// The UTF-8 encoder returned by `initializeUtf8Encoder`.
    InitializeUtf8Encoder,
    /// The UTF-16 encoding state returned by `initializeUtf16Encoding`.
    InitializeUtf16Encoding,
    /// The Web IDL proxy cache returned by `initializeWebIdlProxyCache`.
    InitializeWebIdlProxyCache,
}

impl RuntimeContextIntrinsic {
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
        .chain(CoreContextIntrinsic::get_global_names())
        .chain(ComponentContextIntrinsic::get_global_names())
        .chain(WaitableContextIntrinsic::get_global_names())
        .chain(ErrCtxContextIntrinsic::get_global_names())
    }

    pub(crate) fn local_name(self) -> &'static str {
        match self {
            Self::Core(context) => context.local_name(),
            Self::Component(context) => context.local_name(),
            Self::Waitable(context) => context.local_name(),
            Self::ErrCtx(context) => context.local_name(),
            Self::ResourceTableGet => TABLE_GET_CONTEXT,
            Self::InitializeHandleIndexSpaces => "HANDLE_INDEX_SPACES",
            Self::InitializeHandleTables => "HANDLE_TABLES",
            Self::InitializeCallBorrows => "_jcoCallBorrowContext",
            Self::InitializeCurrentBorrows => "_jcoCurrentBorrowContext",
            Self::InitializeResourceScopeCounter => "_jcoResourceScopeCounterContext",
            Self::InitializeResourceScopeTasks => "RESOURCE_SCOPE_TASKS",
            Self::InitializeScopeId => "_jcoScopeIdContext",
            Self::ResourceTableRemove => "_jcoResourceRemoveContext",
            Self::ResourceTransferOwn => "_jcoResourceTransferOwnContext",
            Self::ResourceTransferBorrow => "_jcoResourceTransferBorrowContext",
            Self::ResourceDestructorCall => "_jcoResourceDestructorContext",
            Self::NumericConversion => "_jcoStrictNumericContext",
            Self::InitializeBitcast32 => "_jcoBitcast32Context",
            Self::InitializeBitcast64 => "_jcoBitcast64Context",
            Self::InitializeDataViewCache => "_jcoDataViewCacheContext",
            Self::InitializeUtf8Decoder => "TEXT_DECODER_UTF8",
            Self::InitializeUtf16Decoder => "utf16Decoder",
            Self::InitializeUtf8Encoder => "TEXT_ENCODER_UTF8",
            Self::InitializeUtf16Encoding => "_jcoUtf16EncodingContext",
            Self::InitializeWebIdlProxyCache => "_jcoWebIdlProxyCacheContext",
        }
    }

    /// Initializers return narrow state, never operation tables.
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (suffix, export, local_name) = match self {
            Self::Core(context) => return context.initializer(),
            Self::Component(context) => return context.initializer(),
            Self::Waitable(context) => return context.initializer(),
            Self::ErrCtx(context) => return context.initializer(),
            Self::InitializeHandleIndexSpaces => (
                "intrinsics/resource",
                "initializeHandleIndexSpaces",
                "_jcoInitializeHandleIndexSpaces",
            ),
            Self::InitializeHandleTables => (
                "intrinsics/resource",
                "initializeHandleTables",
                "_jcoInitializeHandleTables",
            ),
            Self::InitializeCallBorrows => (
                "intrinsics/resource",
                "initializeCallBorrows",
                "_jcoInitializeCallBorrows",
            ),
            Self::InitializeCurrentBorrows => (
                "intrinsics/resource",
                "initializeCurrentBorrows",
                "_jcoInitializeCurrentBorrows",
            ),
            Self::InitializeResourceScopeCounter => (
                "intrinsics/resource",
                "initializeResourceScopeCounter",
                "_jcoInitializeResourceScopeCounter",
            ),
            Self::InitializeResourceScopeTasks => (
                "intrinsics/resource",
                "initializeResourceScopeTasks",
                "_jcoInitializeResourceScopeTasks",
            ),
            Self::InitializeScopeId => (
                "intrinsics/resource",
                "initializeScopeId",
                "_jcoInitializeScopeId",
            ),
            Self::InitializeBitcast32 => (
                "intrinsics/conversion",
                "initializeBitcast32",
                "_jcoInitializeBitcast32",
            ),
            Self::InitializeBitcast64 => (
                "intrinsics/conversion",
                "initializeBitcast64",
                "_jcoInitializeBitcast64",
            ),
            Self::InitializeDataViewCache => (
                "intrinsics/js-helper",
                "initializeDataViewCache",
                "_jcoInitializeDataViewCache",
            ),
            Self::InitializeUtf8Decoder => (
                "intrinsics/string",
                "initializeUtf8Decoder",
                "_jcoInitializeUtf8Decoder",
            ),
            Self::InitializeUtf16Decoder => (
                "intrinsics/string",
                "initializeUtf16Decoder",
                "_jcoInitializeUtf16Decoder",
            ),
            Self::InitializeUtf8Encoder => (
                "intrinsics/string",
                "initializeUtf8Encoder",
                "_jcoInitializeUtf8Encoder",
            ),
            Self::InitializeUtf16Encoding => (
                "intrinsics/string",
                "initializeUtf16Encoding",
                "_jcoInitializeUtf16Encoding",
            ),
            Self::InitializeWebIdlProxyCache => (
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
            Self::ResourceTableRemove => &[
                Self::InitializeHandleIndexSpaces,
                Self::InitializeResourceScopeTasks,
            ],
            Self::ResourceTransferOwn => &[
                Self::InitializeHandleIndexSpaces,
                Self::InitializeResourceScopeTasks,
                Self::InitializeHandleTables,
            ],
            Self::ResourceTransferBorrow => &[
                Self::InitializeHandleIndexSpaces,
                Self::InitializeHandleTables,
                Self::InitializeScopeId,
                Self::InitializeCallBorrows,
                Self::Core(CoreContextIntrinsic::InitializeTaskRegisters),
            ],
            Self::ResourceDestructorCall => &[
                Self::Core(CoreContextIntrinsic::InitializeTaskRegisters),
                Self::Component(ComponentContextIntrinsic::InitializeStoreTrap),
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
            Self::ResourceTableRemove => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, indexSpaces: HANDLE_INDEX_SPACES, scopeTasks: RESOURCE_SCOPE_TASKS }};"
            ),
            Self::ResourceTransferOwn => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, indexSpaces: HANDLE_INDEX_SPACES, scopeTasks: RESOURCE_SCOPE_TASKS, tables: HANDLE_TABLES }};"
            ),
            Self::ResourceTransferBorrow => uwriteln!(
                output,
                "const {local} = {{ RuntimeError: WebAssembly.RuntimeError, indexSpaces: HANDLE_INDEX_SPACES, tables: HANDLE_TABLES, scope: _jcoScopeIdContext, callBorrows: _jcoCallBorrowContext, registers: CURRENT_TASK_META, getTask: (componentIdx, taskID) => getCurrentTask(componentIdx, taskID)?.task }};"
            ),
            Self::ResourceDestructorCall => uwriteln!(
                output,
                "const {local} = {{ storeTrap: STORE_TRAP, registers: CURRENT_TASK_META, createTask: args => createNewCurrentImplicitThread(args) }};"
            ),
            Self::ResourceTableGet => uwriteln!(
                output,
                "const {TABLE_GET_CONTEXT} = {{ RuntimeError: WebAssembly.RuntimeError }};"
            ),
            Self::NumericConversion => {
                uwriteln!(output, "const {local} = {{ strict: {strict} }};")
            }
            Self::InitializeHandleIndexSpaces
            | Self::InitializeHandleTables
            | Self::InitializeCallBorrows
            | Self::InitializeCurrentBorrows
            | Self::InitializeResourceScopeCounter
            | Self::InitializeResourceScopeTasks
            | Self::InitializeScopeId
            | Self::InitializeBitcast32
            | Self::InitializeBitcast64
            | Self::InitializeDataViewCache
            | Self::InitializeUtf8Decoder
            | Self::InitializeUtf16Decoder
            | Self::InitializeUtf8Encoder
            | Self::InitializeUtf16Encoding
            | Self::InitializeWebIdlProxyCache => {
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
    pub(crate) context: Option<RuntimeContextIntrinsic>,
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
            Intrinsic::ErrCtx(i) => Some(error_context::import(i)),
            Intrinsic::Waitable(i) => Some(waitable::import(i)),
            Intrinsic::Component(i) => component::import(i),
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
            for initializer in contexts
                .into_iter()
                .filter_map(RuntimeContextIntrinsic::initializer)
            {
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
        intrinsic: ResourceIntrinsic,
        _output: &mut Source,
        args: &RenderIntrinsicsArgs<'_>,
    ) {
        resource::discover_inline_dependencies(Intrinsic::Resource(intrinsic), args);
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
        if component::import(intrinsic).is_some() {
            IntrinsicBinding::Imported {
                local_name: intrinsic.name(),
            }
        } else {
            InlineRuntime.binding(intrinsic)
        }
    }
    fn render(
        &self,
        intrinsic: ComponentIntrinsic,
        output: &mut Source,
        args: &RenderIntrinsicsArgs<'_>,
    ) {
        component::discover(intrinsic, args);
        if component::import(intrinsic).is_none() {
            InlineRuntime.render(intrinsic, output, args);
        }
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
        intrinsic: WaitableIntrinsic,
        _output: &mut Source,
        args: &RenderIntrinsicsArgs<'_>,
    ) {
        waitable::discover(intrinsic.into(), args);
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

/// Families the external runtime does not implement yet.
macro_rules! delegate_to_inline {
    ($($family:ty),+ $(,)?) => {
        $(
            impl Provides<$family> for ExternalRuntime {
                fn binding(&self, intrinsic: $family) -> IntrinsicBinding {
                    InlineRuntime.binding(intrinsic)
                }

                fn render(
                    &self,
                    intrinsic: $family,
                    output: &mut Source,
                    args: &RenderIntrinsicsArgs<'_>,
                ) {
                    InlineRuntime.render(intrinsic, output, args);
                }
            }
        )+
    };
}

delegate_to_inline! {
    AsyncTaskIntrinsic,
    LiftIntrinsic,
    LowerIntrinsic,
    AsyncStreamIntrinsic,
    AsyncFutureIntrinsic,
    HostIntrinsic,
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
    fn transitive_named_calls_keep_inline_dependencies_and_deduplicate_imports() {
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
        assert!(source.contains("getTask: (componentIdx, taskID) =>"));
        assert!(source.contains("const CURRENT_TASK_META = _jcoInitializeTaskRegisters();"));
        assert!(source.contains("function getCurrentTask("));
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
