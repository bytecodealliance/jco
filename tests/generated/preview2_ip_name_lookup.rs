//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use tempdir::TempDir;
use xshell::{cmd, Shell};

#[test]
fn preview2_ip_name_lookup() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let file_name = "preview2_ip_name_lookup";
    let tempdir = TempDir::new("{file_name}")?;
    let wasi_file = test_utils::compile(&sh, &tempdir, &file_name)?;
    let _ = fs::remove_dir_all("./tests/rundir/preview2_ip_name_lookup");

    let cmd = cmd!(sh, "node ./src/jco.js run  --jco-dir ./tests/rundir/preview2_ip_name_lookup --jco-import ./tests/virtualenvs/base.js {wasi_file} hello this '' 'is an argument' 'with 🚩 emoji'");

    let cmd = cmd
        .env("JCO_RUN_PATH", "deno")
        .env("JCO_RUN_ARGS", "run --importmap importmap.json -A");
    cmd.run()?;
    Ok(())
}
