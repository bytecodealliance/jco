//! Named external runtime imports. Keep public suffix selection and base resolution here.

use anyhow::{Result, bail, ensure};

use super::{Intrinsic, IntrinsicBinding};
use crate::{names::js_string_literal, source::Source, uwriteln};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write;

pub(crate) const CM_RUNTIME_API_VERSION: u32 = 1;
pub(crate) const VERSION_LOCAL: &str = "_jcoRuntimeApiVersion";
pub(crate) const TABLE_GET_CONTEXT: &str = "_jcoResourceTableGetContext";

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum RuntimeContext {
    ResourceTableGet,
}

impl RuntimeContext {
    pub(crate) fn local_name(self) -> &'static str {
        match self {
            Self::ResourceTableGet => TABLE_GET_CONTEXT,
        }
    }

    pub(crate) fn render(self, output: &mut Source) {
        match self {
            Self::ResourceTableGet => uwriteln!(
                output,
                "const {TABLE_GET_CONTEXT} = {{ RuntimeError: WebAssembly.RuntimeError }};"
            ),
        }
    }
}

/// A named call export. Context requirements are separate from the public name.
/// Add value/constructor/state descriptors when such exports are implemented.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) struct RuntimeImport {
    pub(crate) suffix: &'static str,
    pub(crate) export: &'static str,
    pub(crate) context: Option<RuntimeContext>,
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

/// Called after dependency discovery, so transitive inline calls also get their imports.
pub(crate) fn render_imports(output: &mut Source, intrinsics: &BTreeSet<Intrinsic>, base: &str) {
    let mut modules = BTreeMap::<&str, BTreeSet<(&str, &str)>>::new();
    for intrinsic in intrinsics {
        if let IntrinsicBinding::Runtime { local_name, import } = intrinsic.binding(true) {
            modules
                .entry(import.suffix)
                .or_default()
                .insert((import.export, local_name));
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
        render_imports(&mut imports, &intrinsics, "custom-runtime");
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
