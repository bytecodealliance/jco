use std::path::PathBuf;
use std::sync::LazyLock;

use anyhow::{Result, bail};

static WORKSPACE_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    // NOTE this goes to the xtask dir
    let xtask_manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    xtask_manifest_dir.join("../../")
});

/// Build the test binaries
pub(crate) fn run() -> Result<()> {
    
    Ok(())
}
