//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use xshell::{cmd, Shell};

#[test]
fn preview1_file_truncation() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let wasi_file = "./tests/rundir/preview1_file_truncation.component.wasm";
    let _ = fs::remove_dir_all("./tests/rundir/preview1_file_truncation");

    let cmd = cmd!(sh, "node ./src/jco.js run  --jco-dir ./tests/rundir/preview1_file_truncation --jco-import ./tests/virtualenvs/scratch.js {wasi_file} hello this '' 'is an argument' 'with 🚩 emoji'");

    cmd.run()?;
    Ok(())
}
