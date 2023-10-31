//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use tempdir::TempDir;
use xshell::{cmd, Shell};

#[test]
fn preview2_udp_sockopts() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let file_name = "preview2_udp_sockopts";
    let tempdir = TempDir::new("{file_name}")?;
    let wasi_file = test_utils::compile(&sh, &tempdir, &file_name)?;
    cmd!(sh, "./src/jco.js run {wasi_file}").run()?;
    Ok(())
}
