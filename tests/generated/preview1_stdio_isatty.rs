//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use tempdir::TempDir;
use xshell::{cmd, Shell};
use std::fs;

#[test]
fn preview1_stdio_isatty() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let file_name = "preview1_stdio_isatty";
    let tempdir = TempDir::new("{file_name}")?;
    let wasi_file = test_utils::compile(&sh, &tempdir, &file_name)?;
    let _ = fs::remove_dir_all("./tests/rundir/preview1_stdio_isatty");
    cmd!(sh, "./src/jco.js run  --jco-dir ./tests/rundir/preview1_stdio_isatty --jco-import ./tests/virtualenvs/scratch.js {wasi_file} hello this '' 'is an argument' 'with 🚩 emoji'").run()?;
    Ok(())
}
