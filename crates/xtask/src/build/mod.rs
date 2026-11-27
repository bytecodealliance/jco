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
pub(crate) fn compile_jco_typescript() -> Result<()> {
    let sh = Shell::new()?;
    // The CLI imports the workspace transpiler during type checking and at run time.
    // Its generated bindings now exist in jco/obj, including during release bootstrap.
    cmd!(
        sh,
        "pnpm run --filter '@bytecodealliance/jco-transpile' setup:jco:vendor"
    )
    .run()?;
    cmd!(
        sh,
        "pnpm run --filter '@bytecodealliance/jco-transpile' build:ts"
    )
    .run()?;
    cmd!(sh, "pnpm run --filter '@bytecodealliance/jco' build:ts").run()?;
    Ok(())
}
