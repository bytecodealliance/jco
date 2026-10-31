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

pub(crate) mod conversion;

pub(crate) const CM_RUNTIME_API_VERSION: u32 = 1;
pub(crate) const VERSION_LOCAL: &str = "_jcoRuntimeApiVersion";
pub(crate) const TABLE_GET_CONTEXT: &str = "_jcoResourceTableGetContext";

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum RuntimeContext {
    ResourceTableGet,
    StrictNumeric,
    Bitcast32,
    Bitcast64,
}

impl RuntimeContext {
    pub(crate) fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            TABLE_GET_CONTEXT,
            "_jcoStrictNumericContext",
            "_jcoBitcast32Context",
            "_jcoBitcast64Context",
            "_jcoInitializeBitcast32",
            "_jcoInitializeBitcast64",
        ]
    }

    pub(crate) fn local_name(self) -> &'static str {
        match self {
            Self::ResourceTableGet => TABLE_GET_CONTEXT,
            Self::StrictNumeric => "_jcoStrictNumericContext",
            Self::Bitcast32 => "_jcoBitcast32Context",
            Self::Bitcast64 => "_jcoBitcast64Context",
        }
    }

    /// Initializers return narrow state, never operation tables.
    pub(crate) fn initializer(self) -> Option<RuntimeInitializer> {
        let (export, local_name) = match self {
            Self::Bitcast32 => ("initializeBitcast32", "_jcoInitializeBitcast32"),
            Self::Bitcast64 => ("initializeBitcast64", "_jcoInitializeBitcast64"),
            _ => return None,
        };
        Some(RuntimeInitializer {
            suffix: "intrinsics/conversion",
            export,
            local_name,
        })
    }

    pub(crate) fn render(self, output: &mut Source, strict: bool) {
        let local = self.local_name();
        match self {
            Self::ResourceTableGet => uwriteln!(
                output,
                "const {TABLE_GET_CONTEXT} = {{ RuntimeError: WebAssembly.RuntimeError }};"
            ),
            Self::StrictNumeric => {
                uwriteln!(output, "const {local} = {{ strict: {strict} }};")
            }
            Self::Bitcast32 | Self::Bitcast64 => {
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

/// A named call export. Context requirements are separate from the public name.
/// Add value/constructor/state descriptors when such exports are implemented.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) struct RuntimeImport {
    pub(crate) suffix: &'static str,
    pub(crate) export: &'static str,
    pub(crate) context: Option<RuntimeContext>,
}

/// Imports what the external runtime implements and delegates the rest to
/// [`InlineRuntime`]. To move an intrinsic into the runtime package, describe its
/// import in the corresponding external-runtime module and give that family an
/// explicit [`Provides`] impl.
#[derive(Debug, Default, Copy, Clone)]
pub(crate) struct ExternalRuntime;

impl ExternalRuntime {
    /// Exports of `<base>/intrinsics/resource`.
    fn resource_import(intrinsic: ResourceIntrinsic) -> Option<RuntimeImport> {
        match intrinsic {
            ResourceIntrinsic::ResourceTableGet => Some(RuntimeImport {
                suffix: "intrinsics/resource",
                export: "tableGet",
                context: Some(RuntimeContext::ResourceTableGet),
            }),
            _ => None,
        }
    }

    fn import(intrinsic: Intrinsic) -> Option<RuntimeImport> {
        match intrinsic {
            Intrinsic::Resource(i) => Self::resource_import(i),
            Intrinsic::Conversion(i) => Some(conversion::import(i)),
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
            modules
                .entry(import.suffix)
                .or_default()
                .insert((import.export, intrinsic.name()));
            if let Some(initializer) = import.context.and_then(RuntimeContext::initializer) {
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
        match Self::resource_import(intrinsic) {
            Some(_) => IntrinsicBinding::Imported {
                local_name: intrinsic.name(),
            },
            None => InlineRuntime.binding(intrinsic),
        }
    }

    fn render(
        &self,
        intrinsic: ResourceIntrinsic,
        output: &mut Source,
        args: &RenderIntrinsicsArgs<'_>,
    ) {
        if Self::resource_import(intrinsic).is_none() {
            InlineRuntime.render(intrinsic, output, args);
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
    BaseIntrinsic,
    JsHelperIntrinsic,
    WebIdlIntrinsic,
    StringIntrinsic,
    ErrCtxIntrinsic,
    AsyncTaskIntrinsic,
    WaitableIntrinsic,
    LiftIntrinsic,
    LowerIntrinsic,
    AsyncStreamIntrinsic,
    AsyncFutureIntrinsic,
    ComponentIntrinsic,
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
        let mut contexts = BTreeSet::new();
        for (_, import) in imports {
            if let Some(context) = import.context
                && contexts.insert(context.local_name())
            {
                context.render(output, args.transpile_opts.strict);
            }
        }
    }

    /// Insert only the context required by this operation.
    fn call(&self, intrinsic: Intrinsic, operands: &str) -> String {
        let name = runtime::binding(self, intrinsic).local_name();
        match Self::import(intrinsic).and_then(|import| import.context) {
            Some(context) => {
                let context = context.local_name();
                let separator = if operands.is_empty() { "" } else { ", " };
                format!("{name}({context}{separator}{operands})")
            }
            None => format!("{name}({operands})"),
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
        assert!(source.contains("rscTableGet(_jcoResourceTableGetContext, fromTable, handle)"));
        assert!(source.contains("function rscTableCreateBorrow("));
        assert!(source.contains("const HANDLE_TABLES"));
        assert!(!source.contains("function rscTableGet("));
        assert!(!source.contains("_jcoRuntimeProvider"));
        let mut imports = Source::default();
        ExternalRuntime.render_imports(&mut imports, &intrinsics, "custom-runtime");
        assert_eq!(imports.matches("tableGet as rscTableGet").count(), 1);
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
