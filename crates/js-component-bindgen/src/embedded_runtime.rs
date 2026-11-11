//! Links the Component Model runtime shipped with this crate into generated bindings.
//!
//! Generated bindings import their intrinsics from [`PACKAGE`] by name. When no
//! external provider is selected, [`link`] replaces those imports with the runtime's
//! own code and drops whatever the bindings do not reach, so the result imports no
//! runtime at all.
//!
//! The runtime is built from `packages/jco-cm-runtime` into the two files under
//! `runtime/`, which are committed so the crate builds without a JavaScript toolchain:
//!
//! - `runtime-all.js` is every runtime module bundled into one, exporting each
//!   public name under a unique alias, and starts with two lines naming the version
//!   of the runtime package it was built from and the commit of those sources;
//! - `runtime-export-map.tsv` maps `<subpath>:<export>` to that alias.

use std::collections::HashMap;
use std::sync::OnceLock;

use anyhow::{Context, Result, bail, ensure};
use oxc_allocator::Allocator;
use oxc_ast::ast::{ImportDeclarationSpecifier, Statement};
use oxc_codegen::{Codegen, CodegenOptions, CommentOptions};
use oxc_minifier::{CompressOptions, Minifier, MinifierOptions};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_str::Ident;

/// The base that generated bindings import the shipped runtime from before linking.
pub(crate) const PACKAGE: &str = "@bytecodealliance/jco-cm-runtime";

const RUNTIME_SOURCE: &str = include_str!("../runtime/runtime-all.js");
const RUNTIME_EXPORT_MAP: &str = include_str!("../runtime/runtime-export-map.tsv");

/// Prefix given to the runtime's top-level names so they cannot capture or be
/// captured by names in generated bindings.
const NAMESPACE: &str = "__jcoEmbeddedRuntime$";

/// The runtime with its top-level names moved into a private namespace.
struct Runtime {
    /// The runtime's statements, without its export list.
    code: String,
    /// Namespaced local name of each exported alias.
    exports: HashMap<String, String>,
}

impl Runtime {
    /// Parse the shipped runtime and prefix its top-level names with `namespace`.
    fn with_namespace(namespace: &str) -> Result<Self> {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, RUNTIME_SOURCE, SourceType::mjs()).parse();
        ensure!(
            parsed.diagnostics.is_empty(),
            "the shipped runtime does not parse: {:?}",
            parsed.diagnostics
        );
        let mut program = parsed.program;
        let semantics = SemanticBuilder::new().build(&program);
        ensure!(
            semantics.diagnostics.is_empty(),
            "the shipped runtime is not a valid module: {:?}",
            semantics.diagnostics
        );

        let mut scoping = semantics.semantic.into_scoping();
        let root = scoping.root_scope_id();
        let symbols: Vec<_> = scoping.get_bindings(root).values().copied().collect();
        for symbol in symbols {
            let name = format!("{namespace}{}", scoping.symbol_name(symbol));
            scoping.rename_symbol(symbol, root, Ident::from(allocator.alloc_str(&name)));
        }

        // The export list only names what bindings may import; record it and drop it.
        let mut exports = HashMap::new();
        let mut unsupported = None;
        program.body.retain(|statement| {
            let Statement::ExportNamedDeclaration(export) = statement else {
                if statement.is_module_declaration() {
                    unsupported = Some("a module declaration other than its export list");
                }
                return true;
            };
            for specifier in &export.specifiers {
                exports.insert(
                    specifier.exported.name().to_string(),
                    format!("{namespace}{}", specifier.local.name()),
                );
            }
            false
        });
        if let Some(unsupported) = unsupported {
            bail!("the shipped runtime contains {unsupported}");
        }

        let code = Codegen::new()
            .with_options(CodegenOptions {
                comments: CommentOptions::disabled(),
                ..Default::default()
            })
            .with_scoping(Some(scoping))
            .build(&program)
            .code;
        Ok(Self { code, exports })
    }

    /// The runtime under the default namespace, prepared once per process.
    fn shared() -> Result<&'static Self> {
        static SHARED: OnceLock<std::result::Result<Runtime, String>> = OnceLock::new();
        SHARED
            .get_or_init(|| Self::with_namespace(NAMESPACE).map_err(|error| format!("{error:#}")))
            .as_ref()
            .map_err(|error| anyhow::anyhow!("{error}"))
    }
}

/// Alias of each public runtime export, keyed by `<subpath>:<export>`.
fn export_aliases() -> Result<HashMap<&'static str, &'static str>> {
    RUNTIME_EXPORT_MAP
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            line.split_once('\t')
                .with_context(|| format!("malformed runtime export map entry {line:?}"))
        })
        .collect()
}

/// The runtime subpath a statement imports from, if it imports from the runtime.
fn runtime_subpath<'a>(statement: &'a Statement<'_>) -> Option<&'a str> {
    let Statement::ImportDeclaration(import) = statement else {
        return None;
    };
    import
        .source
        .value
        .as_str()?
        .strip_prefix(PACKAGE)?
        .strip_prefix('/')
}

/// Bundle the shipped runtime into `generated`, keeping only the code it uses.
///
/// Returns `None` when `generated` imports nothing from the runtime, in which case
/// it needs no linking and is best left exactly as generated. All other imports,
/// such as a component's own imports, are left in place.
pub(crate) fn link(generated: &str) -> Result<Option<String>> {
    if !generated.contains(PACKAGE) {
        return Ok(None);
    }

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, generated, SourceType::mjs()).parse();
    ensure!(
        parsed.diagnostics.is_empty(),
        "generated bindings do not parse: {:?}",
        parsed.diagnostics
    );
    let mut bindings = parsed.program;
    if !bindings
        .body
        .iter()
        .any(|statement| runtime_subpath(statement).is_some())
    {
        return Ok(None);
    }

    // Generated names never use the namespace, but a component's own names might;
    // extend it until it is unused. Only the default namespace is prepared once.
    let mut namespace = NAMESPACE.to_string();
    while generated.contains(&namespace) || RUNTIME_SOURCE.contains(&namespace) {
        namespace.push('$');
    }
    let owned_runtime;
    let runtime = if namespace == NAMESPACE {
        Runtime::shared()?
    } else {
        owned_runtime = Runtime::with_namespace(&namespace)?;
        &owned_runtime
    };

    // Bind each imported name to the runtime's implementation of it.
    let aliases = export_aliases()?;
    let mut imported = String::new();
    for statement in &bindings.body {
        let Some(subpath) = runtime_subpath(statement) else {
            continue;
        };
        let Statement::ImportDeclaration(import) = statement else {
            unreachable!("runtime subpaths are only found on import declarations");
        };
        let specifiers = import
            .specifiers
            .as_ref()
            .with_context(|| format!("import of runtime module {subpath} binds no names"))?;
        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                bail!("import of runtime module {subpath} must use named imports");
            };
            let export = specifier.imported.name();
            let alias = aliases
                .get(format!("{subpath}:{export}").as_str())
                .with_context(|| format!("runtime module {subpath} has no export {export}"))?;
            let target = runtime.exports.get(*alias).with_context(|| {
                format!("the shipped runtime does not define {export} of {subpath}")
            })?;
            imported.push_str(&format!("const {} = {target};\n", specifier.local.name));
        }
    }
    bindings
        .body
        .retain(|statement| runtime_subpath(statement).is_none());

    // Directives only take effect at the start of a module, so keep them first.
    let directives: String = bindings
        .directives
        .iter()
        .map(|directive| format!("{};\n", directive.span.source_text(generated)))
        .collect();
    bindings.directives.clear();
    let bindings = Codegen::new().build(&bindings).code;

    let linked = format!("{directives}{}\n{imported}\n{bindings}", runtime.code);
    let parsed = Parser::new(&allocator, &linked, SourceType::mjs()).parse();
    ensure!(
        parsed.diagnostics.is_empty(),
        "bindings linked with the runtime do not parse: {:?}",
        parsed.diagnostics
    );
    let mut program = parsed.program;
    let reduced = Minifier::new(MinifierOptions {
        mangle: None,
        mangle_properties: None,
        compress: Some(CompressOptions::dce()),
    })
    .minify(&allocator, &mut program);
    let code = Codegen::new()
        .with_options(CodegenOptions {
            minify: false,
            comments: CommentOptions::disabled(),
            ..Default::default()
        })
        .with_scoping(reduced.scoping)
        .build(&program)
        .code;
    Ok(Some(code))
}

#[cfg(test)]
mod tests {
    use super::{NAMESPACE, PACKAGE, RUNTIME_SOURCE, link};

    #[test]
    fn shipped_runtime_names_its_version_and_commit() {
        let mut lines = RUNTIME_SOURCE.lines();
        let version = lines
            .next()
            .and_then(|line| line.strip_prefix(&format!("// {PACKAGE}@")))
            .expect("the shipped runtime starts with its package version");
        assert_eq!(version.split('.').count(), 3);
        assert!(version.starts_with(|first: char| first.is_ascii_digit()));

        // A release must not embed a runtime built from uncommitted sources.
        let commit = lines
            .next()
            .and_then(|line| line.strip_prefix("// generated from commit "))
            .expect("the shipped runtime names the commit it was generated from");
        assert_eq!(commit.len(), 40);
        assert!(commit.chars().all(|digit| digit.is_ascii_hexdigit()));
    }

    #[test]
    fn keeps_other_imports_and_avoids_name_capture() {
        let source = r#"
            "use components";
            import { toInt8 } from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';
            import { consume } from 'consumer';
            export const __jcoEmbeddedRuntime$toInt8 = 42;
            export function run(value) { return consume(toInt8({ strict: false }, value)); }
            export const location = import.meta.url;
        "#;
        let linked = link(source).unwrap().unwrap();
        assert!(!linked.contains("@bytecodealliance/jco-cm-runtime"));
        assert!(linked.contains("consumer"));
        assert!(linked.contains("import.meta.url"));
        assert!(linked.contains("__jcoEmbeddedRuntime$toInt8 = 42"));
        assert!(linked.contains("__jcoEmbeddedRuntime$$toInt8"));
        assert!(!linked.contains("TextEncoder"));
        assert!(linked.starts_with("\"use components\";"));
        assert_eq!(linked.matches("use components").count(), 1);
    }

    #[test]
    fn leaves_modules_without_runtime_imports_untouched() {
        assert!(
            link("import { consume } from 'consumer'; consume();")
                .unwrap()
                .is_none()
        );
        // Mentioning the package without importing from it is not a runtime import.
        let mention = "export const name = '@bytecodealliance/jco-cm-runtime/runtime';";
        assert!(link(mention).unwrap().is_none());
    }

    #[test]
    fn uses_the_default_namespace_when_it_is_free() {
        let source = "import { toInt8 } from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion'; export { toInt8 };";
        let linked = link(source).unwrap().unwrap();
        assert!(linked.contains(&format!("{NAMESPACE}toInt8")));
        assert!(!linked.contains(&format!("{NAMESPACE}$")));
    }

    #[test]
    fn reports_missing_runtime_exports() {
        let error = link("import { missing } from '@bytecodealliance/jco-cm-runtime/runtime'; export { missing };").unwrap_err();
        assert!(
            error
                .to_string()
                .contains("runtime module runtime has no export missing")
        );
    }

    #[test]
    fn rejects_namespace_imports_of_the_runtime() {
        let error = link(
            "import * as runtime from '@bytecodealliance/jco-cm-runtime/runtime'; export { runtime };",
        )
        .unwrap_err();
        assert!(error.to_string().contains("must use named imports"));
    }
}
