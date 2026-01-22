use std::path::PathBuf;
use std::sync::LazyLock;

use anyhow::{Result, bail};

static WORKSPACE_DIR: LazyLock<PathBuf> =
    LazyLock::new(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../"));

/// Build the test binaries
pub(crate) fn run() -> Result<()> {
    let _ = WORKSPACE_DIR;
    bail!("not implemented")
}
