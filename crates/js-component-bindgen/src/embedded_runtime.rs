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
//!
//! The linker defines the runtime's debug logger itself, with the initializer that
//! inline intrinsics use, so bundled bindings log alike whichever runtime sources
//! are embedded.
//!
//! Bindings that export `instantiate` take a logging choice for each instance. For
//! them the runtime becomes the body of a function at module scope, which creates
//! a runtime that logs or one that does not. `instantiate` uses the runtime for the
//! choice of its instance, which is created when first needed and then shared by
//! every instance that makes the same choice. Being outside `instantiate`, the
//! runtime sees none of the names declared there, such as the local names of imports.
//! A profile that removes diagnostics leaves nothing to log, so there the choice
//! is not read and every instance shares the one runtime.
//!
//! Instances share a runtime because engines share inline caches between the
//! closures created from one function body. A runtime for each instance would give
//! every instance classes with private names of their own, and once two instances
//! exist no access to a private field could be cached for either.

use std::collections::{BTreeSet, HashMap};
use std::sync::OnceLock;

use anyhow::{Context, Result, bail, ensure};
use oxc_allocator::Allocator;
use oxc_ast::ast::{BindingPattern, Declaration, Function, ImportDeclarationSpecifier, Statement};
use oxc_codegen::{Codegen, CodegenOptions, CommentOptions};
use oxc_minifier::{CompressOptions, Minifier, MinifierOptions};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_str::Ident;

use crate::RuntimeProfile;
use crate::intrinsics::{debug_log_enabled, debug_log_initializer, debug_logger};

/// The base that generated bindings import the shipped runtime from before linking.
pub(crate) const PACKAGE: &str = "@bytecodealliance/jco-cm-runtime";

const RUNTIME_SOURCE: &str = include_str!("../runtime/runtime-all.js");
const RUNTIME_EXPORT_MAP: &str = include_str!("../runtime/runtime-export-map.tsv");

/// Prefix given to the runtime's top-level names so they cannot capture or be
/// captured by names in generated bindings.
const NAMESPACE: &str = "__jcoEmbeddedRuntime$";

/// Name, within the namespace, of the function that creates a runtime for one logging choice.
const INSTANCE_RUNTIME: &str = "$instance";

/// Name, within the namespace, of the parameter for the logging choice.
const INSTANCE_DEBUG: &str = "$debug";

/// Name, within the namespace, of the runtimes created so far, by logging choice.
const RUNTIMES: &str = "$runtimes";

/// Name, within the namespace, of the function that finds the runtime for an instance.
const RUNTIME_OF_INSTANCE: &str = "$runtime";

/// Key of the runtime's debug logger in the export map.
const DEBUG_LOG_EXPORT: &str = "intrinsics/core:debugLog";

/// The runtime with its top-level names moved into a private namespace.
struct Runtime {
    /// The runtime's statements, without its export list. Those of a runtime for
    /// each instance refer to the logging choice by the name of [`INSTANCE_DEBUG`].
    code: String,
    /// Namespaced local name of each exported alias.
    exports: HashMap<String, String>,
}

impl Runtime {
    /// Parse the shipped runtime and prefix its top-level names with `namespace`.
    ///
    /// `per_instance` prepares the statements for use as the body of a function
    /// that creates the runtime of one instance.
    fn with_namespace(namespace: &str, per_instance: bool) -> Result<Self> {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, RUNTIME_SOURCE, SourceType::mjs()).parse();
        ensure!(
            parsed.diagnostics.is_empty(),
            "the shipped runtime does not parse: {:?}",
            parsed.diagnostics
        );
        let mut program = parsed.program;

        // Find the logger through the export map rather than by the local name
        // that the bundler happened to give it.
        let aliases = export_aliases()?;
        let alias = aliases
            .get(DEBUG_LOG_EXPORT)
            .context("the shipped runtime does not export debugLog")?;
        let logger = program
            .body
            .iter()
            .find_map(|statement| {
                let Statement::ExportNamedDeclaration(export) = statement else {
                    return None;
                };
                export
                    .specifiers
                    .iter()
                    .find(|specifier| specifier.exported.name() == *alias)
                    .map(|specifier| specifier.local.name().to_string())
            })
            .context("the shipped runtime does not define debugLog")?;

        // The setting is a parameter of the function the statements are placed in,
        // so it stays a free name here and is not moved into the namespace below.
        // There it has already been resolved against the environment.
        let initializer = if per_instance {
            debug_logger(&format!("{namespace}{INSTANCE_DEBUG}"))
        } else {
            debug_log_initializer(None)
        };
        let initializer = allocator.alloc_str(&initializer);
        let mut replaced = false;
        for statement in &mut program.body {
            let Statement::VariableDeclaration(declaration) = statement else {
                continue;
            };
            for declarator in &mut declaration.declarations {
                let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
                    continue;
                };
                if identifier.name != logger.as_str() {
                    continue;
                }
                let expression = Parser::new(&allocator, initializer, SourceType::mjs())
                    .parse_expression()
                    .map_err(|errors| anyhow::anyhow!("invalid debug initializer: {errors:?}"))?;
                declarator.init = Some(expression);
                replaced = true;
            }
        }
        ensure!(
            replaced,
            "the shipped runtime does not declare debugLog as a variable"
        );

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
            let original = scoping.symbol_name(symbol);
            ensure!(
                ![
                    INSTANCE_RUNTIME,
                    INSTANCE_DEBUG,
                    RUNTIMES,
                    RUNTIME_OF_INSTANCE
                ]
                .contains(&original),
                "the shipped runtime declares {original}, which the linker reserves"
            );
            let name = format!("{namespace}{original}");
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

        // Keep the annotations that mark calls as free of side effects: this code is
        // parsed again once linked, and what is unreachable is only removed then.
        let code = Codegen::new()
            .with_options(CodegenOptions {
                comments: CommentOptions {
                    annotation: true,
                    ..CommentOptions::disabled()
                },
                ..Default::default()
            })
            .with_scoping(Some(scoping))
            .build(&program)
            .code;
        Ok(Self { code, exports })
    }

    /// The runtime under the default namespace, prepared once per process for each
    /// of the two ways it is placed in bindings.
    fn shared(per_instance: bool) -> Result<&'static Self> {
        static PER_MODULE: OnceLock<std::result::Result<Runtime, String>> = OnceLock::new();
        static PER_INSTANCE: OnceLock<std::result::Result<Runtime, String>> = OnceLock::new();
        let shared = if per_instance {
            &PER_INSTANCE
        } else {
            &PER_MODULE
        };
        shared
            .get_or_init(|| {
                Self::with_namespace(NAMESPACE, per_instance).map_err(|error| format!("{error:#}"))
            })
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

/// The exported `instantiate` function of generated bindings, if they have one.
fn instantiate_function<'a, 'b>(
    statements: &'b mut [Statement<'a>],
) -> Option<&'b mut Function<'a>> {
    statements.iter_mut().find_map(|statement| {
        let Statement::ExportDeclaration(export) = statement else {
            return None;
        };
        let Declaration::FunctionDeclaration(function) = &mut export.declaration else {
            return None;
        };
        let is_instantiate = function
            .id
            .as_ref()
            .is_some_and(|identifier| identifier.name == "instantiate");
        is_instantiate.then_some(&mut **function)
    })
}

/// Bundle the shipped runtime into `generated`, keeping only the code it uses.
///
/// `per_instance` gives each call of the `instantiate` function that `generated`
/// exports the runtime whose debug logging follows the `debug` property of that
/// function's fourth parameter, shared with the other calls that choose the same.
/// Otherwise the module has a single runtime.
///
/// Returns `None` when `generated` imports nothing from the runtime, in which case
/// it needs no linking and is best left exactly as generated. All other imports,
/// such as a component's own imports, are left in place.
pub(crate) fn link(
    generated: &str,
    per_instance: bool,
    profile: RuntimeProfile,
) -> Result<Option<String>> {
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
        Runtime::shared(per_instance)?
    } else {
        owned_runtime = Runtime::with_namespace(&namespace, per_instance)?;
        &owned_runtime
    };

    // Pair each imported name with the runtime's implementation of it.
    let aliases = export_aliases()?;
    let mut imported: Vec<(&str, &str)> = Vec::new();
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
            imported.push((specifier.local.name.as_str(), target.as_str()));
        }
    }
    bindings
        .body
        .retain(|statement| runtime_subpath(statement).is_none());

    let runtime_code = if per_instance {
        let instantiate = instantiate_function(&mut bindings.body)
            .context("bindings that take instantiation options export no instantiate function")?;
        // A runtime without diagnostics has nothing to log, so there the logging
        // choice of an instance selects nothing and every instance shares one runtime.
        let logs = !profile.dropped_labels().contains(&"DEBUG");
        // The options are the fourth parameter, whatever the bindings call it.
        let setting = match instantiate.params.items.get(3).map(|item| &item.pattern) {
            _ if !logs => String::new(),
            Some(BindingPattern::BindingIdentifier(options)) => format!("{}?.debug", options.name),
            _ => "undefined".to_string(),
        };

        // Find the instance's runtime before anything else in `instantiate`,
        // binding the imported names there as the import declarations did.
        let function = format!("{namespace}{INSTANCE_RUNTIME}");
        let lookup = format!("{namespace}{RUNTIME_OF_INSTANCE}");
        let runtimes = format!("{namespace}{RUNTIMES}");
        let debug = format!("{namespace}{INSTANCE_DEBUG}");
        let bound: Vec<String> = imported
            .iter()
            .map(|(local, target)| format!("{target}: {local}"))
            .collect();
        let binding = allocator.alloc_str(&format!(
            "const {{ {} }} = {lookup}({setting});",
            bound.join(", ")
        ));
        let parsed = Parser::new(&allocator, binding, SourceType::mjs()).parse();
        ensure!(
            parsed.diagnostics.is_empty(),
            "the binding of the runtime does not parse: {:?}",
            parsed.diagnostics
        );
        let body = instantiate
            .body
            .as_mut()
            .context("the instantiate function has no body")?;
        body.statements.splice(0..0, parsed.program.body);

        // Returning only what the bindings import leaves the rest unreachable.
        let targets: BTreeSet<&str> = imported.iter().map(|(_, target)| *target).collect();
        let targets: Vec<&str> = targets.into_iter().collect();
        // The environment is read for each instance that makes no choice of its
        // own, as it would be were the runtime created for that instance alone.
        let enabled = debug_log_enabled(Some(&debug));
        let choice = if logs {
            format!(
                "const {runtimes} = [void 0, void 0];\n\
                 function {lookup}({debug}) {{\n\
                 const logging = ({enabled}) ? 1 : 0;\n\
                 if ({runtimes}[logging] === void 0) {{ {runtimes}[logging] = {function}(logging === 1); }}\n\
                 return {runtimes}[logging];\n}}\n"
            )
        } else {
            format!(
                "let {runtimes};\n\
                 function {lookup}() {{\n\
                 if ({runtimes} === void 0) {{ {runtimes} = {function}(false); }}\n\
                 return {runtimes};\n}}\n"
            )
        };
        format!(
            "function {function}({debug}) {{\n{}\nreturn {{ {} }};\n}}\n{choice}",
            runtime.code,
            targets.join(", ")
        )
    } else {
        let mut code = format!("{}\n", runtime.code);
        for (local, target) in &imported {
            code.push_str(&format!("const {local} = {target};\n"));
        }
        code
    };

    // Directives only take effect at the start of a module, so keep them first.
    let directives: String = bindings
        .directives
        .iter()
        .map(|directive| format!("{};\n", directive.span.source_text(generated)))
        .collect();
    bindings.directives.clear();
    let bindings = Codegen::new().build(&bindings).code;

    let linked = format!("{directives}{runtime_code}\n{bindings}");
    let parsed = Parser::new(&allocator, &linked, SourceType::mjs()).parse();
    ensure!(
        parsed.diagnostics.is_empty(),
        "bindings linked with the runtime do not parse: {:?}",
        parsed.diagnostics
    );
    let mut program = parsed.program;
    // Labeled statements go before what only they reach is looked for, so that
    // the arguments of a removed diagnostic are removed with it.
    let mut compress = CompressOptions::dce();
    compress.drop_labels = profile
        .dropped_labels()
        .iter()
        .map(|label| label.to_string())
        .collect();
    let reduced = Minifier::new(MinifierOptions {
        mangle: None,
        mangle_properties: None,
        compress: Some(compress),
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
    use super::{NAMESPACE, PACKAGE, RUNTIME_SOURCE};
    use crate::RuntimeProfile;

    /// Link with every labeled statement kept, as the tests of linking itself expect.
    fn link(generated: &str, per_instance: bool) -> anyhow::Result<Option<String>> {
        super::link(generated, per_instance, RuntimeProfile::Debug)
    }

    #[test]
    fn shipped_runtime_uses_only_reserved_globals() {
        use super::{Allocator, Parser, SemanticBuilder, SourceType};
        use crate::intrinsics::PLATFORM_GLOBALS;

        // Bindings declare local names in the scope the runtime is bundled into,
        // so a global the runtime uses must never be available as a local name.
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, RUNTIME_SOURCE, SourceType::mjs()).parse();
        let semantics = SemanticBuilder::new().build(&parsed.program);
        let unreserved: Vec<_> = semantics
            .semantic
            .scoping()
            .root_unresolved_references()
            .keys()
            .map(|name| name.as_str())
            .filter(|name| !PLATFORM_GLOBALS.contains(name))
            .collect();
        assert!(
            unreserved.is_empty(),
            "the shipped runtime uses globals that are not reserved: {unreserved:?}"
        );
    }

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
        let linked = link(source, false).unwrap().unwrap();
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
    fn defines_the_logger_once_for_a_module() {
        let source = r#"
            import { withCurrentTaskMeta } from '@bytecodealliance/jco-cm-runtime/intrinsics/core';
            export const run = () => withCurrentTaskMeta({}, { componentIdx: 0, taskID: 1, threadID: 1, fn: () => 42 });
        "#;
        let linked = link(source, false).unwrap().unwrap();
        assert!(linked.contains("globalThis?.process?.env?.JCO_DEBUG ?"));
        assert_eq!(linked.matches("JCO_DEBUG").count(), 1);
        assert!(!linked.contains(&format!("{NAMESPACE}$")));
    }

    #[test]
    fn shares_a_runtime_between_instances_outside_instantiate() {
        // The local names of imports are declared in `instantiate`, and may be those
        // of globals the runtime uses.
        let source = r#"
            import { withCurrentTaskMeta as runTask } from '@bytecodealliance/jco-cm-runtime/intrinsics/core';
            export function instantiate(getCoreModule, imports, instantiateCore, settings) {
                const { Map, setTimeout } = imports.host;
                return { run: () => runTask({}, { componentIdx: 0, taskID: 1, threadID: 1, fn: () => new Map(setTimeout) }) };
            }
        "#;
        let linked = link(source, true).unwrap().unwrap();
        let runtime = format!("function {NAMESPACE}$instance({NAMESPACE}$debug) {{");
        assert!(linked.starts_with(&runtime));

        // Everything of the runtime precedes `instantiate`, so none of it is in
        // the scope of the names declared there.
        let instantiate = linked.find("export function instantiate(").unwrap();
        let implementation = format!("{NAMESPACE}withCurrentTaskMeta");
        assert!(linked.find(&implementation).unwrap() < instantiate);
        let binding =
            format!("{{ {implementation}: runTask }} = {NAMESPACE}$runtime(settings?.debug);");
        assert!(linked[instantiate..].contains(&binding));
        assert_eq!(linked[instantiate..].matches(NAMESPACE).count(), 2);

        // The choice of the instance takes precedence over the environment, and
        // selects one of the two runtimes that instances share.
        let choice = linked
            .lines()
            .find(|line| line.contains("JCO_DEBUG"))
            .expect("the runtime of an instance is chosen by its logging");
        assert!(
            choice.contains(&format!("{NAMESPACE}$debug ?? ")),
            "{choice}"
        );
        assert_eq!(linked.matches("JCO_DEBUG").count(), 1);
        assert_eq!(linked.matches(&format!("{NAMESPACE}$instance(")).count(), 2);
        assert!(linked.contains(&format!("{NAMESPACE}$runtimes[")));
    }

    #[test]
    fn keeps_only_the_reachable_runtime_of_an_instance() {
        let source = r#"
            import { toInt8 } from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';
            export function instantiate() { return { run: (value) => toInt8({ strict: false }, value) }; }
        "#;
        let linked = link(source, true).unwrap().unwrap();
        assert!(linked.contains(&format!("return {{ {NAMESPACE}toInt8 }};")));
        assert!(!linked.contains("TextEncoder"));
        assert!(!linked.contains("console.debug"));
    }

    #[test]
    fn shares_one_runtime_between_instances_without_diagnostics() {
        let source = r#"
            import { withCurrentTaskMeta as runTask } from '@bytecodealliance/jco-cm-runtime/intrinsics/core';
            export function instantiate(getCoreModule, imports, instantiateCore, settings) {
                return { run: () => runTask({}, { componentIdx: 0, taskID: 1, threadID: 1, fn: () => 1 }) };
            }
        "#;
        let linked = super::link(source, true, RuntimeProfile::Checked)
            .unwrap()
            .unwrap();
        // The logging choice of an instance is not read, nor is the environment.
        assert!(linked.contains(&format!("= {NAMESPACE}$runtime();")));
        assert!(!linked.contains("settings?.debug"));
        assert!(!linked.contains("JCO_DEBUG"));
        assert!(!linked.contains("console.debug"));
        assert_eq!(linked.matches(&format!("{NAMESPACE}$instance(")).count(), 2);
    }

    #[test]
    fn profiles_remove_labeled_statements_and_what_only_they_reach() {
        let source = r#"
            import { initializeRepTableClass } from '@bytecodealliance/jco-cm-runtime/intrinsics/core';
            export const RepTable = initializeRepTableClass({ RuntimeError: Error });
        "#;
        let diagnostic = "[RepTable#insert()] args";
        let assertion = "corrupt rep table freelist";
        let trap = "invalid resource rep during get";
        for (profile, diagnostics, assertions) in [
            (RuntimeProfile::Debug, true, true),
            (RuntimeProfile::Checked, false, true),
        ] {
            let linked = super::link(source, false, profile).unwrap().unwrap();
            assert_eq!(linked.contains(diagnostic), diagnostics, "{profile:?}");
            assert_eq!(linked.contains("DEBUG:"), diagnostics, "{profile:?}");
            assert_eq!(linked.contains(assertion), assertions, "{profile:?}");
            // Validation of what callers pass is kept by every profile.
            assert!(linked.contains(trap), "{profile:?}");
        }
        assert_eq!(RuntimeProfile::default(), RuntimeProfile::Checked);
    }

    #[test]
    fn requires_instantiate_for_a_runtime_of_each_instance() {
        let source = "import { toInt8 } from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion'; export { toInt8 };";
        let error = link(source, true).unwrap_err();
        assert!(error.to_string().contains("export no instantiate function"));
    }

    #[test]
    fn leaves_modules_without_runtime_imports_untouched() {
        assert!(
            link("import { consume } from 'consumer'; consume();", false)
                .unwrap()
                .is_none()
        );
        // Mentioning the package without importing from it is not a runtime import.
        let mention = "export const name = '@bytecodealliance/jco-cm-runtime/runtime';";
        assert!(link(mention, false).unwrap().is_none());
    }

    #[test]
    fn uses_the_default_namespace_when_it_is_free() {
        let source = "import { toInt8 } from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion'; export { toInt8 };";
        let linked = link(source, false).unwrap().unwrap();
        assert!(linked.contains(&format!("{NAMESPACE}toInt8")));
        assert!(!linked.contains(&format!("{NAMESPACE}$")));
    }

    #[test]
    fn reports_missing_runtime_exports() {
        let error = link("import { missing } from '@bytecodealliance/jco-cm-runtime/runtime'; export { missing };", false).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("runtime module runtime has no export missing")
        );
    }

    #[test]
    fn rejects_namespace_imports_of_the_runtime() {
        let error = link(
            "import * as runtime from '@bytecodealliance/jco-cm-runtime/runtime'; export { runtime };", false,
        )
        .unwrap_err();
        assert!(error.to_string().contains("must use named imports"));
    }
}
