//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use tempdir::TempDir;
use xshell::{cmd, Shell};

#[test]
fn api_proxy_streaming() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let file_name = "api_proxy_streaming";
    let tempdir = TempDir::new("{file_name}")?;
    let wasi_file = test_utils::compile(&sh, &tempdir, &file_name)?;
    let _ = fs::remove_dir_all("./tests/rundir/api_proxy_streaming");

    let cmd = cmd!(sh, "node ./src/jco.js serve  --jco-dir ./tests/rundir/api_proxy_streaming --jco-import ./tests/virtualenvs/base.js {wasi_file} hello this '' 'is an argument' 'with 🚩 emoji'");

    cmd.run()?;
    Ok(())
}
