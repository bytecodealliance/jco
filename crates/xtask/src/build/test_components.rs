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
    let _ = WORKSPACE_DIR;
    let sh = Shell::new().context("failed to build shell")?;
    cmd!(sh, "cargo build -p jco-test-components")
        .read()
        .context("failed to read output from cargo build")?;
    cmd!(sh, "cargo clean -p jco-test-components-artifacts")
        .read()
        .context("failed to clean output from cargo build")?;
    cmd!(sh, "cargo build -p jco-test-components-artifacts")
        .read()
        .context("failed to read output from cargo build")?;
    Ok(())
}
