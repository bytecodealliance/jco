use std::path::PathBuf;
use std::sync::LazyLock;
use xshell::{Shell, cmd};

use anyhow::{Context as _, Result};

static WORKSPACE_DIR: LazyLock<PathBuf> =
    LazyLock::new(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../"));

/// Build the test component binaries
///
/// Building the `test-components/artifacts` project is what actually builds
/// the code that is in the `test-programs` crate (i.e. via the build.rs script)
pub(crate) fn run() -> Result<()> {
    let sh = Shell::new().context("failed to build shell")?;
    sh.change_dir(WORKSPACE_DIR.join("./crates/test-components"));
    cmd!(sh, "cargo build")
        .read()
        .context("failed to read output from cargo build")?;

    sh.change_dir(WORKSPACE_DIR.join("./crates/test-components/artifacts"));
    cmd!(sh, "cargo clean")
        .read()
        .context("failed to clean output from cargo build")?;
    cmd!(sh, "cargo build")
        .read()
        .context("failed to read output from cargo build")?;

    Ok(())
}
