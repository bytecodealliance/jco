//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use xshell::{cmd, Shell};

#[test]
fn preview1_close_preopen() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let wasi_file = "./tests/rundir/preview1_close_preopen.component.wasm";
    let _ = fs::remove_dir_all("./tests/rundir/preview1_close_preopen");

    let cmd = cmd!(sh, "node ./src/jco.js run  --jco-dir ./tests/rundir/preview1_close_preopen --jco-import ./tests/virtualenvs/scratch.js {wasi_file} hello this '' 'is an argument' 'with 🚩 emoji'");

    cmd.run()?;
    Ok(())
}
