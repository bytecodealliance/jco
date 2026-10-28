use std::path::PathBuf;
use std::sync::LazyLock;

use anyhow::Result;
use xshell::{Shell, cmd};

pub(crate) mod jco;
pub(crate) mod test_components;
pub(crate) mod wast_fixtures;
pub(crate) mod workspace;

pub(crate) static WORKSPACE_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    let xtask_manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    xtask_manifest_dir.join("../../")
});

/// Compile the TypeScript runtime and declarations for the `@bytecodealliance/jco` package.
///
/// This must run after [transpile_components] (or `npm run build`) because `src/api.ts`
/// uses types from `obj/wasm-tools.js`.
///
/// The steps are ordered explicitly because the two packages depend on each other at
/// build time: `@bytecodealliance/jco` declares `@bytecodealliance/jco-transpile` as a
/// workspace dependency (rather than a published version), so its TypeScript compiles
/// against `packages/jco-transpile/dist`, while jco-transpile's declarations are
/// generated from the components this task just transpiled into `packages/jco/obj`.
/// Running jco-transpile's own `build` script here would recurse into jco's build, so
/// only its vendor and `tsc` steps are invoked.
///
/// TODO(publish-jco-transpile): drop steps 1 and 2 once `@bytecodealliance/jco` depends
/// on a published jco-transpile again; the workspace dependency is temporary.
pub(crate) fn compile_jco_typescript() -> Result<()> {
    let sh = Shell::new()?;
    // 1. Copy the freshly transpiled components into jco-transpile's `vendor/`.
    cmd!(
        sh,
        "pnpm run --filter '@bytecodealliance/jco-transpile' setup:jco:vendor"
    )
    .run()?;
    // 2. Emit jco-transpile's `dist/`, which jco's imports resolve to.
    cmd!(
        sh,
        "pnpm run --filter '@bytecodealliance/jco-transpile' build:ts"
    )
    .run()?;
    // 3. Compile jco itself against those declarations.
    cmd!(sh, "pnpm run --filter '@bytecodealliance/jco' build:ts").run()?;
    Ok(())
}
