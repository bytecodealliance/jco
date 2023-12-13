//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use xshell::{cmd, Shell};

#[test]
fn cli_exit_panic() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let wasi_file = "./tests/rundir/cli_exit_panic.component.wasm";
    let _ = fs::remove_dir_all("./tests/rundir/cli_exit_panic");

    let cmd = cmd!(sh, "node ./src/jco.js run  --jco-dir ./tests/rundir/cli_exit_panic --jco-import ./tests/virtualenvs/base.js {wasi_file} hello this '' 'is an argument' 'with 🚩 emoji'");

    cmd.run().expect_err("test should exit with code 1");
    Ok(())
}
