use anyhow::{Context, bail, ensure};
use oxc_allocator::Allocator;
use oxc_ast::ast::{ImportDeclarationSpecifier, Statement};
use oxc_codegen::{Codegen, CodegenOptions, CommentOptions};
use oxc_minifier::{CompressOptions, Minifier, MinifierOptions};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_str::Ident;
use std::collections::HashMap;

const PACKAGE: &str = "@bytecodealliance/jco-cm-runtime/";

/// Reduce generated bindings together with the embedded Component Model runtime.
pub(crate) fn reduce(generated: &str) -> anyhow::Result<String> {
    let runtime = include_str!("../runtime/runtime-all.js");
    let export_map = include_str!("../runtime/runtime-export-map.tsv");
    // Reserve a namespace absent from both sources, including nested bindings.
    let mut prefix = "__jcoEmbeddedRuntime$".to_string();
    while generated.contains(&prefix) || runtime.contains(&prefix) {
        prefix.push('$');
    }
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, runtime, SourceType::mjs()).parse();
    ensure!(
        parsed.diagnostics.is_empty(),
        "invalid runtime or bindings: {:?}",
        parsed.diagnostics
    );
    let mut program = parsed.program;
    let semantics = SemanticBuilder::new().build(&program);
    ensure!(
        semantics.diagnostics.is_empty(),
        "invalid runtime bindings: {:?}",
        semantics.diagnostics
    );
    let mut scoping = semantics.semantic.into_scoping();
    let root = scoping.root_scope_id();
    let bindings: Vec<_> = scoping.get_bindings(root).values().copied().collect();
    for symbol in bindings {
        let name = format!("{prefix}{}", scoping.symbol_name(symbol));
        scoping.rename_symbol(symbol, root, Ident::from(allocator.alloc_str(&name)));
    }
    let mut bundle_exports = HashMap::new();
    program.body.retain(|statement| {
        if let Statement::ExportNamedDeclaration(export) = statement {
            for specifier in &export.specifiers {
                let local = specifier.local.name();
                bundle_exports.insert(
                    specifier.exported.name().to_string(),
                    format!("{prefix}{local}"),
                );
            }
            false
        } else {
            true
        }
    });
    let prelude = Codegen::new()
        .with_options(CodegenOptions {
            comments: CommentOptions::disabled(),
            ..Default::default()
        })
        .with_scoping(Some(scoping))
        .build(&program)
        .code;
    let mapping: HashMap<_, _> = export_map
        .lines()
        .map(|line| line.split_once('\t').unwrap())
        .collect();
    let parsed = Parser::new(&allocator, generated, SourceType::mjs()).parse();
    ensure!(
        parsed.diagnostics.is_empty(),
        "invalid runtime or bindings: {:?}",
        parsed.diagnostics
    );
    let mut body = parsed.program;
    let mut aliases = String::new();
    for statement in &body.body {
        let Statement::ImportDeclaration(import) = statement else {
            continue;
        };
        let Some(suffix) = import
            .source
            .value
            .as_str()
            .and_then(|value| value.strip_prefix(PACKAGE))
        else {
            continue;
        };
        for specifier in import
            .specifiers
            .as_ref()
            .context("runtime import must have bindings")?
        {
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                bail!("embedded runtime requires named imports");
            };
            let key = format!("{suffix}:{}", specifier.imported.name());
            let alias = mapping
                .get(key.as_str())
                .with_context(|| format!("missing runtime export {key}"))?;
            let target = bundle_exports
                .get(*alias)
                .context("missing embedded runtime symbol")?;
            aliases.push_str(&format!("const {} = {target};\n", specifier.local.name));
        }
    }
    body.body.retain(|statement| {
        !matches!(statement, Statement::ImportDeclaration(import)
        if import.source.value.as_str().is_some_and(|value| value.starts_with(PACKAGE)))
    });
    let combined = format!("{prelude}\n{aliases}\n{}", Codegen::new().build(&body).code);
    let parsed = Parser::new(&allocator, &combined, SourceType::mjs()).parse();
    ensure!(
        parsed.diagnostics.is_empty(),
        "invalid linked runtime: {:?}",
        parsed.diagnostics
    );
    let mut program = parsed.program;
    let minimized = Minifier::new(MinifierOptions {
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
        .with_scoping(minimized.scoping)
        .build(&program)
        .code;
    Ok(format!("\"use components\";\n{code}"))
}

#[cfg(test)]
mod tests {
    use super::reduce;

    #[test]
    fn retains_consumer_imports_and_avoids_name_capture() {
        let source = r#"
            import { toInt8 } from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';
            import { consume } from 'consumer';
            export const __jcoEmbeddedRuntime$toInt8 = 42;
            export function run(value) { return consume(toInt8({ strict: false }, value)); }
            export const location = import.meta.url;
        "#;
        let reduced = reduce(source).unwrap();
        assert!(!reduced.contains("@bytecodealliance/jco-cm-runtime"));
        assert!(reduced.contains("consumer"));
        assert!(reduced.contains("import.meta.url"));
        assert!(reduced.contains("__jcoEmbeddedRuntime$toInt8 = 42"));
        assert!(!reduced.contains("TextEncoder"));
        assert!(reduced.starts_with("\"use components\";"));
    }

    #[test]
    fn reports_missing_runtime_exports() {
        let error = reduce("import { missing } from '@bytecodealliance/jco-cm-runtime/runtime'; export { missing };").unwrap_err();
        assert!(error.to_string().contains("missing runtime export"));
    }
}
