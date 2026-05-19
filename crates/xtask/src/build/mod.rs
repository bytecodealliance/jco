use std::path::PathBuf;
use std::sync::LazyLock;

use anyhow::Result;
use xshell::{Shell, cmd};

pub(crate) mod jco;
pub(crate) mod test_components;
pub(crate) mod workspace;

pub(crate) static WORKSPACE_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    let xtask_manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    xtask_manifest_dir.join("../../")
});

/// Generate TypeScript type declarations for the `@bytecodealliance/jco` package.
///
/// This must run after [transpile_components] (or `npm run build`) because `src/api.js`
/// uses types from `obj/wasm-tools.js`.
///
pub(crate) fn generate_jco_type_declarations() -> Result<()> {
    let sh = Shell::new()?;
    sh.change_dir(WORKSPACE_DIR.join("packages/jco"));
    let output = cmd!(sh, "pnpm exec tsc").ignore_status().output()?;
    if let Ok(stdout) = String::from_utf8(output.stdout) {
        eprintln!("STDOUT:\n{stdout}\n");
    }
    if let Ok(stderr) = String::from_utf8(output.stderr) {
        eprintln!("STDERR:\n{stderr}\n");
    }
    assert!(output.status.success());
    Ok(())
}
